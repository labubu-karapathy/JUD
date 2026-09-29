import React, { useState, useEffect, useCallback } from 'react'
import {
  MessageCircle,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  Lock,
  AlertTriangle,
  UserX,
  RefreshCw,
} from 'lucide-react'
import { api, type MatchRecord, type Profile } from '../services/supabase'
import { db, type LocalMessage, getPermanentMatches, savePermanentMatches } from '../db'
import { ProfileModal } from '../components/ProfileModal'
import { backButtonService } from '../services/backButtonService'

interface MatchesProps {
  currentProfile: Profile
  onSelectMatch: (match: MatchRecord) => void
}

interface MatchWithLastMessage extends MatchRecord {
  lastMessage?: LocalMessage
  unreadCount?: number
}

export const Matches: React.FC<MatchesProps> = ({
  currentProfile,
  onSelectMatch,
}) => {
  // 1. Instant 0ms Load: Initialize directly from permanent on-device storage
  const [matches, setMatches] = useState<MatchWithLastMessage[]>(() =>
    getPermanentMatches(currentProfile.id)
  )
  // Only show full-screen loader if there is literally zero cached data
  const [isLoading, setIsLoading] = useState<boolean>(() => matches.length === 0)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [selectedPartner, setSelectedPartner] = useState<Profile | null>(null)

  // Android Back Button Interceptor for Partner Profile Modal
  useEffect(() => {
    const unregister = backButtonService.register('matches_modals', 90, () => {
      if (selectedPartner) {
        setSelectedPartner(null)
        return true
      }
      return false
    })

    return () => unregister()
  }, [selectedPartner])

  // Helper to re-enrich matches with local Dexie messages in under 2ms
  const enrichWithLocalMessages = useCallback(
    async (list: MatchRecord[]): Promise<MatchWithLastMessage[]> => {
      return Promise.all(
        list.map(async (match) => {
          const msgs = await db.getMessagesForMatch(match.id)
          const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : undefined
          const unreadCount = msgs.filter(
            (m) => m.senderId !== currentProfile.id && m.status !== 'read'
          ).length

          return {
            ...match,
            lastMessage: lastMsg,
            unreadCount,
          }
        })
      )
    },
    [currentProfile.id]
  )

  // Fast on-device refresh of last messages & unread counts without network delay
  const refreshFromLocalDatabase = useCallback(async () => {
    const cached = getPermanentMatches(currentProfile.id)
    if (cached && cached.length > 0) {
      const enriched = await enrichWithLocalMessages(cached)
      setMatches(enriched)
      setIsLoading(false)
    }
  }, [currentProfile.id, enrichWithLocalMessages])

  // Non-blocking background network sync with Supabase
  const syncMatchesWithNetwork = useCallback(async () => {
    // Only toggle isLoading if we have no matches displayed yet
    if (matches.length === 0) {
      setIsLoading(true)
    }
    setIsSyncing(true)
    try {
      const remoteList = await api.fetchMatches(currentProfile.id)
      const enriched = await enrichWithLocalMessages(remoteList)

      setMatches(enriched)
      // Save directly to permanent device storage
      savePermanentMatches(currentProfile.id, enriched)
    } catch (err) {
      console.warn('Network sync for connections postponed/offline:', err)
    } finally {
      setIsLoading(false)
      setIsSyncing(false)
    }
  }, [currentProfile.id, enrichWithLocalMessages, matches.length])

  useEffect(() => {
    // Step 1: Immediate instant local render
    refreshFromLocalDatabase()
    // Step 2: Background network sync
    syncMatchesWithNetwork()
  }, [refreshFromLocalDatabase, syncMatchesWithNetwork])

  const isUserFemale = currentProfile.gender === 'female'

  return (
    <div className="flex-1 flex flex-col px-4 py-4 space-y-4 select-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
            <MessageCircle className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white leading-none">Connections</h1>
            <p className="text-[10px] text-slate-400">Zero-Cloud P2P Direct Messaging</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {isSyncing && (
            <span className="text-[10px] text-slate-400 font-medium flex items-center space-x-1">
              <RefreshCw className="w-3 h-3 animate-spin text-rose-400" />
              <span>Syncing...</span>
            </span>
          )}
          <button
            type="button"
            onClick={syncMatchesWithNetwork}
            className="text-xs text-rose-400 hover:text-rose-300 font-medium"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Initiation Notice Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex items-start space-x-2.5">
        <div className="p-1 rounded-lg bg-rose-500/10 text-rose-400 shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="text-[11px] text-slate-300 leading-relaxed">
          <strong className="text-white block font-semibold">Female-First Safety Architecture:</strong>
          {isUserFemale ? (
            <span>You hold the key to begin conversations. Matches cannot message or connect until you make the first move.</span>
          ) : (
            <span>Only female members can dispatch the initial message. Once she says hello, direct chat opens!</span>
          )}
        </div>
      </div>

      {/* Matches List */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-2 text-slate-500">
            <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Loading campus matches...</span>
          </div>
        ) : matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 bg-slate-900/40 rounded-2xl border border-slate-800 p-6">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500">
              <MessageCircle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-sm text-white">No Active Chats Yet</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                Explore the Discover tab and like profiles to start matching with verified campus members.
              </p>
            </div>
          </div>
        ) : (
          matches.map((match) => {
            const partner = match.partner
            if (!partner) return null

            const isDeactivated = partner.is_deactivated
            const isFemaleInitiated = match.has_female_initiated
            const canMaleChat = isUserFemale || isFemaleInitiated
            const avatarUrl = partner.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'

            return (
              <div
                key={match.id}
                onClick={() => onSelectMatch(match)}
                className={`w-full border rounded-2xl p-3.5 flex items-center justify-between cursor-pointer transition-all shadow-sm ${
                  isDeactivated
                    ? 'bg-rose-950/20 border-rose-900/40 opacity-75'
                    : 'bg-slate-900 hover:bg-slate-850 active:bg-slate-800/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  {/* Avatar: WhatsApp style round avatar */}
                  <div
                    className="relative shrink-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (!isDeactivated && partner) {
                        setSelectedPartner(partner)
                      }
                    }}
                    title="Tap to view student details"
                  >
                    {isDeactivated ? (
                      <div className="w-12 h-12 rounded-full bg-slate-950 border border-rose-900/60 flex items-center justify-center">
                        <UserX className="w-6 h-6 text-rose-500" />
                      </div>
                    ) : (
                      <img
                        src={avatarUrl}
                        alt={partner.full_name}
                        className="w-12 h-12 rounded-full object-cover border border-slate-700 bg-slate-800 hover:opacity-90 active:scale-95 transition-all shadow-md"
                      />
                    )}
                    {match.unreadCount && !isDeactivated ? (
                      <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900">
                        {match.unreadCount}
                      </span>
                    ) : null}
                  </div>

                  {/* Partner Details & Last Message */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-1.5">
                      <h4 className="font-bold text-sm text-white truncate">
                        {isDeactivated ? 'User Deactivated' : partner.full_name}
                      </h4>
                      {!isDeactivated && <span className="text-xs text-slate-400">{partner.age}</span>}
                      {partner.report_count > 0 && !isDeactivated && (
                        <span className="shrink-0 flex items-center text-[10px] text-amber-400 font-mono bg-amber-950/70 px-1.5 py-0.2 rounded border border-amber-800/50">
                          <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                          {partner.report_count}
                        </span>
                      )}
                    </div>

                    {!isDeactivated ? (
                      <p className="text-[11px] text-rose-400 font-medium truncate">
                        {partner.insta_handle}
                      </p>
                    ) : (
                      <p className="text-[11px] text-rose-400 font-medium truncate">
                        De-authenticated by Admin
                      </p>
                    )}

                    {/* Initiation / Chat status */}
                    <div className="mt-1 flex items-center space-x-1 text-[11px]">
                      {isDeactivated ? (
                        <span className="text-rose-400 text-[10px] font-semibold">
                          🚫 Chat Disabled
                        </span>
                      ) : !canMaleChat ? (
                        <span className="inline-flex items-center space-x-1 text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-800/30 font-medium">
                          <Lock className="w-3 h-3" />
                          <span>Waiting for her to initiate</span>
                        </span>
                      ) : match.lastMessage ? (
                        <span className="text-slate-400 truncate">
                          {match.lastMessage.senderId === currentProfile.id ? 'You: ' : ''}
                          {match.lastMessage.isDeleted
                            ? '🚫 This message was deleted'
                            : match.lastMessage.isViewOnce
                            ? '👁️ View-once photo'
                            : match.lastMessage.text || '📷 Media attachment'}
                        </span>
                      ) : (
                        <span className="text-emerald-400 inline-flex items-center space-x-1 font-medium">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>
                            {isUserFemale && !isFemaleInitiated
                              ? 'Tap to make first move'
                              : 'Connected • Tap to chat'}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 ml-2">
                  <ChevronRight className="w-5 h-5 text-slate-600" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Profile Detail Modal */}
      <ProfileModal
        isOpen={Boolean(selectedPartner)}
        profile={selectedPartner}
        onClose={() => setSelectedPartner(null)}
      />
    </div>
  )
}

export default Matches
