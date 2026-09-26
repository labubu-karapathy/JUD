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
  Image as ImageIcon,
  X,
  ShieldCheck,
  Sparkles
} from 'lucide-react'
import { db, type LocalMessage, type MessageStatus } from '../db'
import { api, type MatchRecord, type Profile } from '../services/supabase'
import { P2PChatEngine, type ConnectionState } from '../services/p2pChat'
import { ReportModal } from '../components/ReportModal'

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
  const [previewMedia, setPreviewMedia] = useState<string | null>(null)
  const [mediaTooltip, setMediaTooltip] = useState<string>('')

  const engineRef = useRef<P2PChatEngine | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const isUserFemale = currentProfile.gender === 'female'
  const partner = matchState.partner

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Load local messages from Dexie.js (Zero server storage)
  const loadLocalMessages = useCallback(async () => {
    try {
      const stored = await db.getMessagesForMatch(matchState.id)
      setMessages(stored)
      setTimeout(scrollToBottom, 50)
    } catch (err) {
      console.error('Failed to load local messages:', err)
    }
  }, [matchState.id])

  useEffect(() => {
    loadLocalMessages()
  }, [loadLocalMessages])

  // Initialize WebRTC P2P Engine
  useEffect(() => {
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
        onAckReceived: (messageId, status) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, status } : m))
          )
        },
        onConnectionStateChange: (state) => {
          setConnState(state)
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
  }, [matchState.id, currentProfile.id, isUserFemale])

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
    } catch (err) {
      console.error('Failed to toggle media sharing:', err)
    }
  }

  // Send text message
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!inputText.trim()) return

    const textToSend = inputText.trim()
    setInputText('')

    try {
      if (engineRef.current) {
        const localMsg = await engineRef.current.sendMessage(textToSend)
        setMessages((prev) => [...prev, localMsg])
        setTimeout(scrollToBottom, 50)
      }
    } catch (err: any) {
      console.error('Failed to send text packet:', err)
      alert(err.message || 'P2P channel not connected yet. Waiting for peer...')
    }
  }

  // Send photo attachment
  const handleMediaSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Male Media Guard Check
    if (!isUserFemale && !matchState.media_allowed) {
      setMediaTooltip('Only she can enable media sharing')
      setTimeout(() => setMediaTooltip(''), 3000)
      return
    }

    const reader = new FileReader()
    reader.onload = async () => {
      if (typeof reader.result === 'string') {
        const base64Data = reader.result
        try {
          if (engineRef.current) {
            const localMsg = await engineRef.current.sendMessage(undefined, {
              blob: base64Data,
              mimeType: file.type || 'image/jpeg',
            })
            setMessages((prev) => [...prev, localMsg])
            setTimeout(scrollToBottom, 50)
          }
        } catch (err: any) {
          alert(err.message || 'Failed to transmit media')
        }
      }
    }
    reader.readAsDataURL(file)
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
          color: 'text-red-400',
          bg: 'bg-red-500',
          label: 'P2P Offline (Peer not in room)',
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
        // Single Gray Tick
        return <Check className="w-3 h-3 text-slate-400 inline" />
      case 'delivered':
        // Double Gray Tick
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />
      case 'read':
        // Double Green/Cyan Tick
        return <CheckCheck className="w-3.5 h-3.5 text-emerald-400 inline" />
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-white select-none relative overflow-hidden">
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

          {partner && (
            <div className="flex items-center space-x-2 min-w-0">
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
                  <h3 className="font-bold text-sm text-white truncate">{partner.full_name}</h3>
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
          )}
        </div>

        {/* Right: Female Media Toggle & Options Menu */}
        <div className="flex items-center space-x-1.5 shrink-0">
          {/* Female Media Permission Switch */}
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

          {/* More Options Dropdown */}
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
      </div>

      {/* --- P2P CHAT MESSAGES BODY --- */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {/* Zero-Storage Encryption Notice */}
        <div className="mx-auto max-w-xs text-center py-1.5 px-3 bg-slate-900/60 rounded-xl border border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-center space-x-1.5 shadow-sm">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Zero Server Storage • WebRTC Peer-to-Peer</span>
        </div>

        {/* Female-First Gate Warning for Males */}
        {!isUserFemale && !matchState.has_female_initiated && (
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

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-xs relative shadow-md ${
                  isMe
                    ? 'bg-rose-600 text-white rounded-br-xs'
                    : 'bg-slate-850 text-slate-100 rounded-bl-xs border border-slate-800'
                }`}
              >
                {/* Media Attachment if present */}
                {msg.mediaBlob && (
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
                )}

                {/* Text Content */}
                {msg.text && (
                  <p className="whitespace-pre-wrap break-words leading-relaxed text-[13px]">
                    {msg.text}
                  </p>
                )}

                {/* Footer: Time & Delivery Status Ticks */}
                <div className="flex items-center justify-end space-x-1 mt-1 text-[9px] opacity-75">
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isMe && renderDeliveryTick(msg.status)}
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

      {/* --- INPUT BAR --- */}
      <form
        onSubmit={handleSendMessage}
        className="sticky bottom-0 bg-slate-900 border-t border-slate-800 px-3 py-2 flex items-center space-x-2"
      >
        {/* Media Upload Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              if (!isUserFemale && !matchState.media_allowed) {
                setMediaTooltip('Only she can enable media sharing')
                setTimeout(() => setMediaTooltip(''), 3000)
                return
              }
              fileInputRef.current?.click()
            }}
            disabled={!isUserFemale && !matchState.media_allowed}
            title={
              !isUserFemale && !matchState.media_allowed
                ? 'Only she can enable media sharing'
                : 'Attach image'
            }
            className={`p-2 rounded-full border transition-all ${
              !isUserFemale && !matchState.media_allowed
                ? 'bg-slate-950 text-slate-600 border-slate-800 cursor-not-allowed'
                : 'bg-slate-800 text-slate-300 hover:text-white border-slate-700 hover:bg-slate-700'
            }`}
          >
            {!isUserFemale && !matchState.media_allowed ? (
              <Lock className="w-4 h-4 text-slate-500" />
            ) : (
              <Paperclip className="w-4 h-4" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleMediaSelected}
            className="hidden"
          />
        </div>

        {/* Input Text Field */}
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            !isUserFemale && !matchState.has_female_initiated
              ? 'Waiting for her to initiate...'
              : 'Type a message...'
          }
          disabled={!isUserFemale && !matchState.has_female_initiated}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 disabled:opacity-50"
        />

        {/* Send Button */}
        <button
          type="submit"
          disabled={
            !inputText.trim() ||
            (!isUserFemale && !matchState.has_female_initiated)
          }
          className="p-2 rounded-full bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition-all shadow-md shadow-rose-600/30 active:scale-95"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* --- FULLSCREEN IMAGE LIGHTBOX PREVIEW --- */}
      {previewMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setPreviewMedia(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewMedia(null)}
            className="absolute top-4 right-4 p-2 bg-slate-900 rounded-full text-white hover:bg-slate-800"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={previewMedia}
            alt="Preview"
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
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
    </div>
  )
}

export default ChatRoom
