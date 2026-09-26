import { db, type LocalMessage, type MessageStatus } from '../db'
import { api, type MatchRecord } from './supabase'

export type P2PPacket = 
  | { type: 'chat'; id: string; senderId: string; text?: string; media?: { blob: string; mimeType: string }; timestamp: number }
  | { type: 'ack'; messageId: string; status: 'delivered' | 'read' }

export type ConnectionState = 
  | 'idle'
  | 'waiting_for_female_initiation'
  | 'signaling'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'

export interface P2PChatCallbacks {
  onMessageReceived: (message: LocalMessage) => void
  onAckReceived: (messageId: string, status: MessageStatus) => void
  onConnectionStateChange: (state: ConnectionState) => void
  onError: (error: string) => void
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export class P2PChatEngine {
  private matchId: string
  private currentUserId: string
  private isFemale: boolean
  private matchInfo: MatchRecord
  private callbacks: P2PChatCallbacks
  private isChatWindowActive: boolean = true

  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private signalSubscription: { send: (payload: any) => Promise<void>; unsubscribe: () => void } | null = null
  private pendingCandidates: RTCIceCandidateInit[] = []
  private connectionState: ConnectionState = 'idle'
  private isDestroyed: boolean = false

  constructor(
    matchInfo: MatchRecord,
    currentUserId: string,
    isFemale: boolean,
    callbacks: P2PChatCallbacks
  ) {
    this.matchId = matchInfo.id
    this.currentUserId = currentUserId
    this.isFemale = isFemale
    this.matchInfo = matchInfo
    this.callbacks = callbacks
  }

  public updateMatchInfo(updated: MatchRecord): void {
    this.matchInfo = updated
  }

  public setChatWindowActive(active: boolean): void {
    this.isChatWindowActive = active
    if (active && this.dataChannel && this.dataChannel.readyState === 'open') {
      this.markAllUnreadAsRead()
    }
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState
  }

  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state
    this.callbacks.onConnectionStateChange(state)
  }

  /**
   * Initializes the P2P connection respecting Female-First initiation rules.
   */
  public async initialize(): Promise<void> {
    if (this.isDestroyed) return

    // Female-First check
    if (!this.isFemale && !this.matchInfo.has_female_initiated) {
      this.setConnectionState('waiting_for_female_initiation')
      return
    }

    this.setConnectionState('signaling')
    this.setupSignaling()
    this.createPeerConnection()

    if (this.isFemale) {
      // Female client initiates the offer and registers initiation in Supabase
      try {
        await api.setFemaleInitiated(this.matchId)
        this.matchInfo.has_female_initiated = true
        this.setupDataChannel(this.peerConnection!.createDataChannel('p2p-chat', {
          ordered: true,
        }))
        const offer = await this.peerConnection!.createOffer()
        await this.peerConnection!.setLocalDescription(offer)
        await this.signalSubscription?.send({
          type: 'offer',
          senderId: this.currentUserId,
          sdp: offer,
        })
      } catch (err: any) {
        console.error('Error creating female-first offer:', err)
        this.callbacks.onError('Failed to initiate secure peer connection')
        this.setConnectionState('failed')
      }
    }
  }

