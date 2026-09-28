import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  ArrowLeft,
  MoreVertical,
  ShieldAlert,
  Ban,
  Paperclip,
  Send,
  Lock,
  Unlock,
  Check,
  CheckCheck,
  Clock,
  Circle,
  AlertTriangle,
  X,
  ShieldCheck,
  Sparkles,
  Smile,
  Trash2,
  Eye,
  EyeOff,
  UserX,
} from 'lucide-react'
import { db, type LocalMessage, type MessageStatus } from '../db'
import { api, type MatchRecord, type Profile } from '../services/supabase'
import { P2PChatEngine, type ConnectionState } from '../services/p2pChat'
import { ReportModal } from '../components/ReportModal'
import { RichEmojiPicker } from '../components/RichEmojiPicker'
import { ProfileModal } from '../components/ProfileModal'
import { drainOfflineMessages, pushOfflineEncryptedMessage } from '../services/offlineQueue'

/**
 * Client-Side Image Optimization Utility
 * Resizes camera/gallery photos down to max 1600px width/height and compresses to JPEG
 * to ensure rapid sub-second P2P transmission over WebRTC chunking.
 */
async function compressImage(file: File): Promise<{ blob: string; mimeType: string }> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ blob: reader.result as string, mimeType: file.type || 'image/jpeg' })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new window.Image()
      img.onload = () => {
        const MAX_DIM = 1600
        let { width, height } = img
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width)
            width = MAX_DIM
          } else {
            width = Math.round((width * MAX_DIM) / height)
            height = MAX_DIM
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ blob: reader.result as string, mimeType: file.type || 'image/jpeg' })
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        const mimeType = 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, 0.82)
        resolve({ blob: dataUrl, mimeType })
      }
      img.onerror = () => {
        resolve({ blob: reader.result as string, mimeType: file.type || 'image/jpeg' })
      }
      img.src = e.target?.result as string
    }
    reader.onerror = () => {
      resolve({ blob: '', mimeType: 'image/jpeg' })
    }
    reader.readAsDataURL(file)
  })
}

