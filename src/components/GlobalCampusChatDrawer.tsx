import React, { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  Users,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react'
import { api, type Profile, type GlobalCampusMessage } from '../services/supabase'

interface GlobalCampusChatDrawerProps {
  currentProfile: Profile
  isOpen: boolean
  onClose: () => void
  onOpen: () => void
}

const STORAGE_KEY = 'jud_campus_global_chat_history'

export const GlobalCampusChatDrawer: React.FC<GlobalCampusChatDrawerProps> = ({
  currentProfile,
  isOpen,
  onClose,
  onOpen,
}) => {
  const [messages, setMessages] = useState<GlobalCampusMessage[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const [inputText, setInputText] = useState<string>('')
  const [isSending, setIsSending] = useState<boolean>(false)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  // Auto-scroll to bottom of chat
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    if (isOpen) {
      setTimeout(scrollToBottom, 50)
    }
  }, [isOpen, messages.length])

  // Realtime subscription to campus-wide broadcast channel
  useEffect(() => {
    const unsub = api.subscribeGlobalCampusChat((newMsg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev
        const updated = [...prev, newMsg].slice(-80) // Keep last 80 messages
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        } catch {}
        return updated
      })
    })

    return () => unsub()
  }, [])

  // Touch gesture listeners on window: drag from left edge to open
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y

      // If user drags right starting from left edge (< 40px from left) and horizontal > vertical
      if (!isOpen && touchStartRef.current.x < 45 && deltaX > 60 && Math.abs(deltaY) < 50) {
        onOpen()
        touchStartRef.current = null
      }
      // If user drags left while drawer is open
      else if (isOpen && deltaX < -70 && Math.abs(deltaY) < 50) {
        onClose()
        touchStartRef.current = null
      }
    }

    const handleTouchEnd = () => {
      touchStartRef.current = null
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isOpen, onOpen, onClose])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text || isSending) return

    setIsSending(true)
    const newMsg: GlobalCampusMessage = {
      id: `campus_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      sender_id: currentProfile.id,
      sender_name: currentProfile.full_name,
      department: currentProfile.department || 'Jadavpur University',
      gender: currentProfile.gender,
      text,
      created_at: Date.now(),
    }

    try {
      // Broadcast to all verified online students
      await api.sendGlobalCampusMessage(newMsg)

      // Add to local state immediately
      setMessages((prev) => {
        const updated = [...prev, newMsg].slice(-80)
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        } catch {}
        return updated
      })
      setInputText('')
      setTimeout(scrollToBottom, 50)
    } catch (err) {
      console.error('Failed to send campus broadcast:', err)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <>
      {/* Discreet left drag handle tab visible when closed */}
      {!isOpen && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Open Global Campus Chat"
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-slate-900/90 hover:bg-slate-800 text-rose-400 border border-l-0 border-rose-500/30 rounded-r-2xl py-3 px-1.5 shadow-2xl flex flex-col items-center gap-1.5 transition-all group backdrop-blur-md active:scale-95"
        >
          <MessageSquare className="w-4 h-4 text-rose-400 animate-pulse" />
          <span className="text-[9px] font-black tracking-widest uppercase [writing-mode:vertical-lr] text-slate-300 group-hover:text-white">
            CAMPUS CHAT
          </span>
        </button>
      )}

      {/* Backdrop overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity animate-in fade-in duration-200"
        />
      )}

      {/* Slide-over Left Drawer Panel */}
      <div
        className={`fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-950 border-r border-slate-800 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Drawer Header */}
        <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-black text-white">JU Campus Global</span>
                <span className="flex items-center gap-1 text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 rounded-full border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  LIVE
                </span>
              </div>
              <p className="text-[10px] text-slate-400">Drag left or tap outside to close</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice */}
        <div className="px-3.5 py-1.5 bg-rose-950/30 border-b border-rose-900/30 text-[10px] text-rose-300 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          <span>Exclusive broadcast feed for verified Jadavpur students.</span>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 space-y-2 text-slate-500">
              <Sparkles className="w-8 h-8 text-rose-500/40" />
              <p className="text-xs font-bold text-slate-300">Campus Feed is Clear</p>
              <p className="text-[11px] text-slate-400 max-w-[200px]">
                Be the first to share an update or shoutout with fellow students!
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isMe = m.sender_id === currentProfile.id
              const timeStr = new Date(m.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })

              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-0.5`}
                >
                  <div className="flex items-center space-x-1.5 px-1">
                    <span className="text-[10px] font-bold text-slate-300">
                      {isMe ? 'You' : m.sender_name}
                    </span>
                    <span className="text-[9px] text-slate-500 truncate max-w-[120px]">
                      • {m.department}
                    </span>
                    <span className="text-[8px] text-slate-500">{timeStr}</span>
                  </div>
                  <div
                    className={`px-3 py-2 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                      isMe
                        ? 'bg-rose-600 text-white rounded-tr-none shadow-md shadow-rose-600/10'
                        : 'bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/60'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendMessage} className="p-2.5 border-t border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              placeholder="Send campus broadcast..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              className="p-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-xl shadow-md shadow-rose-600/20 active:scale-95 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
