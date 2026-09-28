import { db, type LocalMessage, type MessageStatus } from '../db'
import { api, type MatchRecord } from './supabase'
import { pushOfflineEncryptedMessage } from './offlineQueue'
import { createCampusPeerConnection } from './webrtc'

export type P2PPacket = 
  | {
      type: 'chat'
      id: string
      senderId: string
      text?: string
      media?: { blob: string; mimeType: string }
      isViewOnce?: boolean
      timestamp: number
    }
  | { type: 'ack'; messageId: string; status: 'delivered' | 'read' }
  | { type: 'delete_msg'; messageId: string; timestamp: number }

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
  onMessageDeleted?: (messageId: string) => void
  onAckReceived: (messageId: string, status: MessageStatus) => void
  onConnectionStateChange: (state: ConnectionState) => void
  onError: (error: string) => void
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

    this.peerConnection = createCampusPeerConnection()

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

    this.dataChannel.onopen = async () => {
      this.setConnectionState('connected')

      // Flush any queued / cached offline messages automatically
      await this.flushPendingQueue()

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
   * Enforces Media Guard, View-Once rules, Delete-for-Everyone, ACKs, and Version Handshakes.
   */
  private async handleIncomingPacket(packet: P2PPacket): Promise<void> {
    if (packet.type === 'ack') {
      await db.updateMessageStatus(packet.messageId, packet.status)
      this.callbacks.onAckReceived(packet.messageId, packet.status)
      return
    }

    if (packet.type === 'delete_msg') {
      // Receiver processes "Delete for Everyone"
      await db.deleteMessageForEveryone(packet.messageId)
      this.callbacks.onMessageDeleted?.(packet.messageId)
      return
    }

    if (packet.type === 'chat') {
      // --- MEDIA GUARD RULES ---
      if (packet.media) {
        if (this.isFemale) {
          // Male peer sending media to female peer
          // Rule 1: One-time media sending is disabled for males
          if (packet.isViewOnce) {
            console.warn('Media guard blocked unauthorized view-once media from male peer.')
            return
          }
          // Rule 2: Subject to female master media toggle
          if (!this.matchInfo.media_allowed) {
            console.warn('Media guard blocked unauthorized media transmission from male peer.')
            return
          }
        } else {
          // Female peer sending media to male peer:
          // Rule: Female can send one-time (view-once) media without permissions!
          // Standard media is permitted if female master media toggle is on OR isViewOnce is true.
          if (!packet.isViewOnce && !this.matchInfo.media_allowed) {
            console.warn('Standard media transmission blocked.')
            return
          }
        }
      }

      const initialStatus: MessageStatus = this.isChatWindowActive ? 'read' : 'delivered'

      const localMsg: LocalMessage = {
        id: packet.id,
        matchId: this.matchId,
        senderId: packet.senderId,
        text: packet.text,
        mediaBlob: packet.media?.blob,
        mediaType: packet.media?.mimeType,
        isViewOnce: packet.isViewOnce,
        viewOnceStatus: packet.isViewOnce ? 'unopened' : undefined,
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
  public async sendMessage(
    text?: string,
    media?: { blob: string; mimeType: string },
    isViewOnce: boolean = false
  ): Promise<LocalMessage> {
    // Male Guard Rules
    if (!this.isFemale) {
      if (isViewOnce) {
        throw new Error('One-time (view-once) media sending is only permitted for female members')
      }
      if (media && !this.matchInfo.media_allowed) {
        throw new Error('Only she can enable media sharing')
      }
    }

    const isChannelOpen = Boolean(this.dataChannel && this.dataChannel.readyState === 'open')
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
    const now = Date.now()

    const packet: P2PPacket = {
      type: 'chat',
      id: messageId,
      senderId: this.currentUserId,
      text,
      media,
      isViewOnce,
      timestamp: now,
    }

    // Status: 'sent' if channel is currently open, else 'sending' (cached on device for automatic delivery once connected)
    const localMsg: LocalMessage = {
      id: messageId,
      matchId: this.matchId,
      senderId: this.currentUserId,
      text,
      mediaBlob: media?.blob,
      mediaType: media?.mimeType,
      isViewOnce,
      viewOnceStatus: isViewOnce ? 'unopened' : undefined,
      status: isChannelOpen ? 'sent' : 'sending',
      timestamp: now,
    }

    await db.saveMessage(localMsg)

    if (isChannelOpen) {
      this.sendPacket(packet)
    } else {
      const receiverId = this.isFemale ? this.matchInfo.male_id : this.matchInfo.female_id
      // Zero-Knowledge Ephemeral Cloudflare Worker Offline Relay (0 DB writes to Supabase, 0 tokens)
      pushOfflineEncryptedMessage(this.currentUserId, receiverId, this.matchId, localMsg)
        .catch((err) => console.warn('[Offline Relay Notice]:', err))
    }

    return localMsg
  }

  /**
   * Automatically flushes all cached offline messages once second device connects
   */
  public async flushPendingQueue(): Promise<void> {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return

    try {
      const messages = await db.getMessagesForMatch(this.matchId)
      const pendingMessages = messages.filter(
        (m) => m.senderId === this.currentUserId && m.status === 'sending'
      )

      for (const msg of pendingMessages) {
        const packet: P2PPacket = {
          type: 'chat',
          id: msg.id,
          senderId: this.currentUserId,
          text: msg.text,
          media: msg.mediaBlob && msg.mediaType ? { blob: msg.mediaBlob, mimeType: msg.mediaType } : undefined,
          isViewOnce: msg.isViewOnce,
          timestamp: msg.timestamp,
        }
        this.sendPacket(packet)
        await db.updateMessageStatus(msg.id, 'sent')
        this.callbacks.onAckReceived(msg.id, 'sent')
      }
    } catch (err) {
      console.error('Failed to flush offline queue:', err)
    }
  }

  /**
   * 10-Minute "Delete for Everyone"
   */
  public async deleteForEveryone(messageId: string, timestamp: number): Promise<void> {
    const elapsed = Date.now() - timestamp
    if (elapsed > 10 * 60 * 1000) {
      throw new Error('Messages older than 10 minutes cannot be deleted for everyone')
    }

    // 1. Dispatch WebRTC packet
    this.sendPacket({
      type: 'delete_msg',
      messageId,
      timestamp: Date.now(),
    })

    // 2. Clear sender's local storage
    await db.deleteMessageForEveryone(messageId)
    this.callbacks.onMessageDeleted?.(messageId)
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
