import React, { useState, useEffect, useCallback } from 'react'
import { Auth } from './pages/Auth'
import { Discover } from './pages/Discover'
import { Matches } from './pages/Matches'
import { ChatRoom } from './pages/ChatRoom'
import { ProfileView } from './pages/ProfileView'
import { AdminDashboard } from './admin/AdminDashboard'
import { BottomNav, type NavTab } from './components/BottomNav'
import { SecurityLock } from './components/SecurityLock'
import { InstallPwaBanner } from './components/InstallPwaBanner'
import { api, type Profile, type MatchRecord, type GlobalAnnouncement, isAutoApprovalActive } from './services/supabase'
import { db } from './db'
import { AlertOctagon, Radio, X, Sparkles, Download } from 'lucide-react'
import { checkForUpdate, downloadAndInstallUpdate, applyOtaUpdate, type ReleaseManifest } from './services/updateService'
import { drainOfflineMessages } from './services/offlineQueue'
import { GlobalCampusChatDrawer } from './components/GlobalCampusChatDrawer'
import { backButtonService } from './services/backButtonService'

export const App: React.FC = () => {
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null)
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true)
  const [activeTab, setActiveTab] = useState<NavTab>('discover')
  const [tabHistory, setTabHistory] = useState<NavTab[]>(['discover'])
  const [showExitToast, setShowExitToast] = useState<boolean>(false)
  const [activeChatMatch, setActiveChatMatch] = useState<MatchRecord | null>(null)
  const [isManualLocked, setIsManualLocked] = useState<boolean>(false)
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [activeAnnouncement, setActiveAnnouncement] = useState<GlobalAnnouncement | null>(null)
  const [updateManifest, setUpdateManifest] = useState<ReleaseManifest | null>(null)
  const [isOtaAvailable, setIsOtaAvailable] = useState<boolean>(false)
  const [isUpdating, setIsUpdating] = useState<boolean>(false)
  const [isGlobalChatOpen, setIsGlobalChatOpen] = useState<boolean>(false)

  // Route state: User Interface vs Admin Desktop Suite
  const [isAdminRoute, setIsAdminRoute] = useState<boolean>(() => {
    return (
      typeof window !== 'undefined' &&
      (window.location.hash.startsWith('#/admin') || window.location.pathname.startsWith('/admin'))
    )
  })

  // Listen to hash changes for #/admin
  useEffect(() => {
    const handleHashChange = () => {
      setIsAdminRoute(
        window.location.hash.startsWith('#/admin') || window.location.pathname.startsWith('/admin')
      )
    }
    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener('popstate', handleHashChange)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('popstate', handleHashChange)
    }
  }, [])

  // Initialize Privacy Screen for Android / iOS
  useEffect(() => {
    const initPrivacyScreen = async () => {
      try {
        const { PrivacyScreen } = await import('@capacitor-community/privacy-screen')
        await PrivacyScreen.enable()
      } catch {
        // Expected in standard browser web environment
      }
    }
    initPrivacyScreen()
  }, [])

  // Load existing session/profile and purge legacy dummy data
  useEffect(() => {
    const initUser = async () => {
      try {
        // Clean legacy mock localStorage keys
        localStorage.removeItem('jud_mock_profiles')
        localStorage.removeItem('jud_mock_matches')
        localStorage.removeItem('jud_mock_blocks')
        localStorage.removeItem('jud_mock_reports')
        localStorage.removeItem('jud_mock_chat_requests')

        // Purge known legacy false students from local Dexie IndexedDB cache
        const DUMMY_IDS = [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555555',
          '66666666-6666-4666-8666-666666666666',
          'e954a879-d9f1-493b-92ed-5a58ffe70663'
        ]
        for (const dummyId of DUMMY_IDS) {
          await db.cached_profiles.delete(dummyId)
        }

        const storedUserId = localStorage.getItem('jud_current_user_id')
        if (storedUserId) {
          if (DUMMY_IDS.includes(storedUserId)) {
            localStorage.removeItem('jud_current_user_id')
            await db.cached_profiles.clear()
            setCurrentProfile(null)
          } else {
            // Verify session with remote Supabase
            const remote = await api.getProfile(storedUserId)
            if (remote) {
              setCurrentProfile(remote)
            } else {
              // Remote profile was deleted/purged on server
              localStorage.removeItem('jud_current_user_id')
              await db.cached_profiles.clear()
              setCurrentProfile(null)
            }
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

  // Global Announcements Subscription
  useEffect(() => {
    const unsub = api.subscribeGlobalAnnouncements((announcement) => {
      setActiveAnnouncement(announcement)
    })
    return () => unsub()
  }, [])

  // 12-Hour Promotional Window: Auto-approve unapproved students immediately
  useEffect(() => {
    if (
      currentProfile &&
      currentProfile.is_approved === false &&
      !currentProfile.is_deactivated &&
      isAutoApprovalActive()
    ) {
      const approved = { ...currentProfile, is_approved: true }
      setCurrentProfile(approved)
      api.upsertProfile(approved).catch(() => {})
      localStorage.setItem('jud_saved_device_profile', JSON.stringify(approved))
    }
  }, [currentProfile])

  // Zero-Cost Fleet Auto-Updates (GitHub Releases CDN manifest check)
  useEffect(() => {
    const runUpdateCheck = async () => {
      try {
        const result = await checkForUpdate()
        if (result.hasUpdate && result.remoteManifest) {
          setUpdateManifest(result.remoteManifest)
          setIsOtaAvailable(result.isOtaAvailable)
        }
      } catch (err) {
        console.warn('[CDN Update Check Notice]:', err)
      }
    }

    runUpdateCheck()
    const timer = setInterval(runUpdateCheck, 30 * 60 * 1000)
    return () => clearInterval(timer)
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

  // Zero-Storage Ephemeral Offline Message Drain via Cloudflare Worker
  useEffect(() => {
    if (!currentProfile) return

    const handleDrain = async () => {
      try {
        const drained = await drainOfflineMessages(currentProfile.id)
        if (drained && drained.length > 0) {
          await updateUnreadBadge()
        }
      } catch (err) {
        console.warn('Failed to drain offline messages:', err)
      }
    }

    handleDrain()

    const inbox = api.createUserSignalChannel(currentProfile.id, async (payload) => {
      if (!payload) return
      if (payload.type === 'offline_queue_ping') {
        await handleDrain()
      } else if (payload.type === 'ack' && payload.messageId) {
        await db.updateMessageStatus(payload.messageId, payload.status)
      }
    })

    return () => {
      inbox.unsubscribe()
    }
  }, [currentProfile?.id, updateUnreadBadge])

  const handleNavigateTab = useCallback((tab: NavTab) => {
    setActiveTab(tab)
    setTabHistory((prev) => {
      if (prev[prev.length - 1] === tab) return prev
      return [...prev, tab]
    })
    updateUnreadBadge()
  }, [updateUnreadBadge])

  // Android Hardware / Gesture Back Button Global Orchestrator
  useEffect(() => {
    backButtonService.init((show) => setShowExitToast(show))

    const unregister = backButtonService.register('app_navigation', 10, () => {
      // 1. If Admin Route open: exit admin route
      if (isAdminRoute) {
        window.location.hash = ''
        setIsAdminRoute(false)
        return true
      }
      // 2. If Global Campus Chat drawer open: close it
      if (isGlobalChatOpen) {
        setIsGlobalChatOpen(false)
        return true
      }
      // 3. If in Active Chat: exit chat to matches list
      if (activeChatMatch !== null) {
        setActiveChatMatch(null)
        updateUnreadBadge()
        return true
      }
      // 4. Tab navigation history (e.g. Profile -> Matches -> Discover)
      if (tabHistory.length > 1) {
        const newHistory = [...tabHistory]
        newHistory.pop() // remove current tab
        const previousTab = newHistory[newHistory.length - 1] || 'discover'
        setTabHistory(newHistory)
        setActiveTab(previousTab)
        return true
      }
      // 5. If on another tab but history has only 1 element: return to 'discover'
      if (activeTab !== 'discover') {
        setActiveTab('discover')
        setTabHistory(['discover'])
        return true
      }
      // 6. At root of app: trigger double-tap exit toast!
      backButtonService.handleRootExit()
      return true
    })

    return () => unregister()
  }, [isAdminRoute, isGlobalChatOpen, activeChatMatch, tabHistory, activeTab, updateUnreadBadge])

  const handleAuthSuccess = (profile: Profile) => {
    setCurrentProfile(profile)
    setActiveTab('discover')
    setTabHistory(['discover'])
  }

  const handleLogout = () => {
    const confirmed = window.confirm('Are you sure you want to log out?')
    if (!confirmed) return

    localStorage.removeItem('jud_current_user_id')
    setCurrentProfile(null)
    setActiveChatMatch(null)
    setActiveTab('discover')
    setTabHistory(['discover'])
  }

  // --- ADMIN DESKTOP SUITE ROUTE ---
  if (isAdminRoute) {
    return (
      <AdminDashboard
        onExit={() => {
          window.location.hash = ''
          setIsAdminRoute(false)
        }}
      />
    )
  }

  // --- LOADING SCREEN ---
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

  // --- USER DEACTIVATION SCREEN ---
  if (currentProfile?.is_deactivated) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-4 border-x border-slate-900/60">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center shadow-xl">
          <AlertOctagon className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-white">Account De-Authenticated</h2>
        <p className="text-xs text-slate-300 leading-relaxed max-w-xs">
          Your profile has been de-authenticated by campus administrators in accordance with university safety protocols.
        </p>
        {currentProfile.deactivation_reason && (
          <div className="p-3 bg-rose-950/60 border border-rose-900/60 rounded-xl text-xs text-rose-300 text-left w-full">
            <span className="font-bold block text-[10px] uppercase">Reason Stated:</span>
            {currentProfile.deactivation_reason}
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl"
        >
          Log Out
        </button>
      </div>
    )
  }

  // --- PENDING ADMIN APPROVAL SCREEN ---
  if (currentProfile && currentProfile.is_approved === false && !currentProfile.is_deactivated) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6 text-center space-y-5 border-x border-slate-900/60">
        <div className="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shadow-xl">
          <img src="/icon.png" alt="JLB" className="w-12 h-12 rounded-2xl object-cover" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white">Profile Under Review</h2>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
            Your Jadavpur Love Birds profile is pending admin verification. Once approved, you'll gain full access to the campus network.
          </p>
        </div>
        <div className="w-full p-4 bg-amber-950/30 border border-amber-800/40 rounded-2xl space-y-2">
          <p className="text-[11px] text-amber-300 font-semibold uppercase tracking-wider">What happens next?</p>
          <ul className="text-[11px] text-amber-200/80 space-y-1 text-left list-disc list-inside">
            <li>Admin reviews your library card & profile details</li>
            <li>Approval typically happens within a few hours</li>
            <li>Refresh the app after approval to start matching</li>
          </ul>
        </div>
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={async () => {
              try {
                if (isAutoApprovalActive()) {
                  const approved = { ...currentProfile, is_approved: true }
                  await api.upsertProfile(approved)
                  setCurrentProfile(approved)
                  localStorage.setItem('jud_saved_device_profile', JSON.stringify(approved))
                  return
                }
                const refreshed = await api.getProfile(currentProfile.id)
                if (refreshed) setCurrentProfile(refreshed)
              } catch { /* silent */ }
            }}
            className="flex-1 py-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-2xl transition-all"
          >
            🔄 Check Approval Status
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-2xl transition-all"
          >
            Log Out
          </button>
        </div>
      </div>
    )
  }

  // --- USER CLIENT MOBILE VIEW ---
  return (
    <SecurityLock
      userFullName={currentProfile?.full_name}
      isLockedManual={isManualLocked}
      onManualUnlock={() => setIsManualLocked(false)}
    >
      <div
        className="max-w-md mx-auto h-screen h-[100dvh] max-h-[100dvh] bg-slate-950 text-white shadow-2xl relative flex flex-col overflow-hidden border-x border-slate-900/60 no-screen-capture"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Zero-Cost Auto-Update Live CDN Banner (Authenticated Users Only) */}
        {currentProfile && updateManifest && (
          <div className="bg-emerald-950/95 border-b border-emerald-500/50 px-3.5 py-2.5 flex items-center justify-between text-xs text-emerald-200 z-50 shadow-lg backdrop-blur-md animate-in slide-in-from-top duration-300">
            <div className="flex items-center space-x-2.5 truncate mr-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
              <div className="truncate">
                <div className="font-bold text-[11px] text-emerald-300 flex items-center gap-1.5">
                  <span>{isOtaAvailable ? '⚡ Instant Update Ready' : '🚀 Campus Update Available'} (v{updateManifest.version})</span>
                  <span className="text-[9px] bg-emerald-900/80 px-1.5 py-0.5 rounded text-emerald-400 border border-emerald-700/60 uppercase font-semibold">
                    {isOtaAvailable ? 'Instant OTA' : 'GitHub CDN'}
                  </span>
                </div>
                <p className="text-[10px] text-emerald-400/90 truncate">
                  {updateManifest.commit_message || 'New features & security enhancements'} • IndexedDB 100% preserved
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsUpdating(true)
                    if (isOtaAvailable && updateManifest.webBundleUrl) {
                      await applyOtaUpdate(updateManifest.webBundleUrl, updateManifest.version)
                    } else {
                      await downloadAndInstallUpdate(updateManifest.downloadUrl)
                    }
                  } catch (e: any) {
                    console.warn('Install update error:', e)
                  } finally {
                    setIsUpdating(false)
                  }
                }}
                disabled={isUpdating}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-[10px] rounded-lg shadow transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>{isUpdating ? (isOtaAvailable ? 'Updating...' : 'Downloading...') : (isOtaAvailable ? 'Update Now' : 'Update APK')}</span>
              </button>
              <button
                type="button"
                onClick={() => setUpdateManifest(null)}
                className="p-1 text-emerald-400 hover:text-white shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Global Announcement Alert Banner (Authenticated Users Only) */}
        {currentProfile && activeAnnouncement && (
          <div className="bg-amber-950/90 border-b border-amber-800/80 px-3 py-1.5 flex items-center justify-between text-xs text-amber-200 z-50">
            <div className="flex items-center space-x-2 truncate">
              <Radio className="w-3.5 h-3.5 shrink-0 text-amber-400 animate-pulse" />
              <span className="truncate text-[11px] font-medium">{activeAnnouncement.content}</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveAnnouncement(null)}
              className="p-0.5 text-amber-400 hover:text-white shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Campus Global Chat Slide-Over Drawer (Verified Registered Students Only) */}
        {currentProfile && currentProfile.is_approved && (
          <GlobalCampusChatDrawer
            currentProfile={currentProfile}
            isOpen={isGlobalChatOpen}
            onClose={() => setIsGlobalChatOpen(false)}
            onOpen={() => setIsGlobalChatOpen(true)}
          />
        )}

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
              handleNavigateTab('discover')
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col justify-between overflow-hidden">
            {activeTab === 'discover' && (
              <Discover
                currentProfile={currentProfile}
                onNavigateToMatches={() => handleNavigateTab('matches')}
                onSelectMatch={(match) => setActiveChatMatch(match)}
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
                onProfileUpdated={(updated) => setCurrentProfile(updated)}
              />
            )}

            {/* Persistent Mobile Bottom Navigation */}
            <BottomNav
              currentTab={activeTab}
              onTabChange={handleNavigateTab}
              onManualLock={() => setIsManualLocked(true)}
              unreadCount={unreadCount}
            />
          </div>
        )}

        {/* Double-tap back button exit toast notice */}
        {showExitToast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-slate-700/80 text-slate-200 text-xs px-4 py-2 rounded-full shadow-2xl backdrop-blur-md animate-in fade-in duration-200 flex items-center gap-2 pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <span>Press back again to exit</span>
          </div>
        )}

        {/* iOS Safari PWA Installation Prompt */}
        <InstallPwaBanner />
      </div>
    </SecurityLock>
  )
}

export default App