  private createPeerConnection(): void {
    if (this.peerConnection) return

    this.peerConnection = new RTCPeerConnection(RTC_CONFIG)

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.signalSubscription) {
        this.signalSubscription.send({
          type: 'candidate',
          senderId: this.currentUserId,
          candidate: event.candidate.toJSON(),
        }).catch((err) => console.error('Failed to send ICE candidate', err))
      }
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      if (!this.peerConnection) return
      const state = this.peerConnection.iceConnectionState
      if (state === 'connected' || state === 'completed') {
        this.setConnectionState('connected')
      } else if (state === 'disconnected') {
        this.setConnectionState('disconnected')
      } else if (state === 'failed') {
        this.setConnectionState('failed')
      } else if (state === 'checking') {
        this.setConnectionState('connecting')
      }
    }

    this.peerConnection.ondatachannel = (event) => {
      this.setupDataChannel(event.channel)
    }
  }

  private setupDataChannel(channel: RTCDataChannel): void {
    this.dataChannel = channel

    this.dataChannel.onopen = () => {
      this.setConnectionState('connected')
      if (this.isChatWindowActive) {
        this.markAllUnreadAsRead()
      }
    }

    this.dataChannel.onclose = () => {
      this.setConnectionState('disconnected')
    }

    this.dataChannel.onerror = (err) => {
      console.error('WebRTC DataChannel error:', err)
      this.callbacks.onError('Data channel connection error')
    }

    this.dataChannel.onmessage = async (event) => {
      try {
        const packet: P2PPacket = JSON.parse(event.data)
        await this.handleIncomingPacket(packet)
      } catch (err) {
        console.error('Failed to parse incoming packet:', err)
      }
    }
  }

  private setupSignaling(): void {
    if (this.signalSubscription) return

    this.signalSubscription = api.createSignalChannel(this.matchId, async (payload) => {
      if (!payload || payload.senderId === this.currentUserId) return

      try {
        if (payload.type === 'offer') {
          // Male peer receives offer from female peer
          if (!this.peerConnection) {
            this.createPeerConnection()
          }
          await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          await this.drainPendingCandidates()

          const answer = await this.peerConnection!.createAnswer()
          await this.peerConnection!.setLocalDescription(answer)
          await this.signalSubscription?.send({
            type: 'answer',
            senderId: this.currentUserId,
            sdp: answer,
          })
        } else if (payload.type === 'answer') {
          // Female peer receives answer from male peer
          if (this.peerConnection) {
            await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp))
            await this.drainPendingCandidates()
          }
        } else if (payload.type === 'candidate') {
          const candidate = new RTCIceCandidate(payload.candidate)
          if (this.peerConnection && this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(candidate)
          } else {
            this.pendingCandidates.push(payload.candidate)
          }
        }
      } catch (err) {
        console.error('Signaling processing error:', err)
      }
    })
  }

  private async drainPendingCandidates(): Promise<void> {
    if (!this.peerConnection) return
    while (this.pendingCandidates.length > 0) {
      const candidateInit = this.pendingCandidates.shift()
      if (candidateInit) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidateInit))
      }
    }
  }

  /**
   * Handles incoming packets over RTCDataChannel.
   * Enforces Media Guard, WhatsApp Ticks ACKs, and updates Dexie.js.
   */
  private async handleIncomingPacket(packet: P2PPacket): Promise<void> {
    if (packet.type === 'ack') {
      // Incoming ACK: update local message state and emit to UI
      await db.updateMessageStatus(packet.messageId, packet.status)
      this.callbacks.onAckReceived(packet.messageId, packet.status)
      return
    }

    if (packet.type === 'chat') {
      // --- MEDIA GUARD RULE ---
      // If packet contains media, and current user is female while sender is male,
      // inspect matches.media_allowed. If false, DROP PACKET IMMEDIATELY.
      if (packet.media && this.isFemale && !this.matchInfo.media_allowed) {
        console.warn('Media guard blocked unauthorized media transmission from male peer.')
        return
      }

      // Initial status when received:
      // If window is active & in viewport -> 'read'
      // Otherwise -> 'delivered'
      const initialStatus: MessageStatus = this.isChatWindowActive ? 'read' : 'delivered'

      const localMsg: LocalMessage = {
        id: packet.id,
        matchId: this.matchId,
        senderId: packet.senderId,
        text: packet.text,
        mediaBlob: packet.media?.blob,
        mediaType: packet.media?.mimeType,
        status: initialStatus,
        timestamp: packet.timestamp || Date.now(),
      }

      // Persist solely in local IndexedDB (zero server storage)
      await db.saveMessage(localMsg)
      this.callbacks.onMessageReceived(localMsg)

      // Instantly dispatch Delivery ACK
      this.sendPacket({
        type: 'ack',
        messageId: packet.id,
        status: 'delivered',
      })

      // If active in viewport, also emit Read ACK immediately
      if (this.isChatWindowActive) {
        this.sendPacket({
          type: 'ack',
          messageId: packet.id,
          status: 'read',
        })
      }
    }
  }

  /**
   * Send text or media message over RTCDataChannel.
   */
  public async sendMessage(text?: string, media?: { blob: string; mimeType: string }): Promise<LocalMessage> {
    // Check male media guard
    if (media && !this.isFemale && !this.matchInfo.media_allowed) {
      throw new Error('Only she can enable media sharing')
    }

    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      throw new Error('P2P connection is not open yet')
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = Date.now()

    const packet: P2PPacket = {
      type: 'chat',
      id: messageId,
      senderId: this.currentUserId,
      text,
      media,
      timestamp: now,
    }

    // 1. Single Gray Tick ('sent'): pushed into RTCDataChannel
    const localMsg: LocalMessage = {
      id: messageId,
      matchId: this.matchId,
      senderId: this.currentUserId,
      text,
      mediaBlob: media?.blob,
      mediaType: media?.mimeType,
      status: 'sent',
      timestamp: now,
    }

    await db.saveMessage(localMsg)
    this.sendPacket(packet)

    return localMsg
  }

  private sendPacket(packet: P2PPacket): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(packet))
    }
  }

  /**
   * Dispatches 'read' ACKs for all received messages when user looks at the chat room.
   */
  public async markAllUnreadAsRead(): Promise<void> {
    try {
      const messages = await db.getMessagesForMatch(this.matchId)
      const unreadFromPartner = messages.filter(
        (m) => m.senderId !== this.currentUserId && m.status !== 'read'
      )

      for (const msg of unreadFromPartner) {
        await db.updateMessageStatus(msg.id, 'read')
        this.sendPacket({
          type: 'ack',
          messageId: msg.id,
          status: 'read',
        })
      }
    } catch (err) {
      console.error('Error marking messages as read:', err)
    }
  }

  /**
   * Destroys the WebRTC peer connection and signaling channel cleanly.
   */
  public destroy(): void {
    this.isDestroyed = true
    if (this.signalSubscription) {
      this.signalSubscription.unsubscribe()
      this.signalSubscription = null
    }
    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }
    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }
    this.setConnectionState('idle')
  }
}
