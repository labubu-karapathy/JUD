import React, { useState, useEffect, useCallback } from 'react'
import { Auth } from './pages/Auth'
import { Discover } from './pages/Discover'
import { Matches } from './pages/Matches'
import { ChatRoom } from './pages/ChatRoom'
import { ProfileView } from './pages/ProfileView'
import { BottomNav, type NavTab } from './components/BottomNav'
import { SecurityLock } from './components/SecurityLock'
import { InstallPwaBanner } from './components/InstallPwaBanner'
import { api, type Profile, type MatchRecord } from './services/supabase'
import { db } from './db'

export const App: React.FC = () => {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [activeChatMatch, setActiveChatMatch] = useState<MatchRecord | null>(null)
  const [isManualLocked, setIsManualLocked] = useState<boolean>(false)
  const [unreadCount, setUnreadCount] = useState<number>(0)

  // Load existing session/profile
  useEffect(() => {
    const initUser = async () => {
      try {
        const storedUserId = localStorage.getItem('jud_current_user_id')
        if (storedUserId) {
          // Check local Dexie first (offline-first)
          const cached = await db.getCachedProfile(storedUserId)
          if (cached) {
            setCurrentProfile(cached as Profile)
          }

          // Then verify/sync with remote Supabase
          const remote = await api.getProfile(storedUserId)
          if (remote) {
            setCurrentProfile(remote)
          }
        }
      } catch (err) {
        console.error('Failed to restore session:', err)
      } finally {
        setIsLoadingAuth(false)
      }
    }

    initUser()
  }, [])

  // Poll/track unread count for bottom nav badge
  const updateUnreadBadge = useCallback(async () => {
    if (!currentProfile) return
    try {
      const allMsgs = await db.local_messages.toArray()
      const unread = allMsgs.filter(
        (m) => m.senderId !== currentProfile.id && m.status !== 'read'
      ).length
      setUnreadCount(unread)
    } catch (e) {
      console.error('Error getting unread count:', e)
    }
  }, [currentProfile])

  useEffect(() => {
    updateUnreadBadge()
    const interval = setInterval(updateUnreadBadge, 3000)
    return () => clearInterval(interval)
  }, [updateUnreadBadge])

  const handleAuthSuccess = (profile: Profile) => {
    setCurrentProfile(profile)
    setActiveTab('discover')
  }

  const handleLogout = () => {
    const confirmed = window.confirm('Are you sure you want to log out?')
    if (!confirmed) return

    localStorage.removeItem('jud_current_user_id')
    setCurrentProfile(null)
    setActiveChatMatch(null)
    setActiveTab('discover')
  }

  if (isLoadingAuth) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center space-y-4">
        <img
          src="/icon.png"
          alt="Jadavpur Love Birds"
          className="w-20 h-20 rounded-3xl shadow-2xl shadow-indigo-500/20 object-cover border border-slate-800 animate-pulse"
        />
        <div className="text-center">
          <h2 className="text-base font-bold text-white tracking-tight">Jadavpur Love Birds</h2>
          <p className="text-[11px] text-slate-400 font-medium">Securing P2P Campus Network...</p>
        </div>
      </div>
    )
  }

  return (
    <SecurityLock
      userFullName={currentProfile?.full_name}
      isLockedManual={isManualLocked}
      onManualUnlock={() => setIsManualLocked(false)}
    >
      <div className="max-w-md mx-auto min-h-screen bg-slate-950 text-white shadow-2xl relative flex flex-col overflow-hidden border-x border-slate-900/60">
        {!currentProfile ? (
          <Auth onAuthSuccess={handleAuthSuccess} />
        ) : activeChatMatch ? (
          <ChatRoom
            currentProfile={currentProfile}
            match={activeChatMatch}
            onBack={() => {
              setActiveChatMatch(null)
              updateUnreadBadge()
            }}
            onUserBlocked={() => {
              setActiveChatMatch(null)
              setActiveTab('discover')
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {activeTab === 'discover' && (
              <Discover
                currentProfile={currentProfile}
                onNavigateToMatches={() => setActiveTab('matches')}
              />
            )}

            {activeTab === 'matches' && (
              <Matches
                currentProfile={currentProfile}
                onSelectMatch={(match) => setActiveChatMatch(match)}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                currentProfile={currentProfile}
                onLogout={handleLogout}
              />
            )}

            {/* Persistent Mobile Bottom Navigation */}
            <BottomNav
              currentTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab)
                updateUnreadBadge()
              }}
              onManualLock={() => setIsManualLocked(true)}
              unreadCount={unreadCount}
            />
          </div>
        )}

        {/* iOS Safari PWA Installation Prompt */}
        <InstallPwaBanner />
      </div>
    </SecurityLock>
  )
}

export default App
