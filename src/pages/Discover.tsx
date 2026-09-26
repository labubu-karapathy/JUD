import React, { useState, useEffect, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Sparkles, RefreshCw, Filter, ShieldCheck, HeartHandshake } from 'lucide-react'
import { ProfileCard } from '../components/ProfileCard'
import { ReportModal } from '../components/ReportModal'
import { api, type Profile } from '../services/supabase'
import { db, type CachedProfile } from '../db'

interface DiscoverProps {
  currentProfile: Profile
  onNavigateToMatches: () => void
}

export const Discover: React.FC<DiscoverProps> = ({
  currentProfile,
  onNavigateToMatches,
}) => {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentIndex, setCurrentIndex] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [reportingProfile, setReportingProfile] = useState<Profile | null>(null)
  const [matchCelebration, setMatchCelebration] = useState<Profile | null>(null)

  // 1. Offline-First: Read directly from Dexie.js IndexedDB
  const loadLocalProfiles = useCallback(async () => {
    try {
      const cached = await db.getAllCachedProfiles()
      if (cached && cached.length > 0) {
        // Filter out current user and blocked profiles
        const filtered = cached.filter((p) => p.id !== currentProfile.id)
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
      const remoteProfiles = await api.fetchDiscoverProfiles(currentProfile.id)

      // Filter target gender preference
      const filtered = remoteProfiles.filter((p) => {
        if (currentProfile.target_gender === 'all') return true
        return p.gender === currentProfile.target_gender
      })

      setProfiles(filtered)

      // Cache into Dexie for offline-first availability
      const toCache: CachedProfile[] = filtered.map((p) => ({
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
        updated_at: p.updated_at || new Date().toISOString(),
      }))
      await db.upsertCachedProfiles(toCache)
    } catch (err) {
      console.warn('Sync with Supabase failed or offline. Keeping local cache.', err)
      await loadLocalProfiles()
    } finally {
      setIsLoading(false)
    }
  }, [currentProfile.id, currentProfile.target_gender, loadLocalProfiles])

  useEffect(() => {
    loadLocalProfiles().then(() => {
      syncWithSupabase()
    })
  }, [loadLocalProfiles, syncWithSupabase])

  const handleNext = () => {
    setCurrentIndex((prev) => prev + 1)
  }

  // Like action creates a match
  const handleLike = async (profile: Profile) => {
    try {
      const femaleId = currentProfile.gender === 'female' ? currentProfile.id : profile.id
      const maleId = currentProfile.gender === 'female' ? profile.id : currentProfile.id

      await api.createMatch(femaleId, maleId)
      setMatchCelebration(profile)
      setTimeout(() => {
        setMatchCelebration(null)
        handleNext()
      }, 1500)
    } catch (err) {
      console.error('Failed to create match:', err)
      handleNext()
    }
  }

  const handlePass = (_profile: Profile) => {
    handleNext()
  }

  // Block: directly writes to blocks table, increments block_count, removes from feed
  const handleBlock = async (profile: Profile) => {
    const confirmed = window.confirm(
      `Block ${profile.full_name}? They will not be able to see you or contact you, and their block counter will increase.`
    )
    if (!confirmed) return

    try {
      await api.blockUser(currentProfile.id, profile.id)
      await db.removeCachedProfile(profile.id)
      setProfiles((prev) => prev.filter((p) => p.id !== profile.id))
    } catch (err) {
      console.error('Error blocking user:', err)
    }
  }

  // Report: opens report modal
  const handleReport = (profile: Profile) => {
    setReportingProfile(profile)
  }

  const handleReportComplete = async (reportedId: string) => {
    await db.removeCachedProfile(reportedId)
    setProfiles((prev) => prev.filter((p) => p.id !== reportedId))
  }

  const currentCandidate = profiles[currentIndex]

  return (
    <div className="flex-1 flex flex-col justify-between px-4 py-3 select-none">
      {/* Top Header */}
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

        <button
          type="button"
          onClick={syncWithSupabase}
          disabled={isLoading}
          title="Sync with Campus Network"
          className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-all active:scale-95"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-rose-400' : ''}`} />
        </button>
      </div>

      {/* Main Card Viewport */}
      <div className="flex-1 flex items-center justify-center py-2 relative">
        {matchCelebration && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md rounded-3xl p-6 text-center animate-fade-in space-y-3">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/30">
              <HeartHandshake className="w-8 h-8 animate-bounce" />
            </div>
            <h3 className="text-xl font-black text-white">It's a Match!</h3>
            <p className="text-xs text-slate-300 max-w-xs">
              You and <span className="font-bold text-rose-400">{matchCelebration.full_name}</span> are now matched on JUD.
            </p>
            {currentProfile.gender === 'female' ? (
              <p className="text-[11px] text-emerald-400 bg-emerald-950/60 px-3 py-1.5 rounded-full border border-emerald-800">
                You have first-move privilege! Open Chats to initiate.
              </p>
            ) : (
              <p className="text-[11px] text-amber-400 bg-amber-950/60 px-3 py-1.5 rounded-full border border-amber-800">
                Female-First rule: Chat unlocks as soon as she initiates!
              </p>
            )}
            <button
              type="button"
              onClick={onNavigateToMatches}
              className="mt-2 py-2 px-5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-600/30"
            >
              Go to Chats
            </button>
          </div>
        )}

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
              onLike={handleLike}
              onPass={handlePass}
              onBlock={handleBlock}
              onReport={handleReport}
            />
          </AnimatePresence>
        ) : (
          <div className="w-full h-[520px] rounded-3xl bg-slate-900/60 border border-slate-800 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-400">
              <Filter className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-white">You're All Caught Up</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                No new profiles in your queue right now. Check back as more verified campus students join.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setCurrentIndex(0)
                syncWithSupabase()
              }}
              className="py-2.5 px-6 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all shadow-md shadow-rose-600/20"
            >
              Check Again
            </button>
          </div>
        )}
      </div>

      {/* Safety Notice Banner */}
      <div className="pt-1 pb-1 flex items-center justify-center space-x-1.5 text-[10px] text-slate-500">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Transparent bad-actor stats shown on all cards</span>
      </div>

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