interface ChatRoomProps {
  currentProfile: Profile
  match: MatchRecord
  onBack: () => void
  onUserBlocked: () => void
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  currentProfile,
  match,
  onBack,
  onUserBlocked,
}) => {
  const [matchState, setMatchState] = useState<MatchRecord>(match)
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [inputText, setInputText] = useState<string>('')
  const [connState, setConnState] = useState<ConnectionState>('idle')
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false)
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState<boolean>(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState<boolean>(false)
  const [isPartnerDeactivated, setIsPartnerDeactivated] = useState<boolean>(
    Boolean(match.partner?.is_deactivated)
  )

  // Media & View-Once state
  const [activeViewOnceMsgId, setActiveViewOnceMsgId] = useState<string | null>(null)
  const [previewMedia, setPreviewMedia] = useState<string | null>(null)
  const [sendAsViewOnce, setSendAsViewOnce] = useState<boolean>(false)
  const [isSendingMedia, setIsSendingMedia] = useState<boolean>(false)
  const [mediaTooltip, setMediaTooltip] = useState<string>('')
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])

  const engineRef = useRef<P2PChatEngine | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const isUserFemale = currentProfile.gender === 'female'
  const partner = matchState.partner

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load local messages from Dexie.js (Zero server storage) with automatic offline drain
  const loadLocalMessages = useCallback(async () => {
    try {
      // Drain any queued offline messages for current user from Cloudflare ephemeral relay
      await drainOfflineMessages(currentProfile.id)

      const stored = await db.getMessagesForMatch(matchState.id)
      setMessages(stored)
      setTimeout(scrollToBottom, 50)
    } catch (err) {
      console.error('Failed to load local messages:', err)
    }
  }, [currentProfile.id, matchState.id])

  useEffect(() => {
    loadLocalMessages()
  }, [loadLocalMessages])

  // Listen for peer deactivation
  useEffect(() => {
    const unsub = api.onUserDeactivated((deactivatedUserId) => {
      if (partner && partner.id === deactivatedUserId) {
        setIsPartnerDeactivated(true)
        if (engineRef.current) {
          engineRef.current.destroy()
        }
      }
    })
    return () => unsub()
  }, [partner])

  // Initialize WebRTC P2P Engine
  useEffect(() => {
    if (isPartnerDeactivated) return

    const engine = new P2PChatEngine(
      matchState,
      currentProfile.id,
      isUserFemale,
      {
        onMessageReceived: (newMsg) => {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === newMsg.id)
            if (exists) return prev
            return [...prev, newMsg]
          })
          setTimeout(scrollToBottom, 50)
        },
        onMessageDeleted: (messageId) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId
                ? { ...m, text: '🚫 This message was deleted', mediaBlob: undefined, isDeleted: true }
                : m
            )
          )
        },
        onAckReceived: (messageId, status) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status } : m))
          )
        },
        onConnectionStateChange: (state) => {
          setConnState(state)
        },
        onPermissionChanged: (mediaAllowed) => {
          setMatchState((prev) => ({ ...prev, media_allowed: mediaAllowed }))
        },
        onError: (err) => {
          console.warn('P2P Chat Error:', err)
        },
      }
    )

    engineRef.current = engine
    engine.initialize()

    return () => {
      engine.destroy()
      engineRef.current = null
    }
  }, [matchState.id, currentProfile.id, isUserFemale, isPartnerDeactivated])

  // Synchronize fresh match permissions on mount and periodically in background
  useEffect(() => {
    let isSubscribed = true

    const syncMatch = async () => {
      try {
        const fresh = await api.getMatch(match.id)
        if (isSubscribed && fresh) {
          setMatchState((prev) => {
            if (prev.media_allowed !== fresh.media_allowed || prev.has_female_initiated !== fresh.has_female_initiated) {
              if (engineRef.current) {
                engineRef.current.updateMatchInfo({ ...prev, ...fresh })
              }
              return { ...prev, ...fresh, partner: prev.partner || fresh.partner }
            }
            return prev
          })
        }
      } catch {
        // Silent background sync
      }
    }

    syncMatch()
    const interval = setInterval(syncMatch, 4000)
    return () => {
      isSubscribed = false
      clearInterval(interval)
    }
  }, [match.id])

  // Update engine if match permissions change
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateMatchInfo(matchState)
    }
  }, [matchState])

  // Mark all unread messages as read when window is open
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.markAllUnreadAsRead()
    }
  }, [messages.length])

  // Female user toggles media sharing permission
  const handleToggleMediaPermission = async () => {
    if (!isUserFemale) return
    const newStatus = !matchState.media_allowed
    try {
      await api.toggleMediaAllowed(matchState.id, newStatus)
      setMatchState((prev) => ({ ...prev, media_allowed: newStatus }))
      if (engineRef.current) {
        engineRef.current.syncMediaPermission(newStatus)
      }
    } catch (err) {
      console.error('Failed to toggle media sharing:', err)
    }
  }

  // Handle auto-expanding textarea (WhatsApp-like dynamic vertical growth + scrolling)
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    const newHeight = Math.min(textarea.scrollHeight, 120)
    textarea.style.height = `${newHeight}px`
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  // Send text message (Optimistic local-first Dexie caching + P2P auto-delivery)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim()) return

    const textToSend = inputText.trim()
    setInputText('')
    setIsEmojiPickerOpen(false)

    // Reset textarea height to single line
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    try {
      if (engineRef.current) {
        const localMsg = await engineRef.current.sendMessage(textToSend)
        setMessages((prev) => [...prev, localMsg])
        setTimeout(scrollToBottom, 50)
      } else {
        // Fallback: save to local Dexie immediately so message is NEVER lost
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
        const localMsg: LocalMessage = {
          id: messageId,
          matchId: matchState.id,
          senderId: currentProfile.id,
          text: textToSend,
          status: 'sending',
          timestamp: Date.now(),
        }
        await db.saveMessage(localMsg)
        setMessages((prev) => [...prev, localMsg])
        setTimeout(scrollToBottom, 50)

        // Zero-Knowledge Ephemeral Cloudflare Worker Offline Relay (0 DB writes to Supabase)
        const receiverId = isUserFemale ? matchState.male_id : matchState.female_id
        pushOfflineEncryptedMessage(
          currentProfile.id,
          receiverId,
          matchState.id,
          localMsg
        ).catch((err) => console.warn('[Offline Relay Fallback]:', err))
      }

    } catch (err: any) {
      console.error('Failed to send text packet:', err)
    }
  }

  // Append emoji to input text
  const handleAppendEmoji = (emoji: string) => {
    setInputText((prev) => {
      const next = prev + emoji
      if (textareaRef.current) {
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.style.height = 'auto'
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
          }
        }, 10)
      }
      return next
    })
    textareaRef.current?.focus()
  }

  // 10-Minute "Delete for Everyone"
  const handleDeleteForEveryone = async (msg: LocalMessage) => {
    const elapsed = Date.now() - msg.timestamp
    if (elapsed > 10 * 60 * 1000) {
      alert('Delete for Everyone is only available within 10 minutes of sending.')
      return
    }

    const confirmDelete = window.confirm('Delete this message for everyone in this chat?')
    if (!confirmDelete) return

    try {
      if (engineRef.current) {
        await engineRef.current.deleteForEveryone(msg.id, msg.timestamp)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.id
              ? { ...m, text: '🚫 This message was deleted', mediaBlob: undefined, isDeleted: true }
              : m
          )
        )
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete message')
    }
  }

  // Send media attachment (Compressed on-device + transmitted via WebRTC SCTP chunking)
  const handleMediaSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (!file) return

    // Male Guard Check
    if (!isUserFemale && !matchState.media_allowed) {
      setMediaTooltip('Only she can enable media sharing')
      setTimeout(() => setMediaTooltip(''), 3000)
      return
    }

    // Direct P2P check: Media photos are zero-knowledge and transmitted only P2P when both are connected
    if (!engineRef.current || !engineRef.current.isDataChannelOpen()) {
      alert('Partner is not connected. Photos are transferred directly peer-to-peer and require both partners to be active in chat.')
      return
    }

    const isViewOnceToSend = isUserFemale && sendAsViewOnce
    setIsSendingMedia(true)

    try {
      const compressed = await compressImage(file)
      if (!compressed.blob) {
        throw new Error('Could not process selected image')
      }

      const localMsg = await engineRef.current.sendMessage(
        undefined,
        compressed,
        isViewOnceToSend
      )
      setMessages((prev) => [...prev, localMsg])
      setTimeout(scrollToBottom, 50)
      setSendAsViewOnce(false)
    } catch (err: any) {
      console.error('Media transfer failure:', err)
      alert(err.message || 'Failed to transmit media')
    } finally {
      setIsSendingMedia(false)
    }
  }

  // Open view-once media
  const handleOpenViewOnce = (msg: LocalMessage) => {
    if (msg.viewOnceStatus === 'opened') return
    if (!msg.mediaBlob) return

    setActiveViewOnceMsgId(msg.id)
    setPreviewMedia(msg.mediaBlob)
  }

  // Close lightbox & immediately purge view-once media from Dexie
  const handleCloseLightbox = async () => {
    if (activeViewOnceMsgId) {
      // Purge view-once media from Dexie immediately
      await db.markViewOnceOpened(activeViewOnceMsgId)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === activeViewOnceMsgId
            ? { ...m, mediaBlob: undefined, viewOnceStatus: 'opened' }
            : m
        )
      )
      setActiveViewOnceMsgId(null)
    }
    setPreviewMedia(null)
  }

  // Block User action
  const handleBlockUser = async () => {
    if (!partner) return
    const confirmed = window.confirm(
      `Block ${partner.full_name}? This will sever the P2P connection, purge all local chat history, and remove this match.`
    )
    if (!confirmed) return

    try {
      if (engineRef.current) {
        engineRef.current.destroy()
      }
      await api.blockUser(currentProfile.id, partner.id)
      await db.deleteMessagesForMatch(matchState.id)
      onUserBlocked()
    } catch (err) {
      console.error('Failed to block user:', err)
    }
  }

  // Connection indicator helpers
  const getConnectionIndicator = () => {
    if (isPartnerDeactivated) {
      return {
        color: 'text-red-500',
        bg: 'bg-red-500',
        label: 'User Deactivated by Admin',
      }
    }

    switch (connState) {
      case 'connected':
        return {
          color: 'text-emerald-400',
          bg: 'bg-emerald-500',
          label: 'Direct P2P Connected',
        }
      case 'signaling':
      case 'connecting':
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500 animate-ping',
          label: 'Signaling / Connecting',
        }
      case 'waiting_for_female_initiation':
        return {
          color: 'text-rose-400',
          bg: 'bg-rose-500',
          label: 'Waiting for Her Initiation',
        }
      default:
        return {
          color: 'text-amber-400',
          bg: 'bg-amber-500',
          label: 'Saved Locally • Will send when online',
        }
    }
  }

  const indicator = getConnectionIndicator()

  // Render WhatsApp-style delivery tick
  const renderDeliveryTick = (status: MessageStatus) => {
    switch (status) {
      case 'sending':
        return <Clock className="w-3 h-3 text-slate-400 inline" />
      case 'sent':
        return <Check className="w-3 h-3 text-slate-400 inline" />
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-white select-none relative overflow-hidden no-screen-capture">
      {/* --- HEADER --- */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 px-3 py-2.5 flex items-center justify-between shadow-lg">
        {/* Left: Back & Partner Profile */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-1 rounded-full text-slate-300 hover:text-white hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {isPartnerDeactivated ? (
            <div className="flex items-center space-x-2 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500">
                <UserX className="w-5 h-5 text-rose-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-slate-400">User Deactivated</h3>
                <span className="text-[10px] text-rose-400 font-medium">Account Revoked</span>
              </div>
            </div>
          ) : partner ? (
            <div
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center space-x-2.5 min-w-0 cursor-pointer p-1 rounded-xl hover:bg-slate-800/60 active:scale-98 transition-all"
            >
              <div className="relative shrink-0">
                <img
                  src={partner.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
                  alt={partner.full_name}
                  className="w-10 h-10 rounded-full object-cover border border-slate-700 bg-slate-800"
                />
                <span
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-900 ${
                    connState === 'connected' ? 'bg-emerald-500' : 'bg-slate-600'
                  }`}
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center space-x-1">
                  <h3 className="font-bold text-sm text-white truncate max-w-[140px]">{partner.full_name}</h3>
                  {partner.report_count > 0 && (
                    <span className="text-[10px] text-amber-400 font-mono bg-amber-950/80 px-1 rounded border border-amber-800/40">
                      ⚠️{partner.report_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1.5 text-[10px]">
                  <Circle className={`w-2 h-2 ${indicator.color} fill-current`} />
                  <span className={`${indicator.color} truncate font-medium`}>{indicator.label}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: Female Media Toggle & Options Menu */}
        {!isPartnerDeactivated && (
          <div className="flex items-center space-x-1.5 shrink-0">
            {isUserFemale && (
              <button
                type="button"
                onClick={handleToggleMediaPermission}
                title={matchState.media_allowed ? 'Media Sharing Enabled' : 'Media Sharing Disabled'}
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                  matchState.media_allowed
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {matchState.media_allowed ? (
                  <>
                    <Unlock className="w-3 h-3 text-emerald-400" />
                    <span>Media ON</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Media OFF</span>
                  </>
                )}
              </button>
            )}

            {!isUserFemale && (
              <div
                className={`flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  matchState.media_allowed
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
                title={matchState.media_allowed ? 'Media sharing enabled by partner' : 'Only she can enable media sharing'}
              >
                {matchState.media_allowed ? (
                  <>
                    <Unlock className="w-3 h-3 text-emerald-400" />
                    <span>Media Allowed</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 text-slate-400" />
                    <span>Media Locked</span>
                  </>
                )}
              </div>
            )}

            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 top-10 w-44 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false)
                      setIsReportModalOpen(true)
                    }}
                    className="w-full px-3 py-2 text-left flex items-center space-x-2 text-amber-400 hover:bg-slate-800 transition-all"
                  >
                    <ShieldAlert className="w-4 h-4" />
                    <span>Report User</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false)
                      handleBlockUser()
                    }}
                    className="w-full px-3 py-2 text-left flex items-center space-x-2 text-rose-400 hover:bg-slate-800 transition-all"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Block User</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- DEACTIVATED NOTICE BANNER --- */}
      {isPartnerDeactivated && (
        <div className="bg-rose-950/80 border-b border-rose-800/80 p-3 text-center space-y-1">
          <p className="text-xs font-bold text-rose-300">
            🚫 This user has been de-authenticated by campus administrators.
          </p>
          <p className="text-[11px] text-slate-300">
            All direct WebRTC channels are closed and future messaging is permanently blocked.
          </p>
        </div>
      )}

      {/* --- P2P CHAT MESSAGES BODY --- */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {/* Zero-Storage Encryption Notice */}
        <div className="mx-auto max-w-xs text-center py-1.5 px-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-center space-x-1.5 shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Zero Server Storage • Offline Caching • Direct P2P</span>
        </div>

        {/* Female-First Gate Warning for Males */}
        {!isUserFemale && !matchState.has_female_initiated && !isPartnerDeactivated && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-800/50 text-center space-y-2">
            <Sparkles className="w-6 h-6 text-amber-400 mx-auto" />
            <h4 className="font-bold text-xs text-amber-300">Awaiting Female First Move</h4>
            <p className="text-[11px] text-slate-300">
              In accordance with campus safety rules, signaling will only unlock after she sends the first message.
            </p>
          </div>
        )}

        {/* Message Bubbles */}
        {messages.map((msg) => {
          const isMe = msg.senderId === currentProfile.id
          const canDeleteForEveryone =
            isMe && !msg.isDeleted && currentTime - msg.timestamp <= 10 * 60 * 1000

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} group relative`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-xs relative shadow-md ${
                  msg.isDeleted
                    ? 'bg-slate-900 text-slate-500 italic border border-slate-800'
                    : isMe
                    ? 'bg-rose-600 text-white rounded-br-xs'
                    : 'bg-slate-850 text-slate-100 rounded-bl-xs border border-slate-800'
                }`}
              >
                {/* 1. View-Once Media Bubble */}
                {msg.isViewOnce ? (
                  <div className="mb-1 py-1">
                    {msg.viewOnceStatus === 'opened' ? (
                      <div className="flex items-center space-x-1.5 text-slate-400 py-1 text-xs">
                        <EyeOff className="w-4 h-4 text-slate-500" />
                        <span className="italic font-medium">📷 Photo (Opened)</span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenViewOnce(msg)}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                          isMe
                            ? 'bg-rose-700/80 text-white'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-600/50 hover:bg-emerald-900'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        <span>{isMe ? '1 View-Once Photo Sent' : '👁️ View Photo (1-time view)'}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  /* 2. Standard Media Attachment */
                  msg.mediaBlob && (
                    <div
                      onClick={() => setPreviewMedia(msg.mediaBlob!)}
                      className="mb-1.5 rounded-xl overflow-hidden cursor-pointer max-h-56 bg-black"
                    >
                      <img
                        src={msg.mediaBlob}
                        alt="Shared media"
                        className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                      />
                    </div>
                  )
                )}

                {/* Text Content */}
                {msg.text && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                    {msg.text}
                  </p>
                )}

                {/* Footer: Time & Delivery Status Ticks & Delete for Everyone */}
                <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] opacity-80">
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isMe && !msg.isDeleted && renderDeliveryTick(msg.status)}

                  {/* 10-Minute "Delete for Everyone" Icon */}
                  {canDeleteForEveryone && (
                    <button
                      type="button"
                      onClick={() => handleDeleteForEveryone(msg)}
                      title="Delete for Everyone (within 10 mins)"
                      className="opacity-60 hover:opacity-100 hover:text-red-200 transition-opacity ml-1 p-0.5"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* --- MEDIA TOOLTIP NOTICE --- */}
      {mediaTooltip && (
        <div className="mx-4 mb-2 p-2 bg-amber-950/90 border border-amber-800 text-amber-300 text-[11px] rounded-xl flex items-center space-x-2 animate-bounce">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{mediaTooltip}</span>
        </div>
      )}

      {/* --- RICH EMOJI PICKER POPUP --- */}
      {isEmojiPickerOpen && (
        <div className="absolute bottom-16 left-3 right-3 z-40 max-w-sm mx-auto">
          <RichEmojiPicker
            onSelectEmoji={handleAppendEmoji}
            onClose={() => setIsEmojiPickerOpen(false)}
          />
        </div>
      )}

      {/* --- INPUT BAR (REMOVED IF USER IS DEACTIVATED) --- */}
      {!isPartnerDeactivated ? (
        <form
          onSubmit={handleSendMessage}
          className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-3 pt-2 pb-3 flex items-end space-x-2 z-20 shadow-lg"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
        >
          {/* Emoji Picker Toggle Button */}
          <button
            type="button"
            onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
            className={`p-2 rounded-full border mb-0.5 shrink-0 transition-all ${
              isEmojiPickerOpen
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700'
            }`}
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Media Upload & View-Once Selection */}
          <div className="relative flex items-center space-x-1 mb-0.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (isSendingMedia) return
                if (!isUserFemale && !matchState.media_allowed) {
                  setMediaTooltip('Only she can enable media sharing')
                  setTimeout(() => setMediaTooltip(''), 3000)
                  return
                }
                fileInputRef.current?.click()
              }}
              disabled={isSendingMedia || (!isUserFemale && !matchState.media_allowed)}
              title={
                isSendingMedia
                  ? 'Transmitting media over P2P...'
                  : !isUserFemale && !matchState.media_allowed
                  ? 'Only she can enable media sharing'
                  : 'Attach image'
              }
              className={`p-2 rounded-full border transition-all ${
                isSendingMedia
                  ? 'bg-rose-950/80 text-rose-300 border-rose-500/80 animate-pulse cursor-wait'
                  : !isUserFemale && !matchState.media_allowed
                  ? 'bg-slate-950 text-slate-600 border-slate-800 cursor-not-allowed'
                  : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-700'
              }`}
            >
              {isSendingMedia ? (
                <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
              ) : !isUserFemale && !matchState.media_allowed ? (
                <Lock className="w-4 h-4 text-slate-500" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </button>

            {/* View-Once Toggle for Female Members */}
            {isUserFemale && (
              <button
                type="button"
                onClick={() => setSendAsViewOnce(!sendAsViewOnce)}
                title={sendAsViewOnce ? 'View-Once Enabled' : 'Standard Media'}
                className={`p-1.5 rounded-full border text-[10px] font-bold transition-all ${
                  sendAsViewOnce
                    ? 'bg-emerald-600 border-emerald-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleMediaSelected}
              className="hidden"
            />
          </div>

          {/* Auto-expanding Dynamic Textarea (WhatsApp Style) */}
          <div className="flex-1 min-w-0 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputText}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={
                !isUserFemale && !matchState.has_female_initiated
                  ? 'Waiting for her to initiate...'
                  : 'Type a message...'
              }
              disabled={!isUserFemale && !matchState.has_female_initiated}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 disabled:opacity-50 resize-none overflow-y-auto block leading-relaxed"
              style={{
                fontSize: '15px',
                minHeight: '38px',
                maxHeight: '120px',
              }}
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            disabled={
              !inputText.trim() ||
              (!isUserFemale && !matchState.has_female_initiated)
            }
            className="p-2.5 rounded-full bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition-all shadow-md shadow-rose-600/30 active:scale-95 mb-0.5 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      ) : null}

      {/* --- FULLSCREEN IMAGE LIGHTBOX PREVIEW (VIEW-ONCE PROTECTED) --- */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/98 flex flex-col items-center justify-center p-4 backdrop-blur-md select-none no-screen-capture"
          onContextMenu={(e) => e.preventDefault()}
          onClick={handleCloseLightbox}
        >
          <button
            type="button"
            onClick={handleCloseLightbox}
            className="absolute top-4 right-4 p-2 bg-slate-900 rounded-full text-white hover:bg-slate-800"
          >
            <X className="w-6 h-6" />
          </button>

          {activeViewOnceMsgId && (
            <div className="absolute top-4 left-4 bg-rose-950/80 border border-rose-800 px-3 py-1 rounded-full text-[11px] text-rose-300 font-bold flex items-center space-x-1.5">
              <Eye className="w-3.5 h-3.5" />
              <span>One-Time View Media • Disappears upon closing</span>
            </div>
          )}

          <img
            src={previewMedia}
            alt="Preview"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl pointer-events-none select-none"
          />
        </div>
      )}

      {/* --- REPORT MODAL --- */}
      <ReportModal
        isOpen={isReportModalOpen}
        targetProfile={partner || null}
        currentUserId={currentProfile.id}
        onClose={() => setIsReportModalOpen(false)}
        onReported={() => {
          setIsReportModalOpen(false)
        }}
      />

      {/* --- PARTNER PROFILE MODAL --- */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        profile={partner || null}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </div>
  )
}

export default ChatRoom
