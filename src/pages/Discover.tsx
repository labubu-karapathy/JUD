import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  RefreshCw,
  Filter,
  ShieldCheck,
  HeartHandshake,
  Search,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  X,
  MessageCircle,
  UserCheck,
  Heart,
} from 'lucide-react'
import { ProfileCard } from '../components/ProfileCard'
import { ReportModal } from '../components/ReportModal'
import { api, type Profile, type ChatRequest, type MatchRecord } from '../services/supabase'
import { db, type CachedProfile } from '../db'
import { backButtonService } from '../services/backButtonService'

interface DiscoverProps {
  currentProfile: Profile
  onNavigateToMatches: () => void
  onSelectMatch?: (match: MatchRecord) => void
}

export const Discover: React.FC<DiscoverProps> = ({
  currentProfile,
  onNavigateToMatches,
  onSelectMatch,
}) => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [reportingProfile, setReportingProfile] = useState<Profile | null>(null)
  const [matchCelebration, setMatchCelebration] = useState<{ profile: Profile; isRequest?: boolean } | null>(null)

  // Instagram-style Account Search
  const [searchQuery, setSearchQuery] = useState<string>('')

  // Chat Requests state
  const [chatRequests, setChatRequests] = useState<ChatRequest[]>([])
  const [isRequestsDrawerOpen, setIsRequestsDrawerOpen] = useState<boolean>(false)

  // Matches and Blocks state
  const [userMatches, setUserMatches] = useState<MatchRecord[]>([])
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set())

  // Crossed / Passed Profiles state (persisted locally per user)
  const [passedUserIds, setPassedUserIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`jud_passed_profiles_${currentProfile.id}`)
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  const isUserFemale = currentProfile.gender === 'female'

  // Android Back Button Interceptor for Modals & Drawers
  useEffect(() => {
    const unregister = backButtonService.register('discover_modals', 90, () => {
      if (matchCelebration) {
        setMatchCelebration(null)
        return true
      }
      if (reportingProfile) {
        setReportingProfile(null)
        return true
      }
      if (isRequestsDrawerOpen) {
        setIsRequestsDrawerOpen(false)
        return true
      }
      if (searchQuery) {
        setSearchQuery('')
        return true
      }
      return false
    })

    return () => unregister()
  }, [matchCelebration, reportingProfile, isRequestsDrawerOpen, searchQuery])

  // Load chat requests
  const loadChatRequests = useCallback(async () => {
    try {
      const reqs = await api.getChatRequests(currentProfile.id)
      setChatRequests(reqs)
    } catch (e) {
      console.error('Failed to load chat requests:', e)
    }
  }, [currentProfile.id])

  // Load active matches and blocked users
  const loadMatchesAndBlocks = useCallback(async () => {
    try {
      const [matches, blocked] = await Promise.all([
        api.fetchMatches(currentProfile.id),
        api.getBlockedUsers(currentProfile.id),
      ])
      setUserMatches(matches)
      setBlockedUserIds(new Set(blocked.map((b) => b.id)))
    } catch (e) {
      console.error('Failed to load matches and blocks:', e)
    }
  }, [currentProfile.id])

  // 1. Offline-First: Read directly from Dexie.js IndexedDB
  const loadLocalProfiles = useCallback(async () => {
    try {
      const cached = await db.getAllCachedProfiles()
      if (cached && cached.length > 0) {
        const filtered = cached.filter((p) => p.id !== currentProfile.id && !p.is_deactivated && p.is_approved !== false)
        setProfiles(filtered as Profile[])
      }
    } catch (err) {
      console.error('Error reading offline profiles from Dexie:', err)
    }
  }, [currentProfile.id])

  // 2. Sync: Pull updates from Supabase Realtime & remote store
  const syncWithSupabase = useCallback(async () => {
    setIsLoading(true)
    try {
      await Promise.all([
        loadChatRequests(),
        loadMatchesAndBlocks(),
      ])

      const remoteProfiles = await api.fetchDiscoverProfiles(currentProfile.id, currentProfile.gender)
      setProfiles(remoteProfiles)

      // Cache into Dexie for offline-first availability
      const toCache: CachedProfile[] = remoteProfiles.map((p) => ({
        id: p.id,
        full_name: p.full_name,
        gender: p.gender,
        target_gender: p.target_gender,
        age: p.age,
        bio: p.bio,
        insta_handle: p.insta_handle,
        library_card_hash: p.library_card_hash,
        photo_urls: p.photo_urls,
        is_verified: p.is_verified,
        report_count: p.report_count,
        block_count: p.block_count,
        department: p.department,
        grad_year: p.grad_year,
        is_approved: p.is_approved,
        is_deactivated: p.is_deactivated,
        active_chat_count: p.active_chat_count,
        updated_at: p.updated_at || new Date().toISOString(),
      }))

      // Clear stale cached profiles first so purged/deleted server profiles disappear locally
      await db.cached_profiles.clear()
      if (toCache.length > 0) {
        await db.upsertCachedProfiles(toCache)
      }
    } catch (err) {
      console.warn('Sync with Supabase failed or offline. Keeping local cache.', err)
      await loadLocalProfiles()
    } finally {
      setIsLoading(false)
    }
  }, [currentProfile.id, currentProfile.gender, loadChatRequests, loadMatchesAndBlocks, loadLocalProfiles])

  useEffect(() => {
    loadLocalProfiles().then(() => {
      syncWithSupabase()
    })
  }, [loadLocalProfiles, syncWithSupabase])

  // Set of partner IDs where active chat/match exists
  const matchedPartnerIds = useMemo(() => {
    const set = new Set<string>()
    for (const m of userMatches) {
      const partnerId = m.female_id === currentProfile.id ? m.male_id : m.female_id
      if (partnerId) set.add(partnerId)
    }
    return set
  }, [userMatches, currentProfile.id])

  // Lookup map to get MatchRecord by partner ID
  const matchesByPartnerId = useMemo(() => {
    const map = new Map<string, MatchRecord>()
    for (const m of userMatches) {
      const partnerId = m.female_id === currentProfile.id ? m.male_id : m.female_id
      if (partnerId) map.set(partnerId, m)
    }
    return map
  }, [userMatches, currentProfile.id])

  // Incoming pending requests for female user
  const incomingPendingRequests = useMemo(() => {
    return chatRequests.filter((r) => r.receiver_id === currentProfile.id && r.status === 'pending')
  }, [chatRequests, currentProfile.id])

  // Map of requests sent by current user
  const mySentRequestsMap = useMemo(() => {
    const map = new Map<string, 'pending' | 'accepted' | 'rejected'>()
    for (const r of chatRequests) {
      if (r.sender_id === currentProfile.id) {
        map.set(r.receiver_id, r.status)
      }
    }
    return map
  }, [chatRequests, currentProfile.id])

  // 1. Recommendation Queue (Cards View):
  // Excludes:
  // - Self
  // - Users where chat already exists (matched!)
  // - Blocked users
  // - Crossed / Passed users (unless searched explicitly)
  // - Gender target mismatches
  const recommendationCandidates = useMemo(() => {
    return profiles.filter((p) => {
      if (p.id === currentProfile.id) return false
      if (p.is_deactivated || p.is_approved === false) return false
      // Exclude once chatting starts
      if (matchedPartnerIds.has(p.id)) return false
      // Exclude once blocked
      if (blockedUserIds.has(p.id)) return false
      // Exclude once crossed/passed
      if (passedUserIds.has(p.id)) return false
      // Gender target preference
      if (currentProfile.target_gender !== 'all' && p.gender !== currentProfile.target_gender) return false
      return true
    })
  }, [profiles, currentProfile.id, currentProfile.target_gender, matchedPartnerIds, blockedUserIds, passedUserIds])

  // 2. Explicit Search Results (Row-wise Instagram format):
  // Displays matching students even if previously crossed!
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return profiles.filter((p) => {
      if (p.id === currentProfile.id) return false
      if (p.is_deactivated || p.is_approved === false) return false
      const nameMatch = p.full_name?.toLowerCase().includes(q)
      const handleMatch = p.insta_handle?.toLowerCase().includes(q)
      const deptMatch = p.department?.toLowerCase().includes(q)
      const cardMatch = p.library_card_hash?.toLowerCase().includes(q)
      return Boolean(nameMatch || handleMatch || deptMatch || cardMatch)
    })
  }, [profiles, currentProfile.id, searchQuery])

  const handleNext = () => {
    setCurrentIndex((prev) => prev + 1)
  }

  // Like action:
  // Male user: Cannot directly open chat. Sends chat_request!
  // Female user: Can directly match and initiate!
  const handleLike = async (profile: Profile) => {
    try {
      if (!isUserFemale) {
        // Male user -> Chat Request Barrier
        await api.sendChatRequest(currentProfile.id, profile.id)
        await loadChatRequests()
        setMatchCelebration({ profile, isRequest: true })
        setTimeout(() => {
          setMatchCelebration(null)
          handleNext()
        }, 1800)
      } else {
        // Female user -> Instant Match
        const newMatch = await api.createMatch(currentProfile.id, profile.id)
        await loadMatchesAndBlocks()
        setMatchCelebration({ profile, isRequest: false })
        setTimeout(() => {
          setMatchCelebration(null)
          handleNext()
        }, 1500)
      }
    } catch (err) {
      console.error('Failed to process like/request:', err)
      handleNext()
    }
  }

  // Pass / Cross action:
  // Persisted in local storage so this person is never recommended again unless searched explicitly!
  const handlePass = (profile: Profile) => {
    const updated = new Set(passedUserIds)
    updated.add(profile.id)
    setPassedUserIds(updated)
    try {
      localStorage.setItem(`jud_passed_profiles_${currentProfile.id}`, JSON.stringify(Array.from(updated)))
    } catch (e) {
      console.warn('Failed to save passed profile:', e)
    }
    handleNext()
  }

  // Block action
  const handleBlock = async (profile: Profile) => {
    const confirmed = window.confirm(
      `Block ${profile.full_name}? They will not be able to see you or contact you, and their block counter will increase.`
    )
    if (!confirmed) return

    try {
      await api.blockUser(currentProfile.id, profile.id)
      await db.removeCachedProfile(profile.id)
      setBlockedUserIds((prev) => new Set(prev).add(profile.id))
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id))
    } catch (err) {
      console.error('Error blocking user:', err)
    }
  }

  // Unblock action (from explicit search row)
  const handleUnblock = async (profile: Profile) => {
    try {
      await api.unblockUser(currentProfile.id, profile.id)
      setBlockedUserIds((prev) => {
        const next = new Set(prev)
        next.delete(profile.id)
        return next
      })
    } catch (err) {
      console.error('Error unblocking user:', err)
    }
  }

  // Report action
  const handleReport = (profile: Profile) => {
    setReportingProfile(profile)
  }

  const handleReportComplete = async (reportedId: string) => {
    await db.removeCachedProfile(reportedId)
    setProfiles((prev) => prev.filter((p) => p.id !== reportedId))
  }

  // Respond to incoming chat request (for females)
  const handleRespondRequest = async (requestId: string, status: 'accepted' | 'rejected') => {
    try {
      await api.respondChatRequest(requestId, status)
      await Promise.all([loadChatRequests(), loadMatchesAndBlocks()])
      if (status === 'accepted') {
        alert('Chat request accepted! You are now matched and can open Chats.')
      }
    } catch (e: any) {
      alert(e.message || 'Failed to update request')
    }
  }

  const currentCandidate = recommendationCandidates[currentIndex]
  const candidateRequestStatus = currentCandidate ? mySentRequestsMap.get(currentCandidate.id) : null

  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3 select-none relative overflow-hidden">
      {/* Top Header */}
      <div className="space-y-2 shrink-0">
        <div className="flex items-center justify-between py-1">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Discover</h1>
              <p className="text-[10px] text-slate-400">Campus Matches • Safety Transparency</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Female-First Notification Drawer Bell */}
            {isUserFemale && (
              <button
                type="button"
                onClick={() => setIsRequestsDrawerOpen(true)}
                title={`${incomingPendingRequests.length} pending chat requests`}
                className="relative p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              >
                <Bell className="w-4 h-4 text-rose-400" />
                {incomingPendingRequests.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
                    {incomingPendingRequests.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={syncWithSupabase}
              disabled={isLoading}
              title="Sync with Campus Network"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-all active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Universal Search Bar (Instagram-style account finder) */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentIndex(0)
            }}
            placeholder="Search students by name, @instagram, or dept..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Viewport: Swappable between Instagram Search Results and Swipe Deck */}
      <div className="flex-1 min-h-0 py-2 relative flex flex-col justify-center">
        {matchCelebration && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md rounded-3xl p-6 text-center animate-fade-in space-y-3">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/30">
              <HeartHandshake className="w-8 h-8 animate-bounce" />
            </div>
            {matchCelebration.isRequest ? (
              <>
                <h3 className="text-lg font-black text-white">Chat Request Dispatched!</h3>
                <p className="text-xs text-slate-300 max-w-xs leading-relaxed">
                  Your chat request has been delivered to{' '}
                  <span className="font-bold text-rose-400">{matchCelebration.profile.full_name}</span>. Under campus safety rules, direct messaging unlocks as soon as she accepts.
                </p>
                <div className="flex items-center space-x-1.5 text-[11px] text-amber-400 bg-amber-950/60 px-3 py-1.5 rounded-full border border-amber-800">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Status: Request Pending</span>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-black text-white">It's a Match!</h3>
                <p className="text-xs text-slate-300 max-w-xs">
                  You and <span className="font-bold text-rose-400">{matchCelebration.profile.full_name}</span> are matched!
                </p>
                <p className="text-[11px] text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-full border border-emerald-800">
                  First-move privilege active!
                </p>
                <button
                  type="button"
                  onClick={onNavigateToMatches}
                  className="mt-2 py-2 px-5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30"
                >
                  Go to Chats
                </button>
              </>
            )}
          </div>
        )}

        {/* 1. EXPLICIT SEARCH ACTIVE: INSTAGRAM-STYLE ROW LIST */}
        {searchQuery.trim() ? (
          <div className="h-full flex flex-col min-h-0">
            <div className="flex items-center justify-between pb-2 text-[11px] text-slate-400">
              <span>Search Results ({searchResults.length})</span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-rose-400 hover:underline"
              >
                Back to Recommendations
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
              {searchResults.length === 0 ? (
                <div className="h-64 rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-white">No Students Found</h4>
                  <p className="text-xs text-slate-400 max-w-xs">
                    No verified campus students match "{searchQuery}". Try searching by department or Instagram handle.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-xs text-rose-400 hover:underline font-semibold"
                  >
                    Clear Search
                  </button>
                </div>
              ) : (
                searchResults.map((p) => {
                  const isMatched = matchedPartnerIds.has(p.id)
                  const isBlocked = blockedUserIds.has(p.id)
                  const isPassed = passedUserIds.has(p.id)
                  const reqStatus = mySentRequestsMap.get(p.id)

                  return (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-900/90 hover:bg-slate-900 border border-slate-800/90 rounded-2xl flex items-center justify-between space-x-3 transition-all"
                    >
                      {/* Left: Instagram Avatar & Details */}
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <div className="relative shrink-0">
                          <img
                            src={p.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
                            alt={p.full_name}
                            className="w-12 h-12 rounded-full object-cover border border-slate-700 bg-slate-950"
                          />
                          {p.is_verified && (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-blue-500 text-white rounded-full p-0.5 border border-slate-950">
                              <ShieldCheck className="w-2.5 h-2.5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 text-left">
                          <div className="flex items-center space-x-1.5">
                            <h4 className="font-semibold text-xs text-white truncate">{p.full_name}</h4>
                            <span className="text-[10px] text-slate-400 font-mono">({p.age})</span>
                          </div>
                          <p className="text-[11px] text-rose-400 font-medium truncate">{p.insta_handle}</p>
                          <div className="flex items-center space-x-1 text-[10px] text-slate-400 truncate mt-0.5">
                            <Building2 className="w-3 h-3 text-sky-400 shrink-0" />
                            <span className="truncate">{p.department || 'General'}</span>
                            {p.grad_year && <span>• '{String(p.grad_year).slice(-2)}</span>}
                          </div>

                          {/* Status badges */}
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {isMatched && (
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-medium">
                                Chatting
                              </span>
                            )}
                            {reqStatus === 'pending' && (
                              <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 rounded-full font-medium">
                                Request Sent
                              </span>
                            )}
                            {isPassed && !isMatched && (
                              <span className="text-[9px] bg-slate-800 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded-full">
                                Previously Passed
                              </span>
                            )}
                            {isBlocked && (
                              <span className="text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded-full">
                                Blocked
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Instagram-style Action Button */}
                      <div className="shrink-0 flex items-center space-x-1.5">
                        {isBlocked ? (
                          <button
                            type="button"
                            onClick={() => handleUnblock(p)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all"
                          >
                            Unblock
                          </button>
                        ) : isMatched ? (
                          <button
                            type="button"
                            onClick={() => {
                              const match = matchesByPartnerId.get(p.id)
                              if (match && onSelectMatch) {
                                onSelectMatch(match)
                              } else {
                                onNavigateToMatches()
                              }
                            }}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-sm transition-all"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-rose-400" />
                            <span>Chat</span>
                          </button>
                        ) : isUserFemale ? (
                          <button
                            type="button"
                            onClick={() => handleLike(p)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/30 transition-all flex items-center space-x-1"
                          >
                            <Heart className="w-3.5 h-3.5" />
                            <span>Match</span>
                          </button>
                        ) : reqStatus === 'pending' ? (
                          <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-500 text-xs font-medium">
                            Pending
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleLike(p)}
                            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/30 transition-all"
                          >
                            Request
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        ) : (
          /* 2. REGULAR RECOMMENDATIONS DECK (Zero Matched, Blocked, or Crossed Profiles) */
          <div className="h-full flex items-center justify-center">
            {isLoading && profiles.length === 0 ? (
              <div className="flex flex-col items-center space-y-3 text-slate-400">
                <RefreshCw className="w-8 h-8 animate-spin text-rose-500" />
                <p className="text-xs">Finding verified campus profiles...</p>
              </div>
            ) : currentCandidate ? (
              <AnimatePresence mode="wait">
                <ProfileCard
                  key={currentCandidate.id}
                  profile={currentCandidate}
                  viewerProfile={currentProfile}
                  requestStatus={candidateRequestStatus}
                  onLike={handleLike}
                  onPass={handlePass}
                  onBlock={handleBlock}
                  onReport={handleReport}
                />
              </AnimatePresence>
            ) : (
              <div className="w-full h-[500px] rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
                  <Filter className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-bold text-base text-white">You're All Caught Up</h3>
                  <p className="text-xs text-slate-400 max-w-xs">
                    No new profiles in your recommendation queue. Students you're chatting with, have blocked, or have crossed are hidden.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentIndex(0)
                      syncWithSupabase()
                    }}
                    className="py-2.5 px-5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-rose-600/20"
                  >
                    Sync Campus Network
                  </button>

                  {passedUserIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        localStorage.removeItem(`jud_passed_profiles_${currentProfile.id}`)
                        setPassedUserIds(new Set())
                        setCurrentIndex(0)
                      }}
                      className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700"
                    >
                      Reset Crossed ({passedUserIds.size})
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Safety Notice Banner */}
      <div className="pt-1 pb-1 flex items-center justify-center space-x-1.5 text-[10px] text-slate-500 shrink-0">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Bad-actor metrics & verified campus credentials displayed</span>
      </div>

      {/* --- FEMALE CHAT REQUESTS DRAWER --- */}
      {isRequestsDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Bell className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-sm text-white">Incoming Chat Requests</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsRequestsDrawerOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {incomingPendingRequests.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No pending chat requests at this time.
                </div>
              ) : (
                incomingPendingRequests.map((req) => {
                  const sender = req.sender
                  if (!sender) return null

                  return (
                    <div
                      key={req.id}
                      className="bg-slate-950 border border-slate-800 rounded-2xl p-3.5 flex items-center justify-between space-x-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <img
                          src={sender.photo_urls?.[0] || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80'}
                          alt={sender.full_name}
                          className="w-12 h-12 rounded-xl object-cover border border-slate-800 bg-slate-900"
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-white truncate">{sender.full_name}</h4>
                          <p className="text-[10px] text-rose-400 font-medium truncate">{sender.insta_handle}</p>
                          <div className="flex items-center space-x-1 text-[9px] text-slate-400 mt-0.5">
                            <Building2 className="w-3 h-3 text-sky-400" />
                            <span className="truncate">{sender.department || 'General'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRespondRequest(req.id, 'rejected')}
                          title="Decline"
                          className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-800 transition-all"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespondRequest(req.id, 'accepted')}
                          title="Accept"
                          className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/30"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      <ReportModal
        isOpen={Boolean(reportingProfile)}
        targetProfile={reportingProfile}
        currentUserId={currentProfile.id}
        onClose={() => setReportingProfile(null)}
        onReported={handleReportComplete}
      />
    </div>
  )
}

export default Discover
