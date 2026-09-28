import React, { useState, useEffect, useMemo } from 'react'
import {
  Shield,
  Key,
  Users,
  Search,
  Bell,
  Radio,
  RefreshCw,
  LogOut,
  ChevronDown,
  ChevronRight,
  Filter,
  AlertTriangle,
  Ban,
  ExternalLink,
  MessageCircle,
  GraduationCap,
  Building2,
  Unlock,
  AlertOctagon,
  X,
  FileSpreadsheet,
} from 'lucide-react'
import { adminAuth } from './auth/adminAuth'
import { csvSync } from './services/csvSync'
import { ApprovalModal } from './components/ApprovalModal'
import { JADAVPUR_DEPARTMENTS } from '../utils/departmentValidator'
import { api, type Profile } from '../services/supabase'
import { CURRENT_APP_VERSION } from '../services/updateService'

const GRADUATION_YEARS = [2024, 2025, 2026, 2027, 2028, 2029]

interface AdminDashboardProps {
  onExit?: () => void
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onExit }) => {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(adminAuth.isAuthenticated())
  const [authError, setAuthError] = useState<string>('')
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false)
  const [deviceLabel, setDeviceLabel] = useState<string>('My Admin Device')

  // Data & Directory State
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [activeTab, setActiveTab] = useState<'female' | 'male' | 'deactivated'>('female')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(new Set())
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set())
  const [isDeptAccordionOpen, setIsDeptAccordionOpen] = useState<boolean>(true)
  const [isYearAccordionOpen, setIsYearAccordionOpen] = useState<boolean>(true)

  // Modals & Inspection State
  const [inspectingProfile, setInspectingProfile] = useState<Profile | null>(null)
  const [blockedByInspected, setBlockedByInspected] = useState<Profile[]>([])
  const [pendingApprovalProfile, setPendingApprovalProfile] = useState<Profile | null>(null)
  const [isDeactivatingModalOpen, setIsDeactivatingModalOpen] = useState<boolean>(false)
  const [deactivationReason, setDeactivationReason] = useState<string>('')
  const [broadcastMessage, setBroadcastMessage] = useState<string>('')
  const [broadcastFeedback, setBroadcastFeedback] = useState<string>('')
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(csvSync.getLastSyncedAt())


  // Setup CSV Sync Loop
  useEffect(() => {
    if (!isAuthenticated) return

    const cleanup = csvSync.setupSyncLoop((updatedProfiles) => {
      setProfiles(updatedProfiles)
      setLastSyncTime(new Date().toLocaleTimeString())
    })

    return () => cleanup()
  }, [isAuthenticated])

  // Pending Queue for Approval Badge
  const pendingApprovals = useMemo(() => {
    return profiles.filter((p) => p.is_approved === false && !p.is_deactivated)
  }, [profiles])

  // Filtered Profiles based on active tab and sidebar
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      // Tab filter
      if (activeTab === 'deactivated') {
        if (!p.is_deactivated) return false
      } else {
        if (p.is_deactivated) return false
        if (p.gender !== activeTab) return false
      }

      // Search Query (scoped to Name or @instagram_handle)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase()
        const matchName = p.full_name.toLowerCase().includes(query)
        const matchHandle = p.insta_handle.toLowerCase().includes(query)
        if (!matchName && !matchHandle) return false
      }

      // Department filter
      if (selectedDepartments.size > 0) {
        if (!p.department || !selectedDepartments.has(p.department)) return false
      }

      // Graduation Year filter
      if (selectedYears.size > 0) {
        if (!p.grad_year || !selectedYears.has(p.grad_year)) return false
      }

      return true
    })
  }, [profiles, activeTab, searchQuery, selectedDepartments, selectedYears])

  // WebAuthn Handlers
  const handleEnrollPasskey = async () => {
    setAuthError('')
    setIsAuthenticating(true)
    try {
      await adminAuth.registerHardwarePasskey(deviceLabel)
      setIsAuthenticated(true)
    } catch (err: any) {
      setAuthError(err.message || 'Passkey enrollment failed')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleLoginPasskey = async () => {
    setAuthError('')
    setIsAuthenticating(true)
    try {
      const ok = await adminAuth.authenticateWithPasskey()
      if (ok) {
        setIsAuthenticated(true)
      } else {
        setAuthError('Authentication rejected. Cryptographic signature invalid.')
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const handleLogout = () => {
    adminAuth.logout()
    setIsAuthenticated(false)
  }

  // Profile Inspection
  const handleInspectProfile = async (profile: Profile) => {
    setInspectingProfile(profile)
    try {
      const blocked = await api.getBlockedUsers(profile.id)
      setBlockedByInspected(blocked)
    } catch {
      setBlockedByInspected([])
    }
  }

  // Deactivate Workflow
  const handleDeactivate = async () => {
    if (!inspectingProfile) return
    if (!deactivationReason.trim()) {
      alert('Mandatory deactivation reason required')
      return
    }

    try {
      await api.deactivateProfile(inspectingProfile.id, deactivationReason.trim())
      const updated = await csvSync.syncFromSupabase()
      setProfiles(updated)
      setIsDeactivatingModalOpen(false)
      setInspectingProfile(null)
      setDeactivationReason('')
      alert(`User @${inspectingProfile.insta_handle} has been de-authenticated and channel severed.`)
    } catch (err: any) {
      alert(err.message || 'Deactivation failed')
    }
  }

  // Re-Authenticate Workflow
  const handleReauthenticate = async (profileId: string) => {
    try {
      await api.reauthenticateProfile(profileId)
      const updated = await csvSync.syncFromSupabase()
      setProfiles(updated)
      alert('User has been re-authenticated.')
    } catch (err: any) {
      alert(err.message || 'Failed to re-authenticate')
    }
  }

  // Broadcast Announcement
  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!broadcastMessage.trim()) return

    const confirmSend = window.confirm(
      `Send global broadcast announcement to ALL active campus users?\n\n"${broadcastMessage.trim()}"`
    )
    if (!confirmSend) return

    try {
      await api.createGlobalAnnouncement(broadcastMessage.trim(), 'admin_broadcast')
      setBroadcastFeedback('Broadcast delivered to network!')
      setBroadcastMessage('')
      setTimeout(() => setBroadcastFeedback(''), 4000)
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch broadcast')
    }
  }

  // Filter Toggles
  const toggleDepartment = (dept: string) => {
    const next = new Set(selectedDepartments)
    if (next.has(dept)) next.delete(dept)
    else next.add(dept)
    setSelectedDepartments(next)
  }

  const toggleYear = (year: number) => {
    const next = new Set(selectedYears)
    if (next.has(year)) next.delete(year)
    else next.add(year)
    setSelectedYears(next)
  }

  // --- RENDER 1: WEBAUTHN HARDWARE PASSKEY LOGIN ---
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto shadow-xl shadow-rose-500/10">
              <Shield className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white">JLB Admin Desktop Suite</h1>
            <p className="text-xs text-slate-400">
              Hardware Passkey Authentication & Campus Directory Governance
            </p>
          </div>

          <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800/80 text-xs space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
              <Key className="w-4 h-4" />
              <span>WebAuthn FIDO2 / Passkey Gate</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Authenticate via YubiKey, Windows Hello, TouchID, or biometric hardware key registered in <code>public.admin_passkeys</code>.
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 text-xs rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <div className="space-y-3">
            <button
              type="button"
              disabled={isAuthenticating}
              onClick={handleLoginPasskey}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all shadow-lg shadow-rose-600/30"
            >
              <Key className="w-4 h-4" />
              <span>{isAuthenticating ? 'Verifying Hardware Signature...' : 'Sign In with Hardware Passkey'}</span>
            </button>

            <div className="pt-2 border-t border-slate-800">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Enroll New Hardware Passkey / Device:
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={deviceLabel}
                  onChange={(e) => setDeviceLabel(e.target.value)}
                  placeholder="e.g. Workstation YubiKey 5C"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                />
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={handleEnrollPasskey}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-all shrink-0"
                >
                  Enroll
                </button>
              </div>
            </div>
          </div>

          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              ← Return to User App
            </button>
          )}
        </div>
      </div>
    )
  }

  // --- RENDER 2: FULL ADMIN DESKTOP SUITE ---
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans select-none">
      {/* --- TOP NAVIGATION BAR --- */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800 px-6 py-3 flex items-center justify-between shadow-xl">
        {/* Brand & Version Info */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-pink-500 flex items-center justify-center text-white shadow-md shadow-rose-600/30">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-black tracking-tight text-white">JLB Admin Suite</h1>
              <span className="text-[10px] bg-rose-500/20 text-rose-300 font-mono font-bold px-1.5 py-0.5 rounded-full border border-rose-500/30">
                v{CURRENT_APP_VERSION}
              </span>
            </div>
            <div className="flex items-center space-x-2 text-[10px] text-slate-400">
              <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
              <span>CSV In-Memory Sync</span>
              {lastSyncTime && <span className="text-slate-500">• Synced: {lastSyncTime}</span>}
            </div>
          </div>
        </div>

        {/* Center: Search Bar & Global Broadcast */}
        <div className="flex-1 max-w-2xl mx-8 flex items-center space-x-3">
          {/* Scoped Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab === 'deactivated' ? 'deactivated users' : activeTab + ' directory'} by name or @handle...`}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Global Broadcast Input */}
          <form onSubmit={handleSendBroadcast} className="relative flex items-center space-x-2 w-72">
            <input
              type="text"
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              placeholder="Global broadcast..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              disabled={!broadcastMessage.trim()}
              title="Broadcast to campus network"
              className="p-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-xl transition-all shrink-0"
            >
              <Radio className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* Right Controls: Approval Bell & Actions */}
        <div className="flex items-center space-x-3">
          {/* Approval Notification Bell */}
          <button
            type="button"
            onClick={() => {
              if (pendingApprovals.length > 0) {
                setPendingApprovalProfile(pendingApprovals[0])
              } else {
                alert('No pending onboarding profiles in approval queue.')
              }
            }}
            title={`${pendingApprovals.length} profiles pending verification`}
            className="relative p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
          >
            <Bell className="w-4 h-4" />
            {pendingApprovals.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-slate-900 animate-pulse">
                {pendingApprovals.length}
              </span>
            )}
          </button>

          {/* Force CSV Sync Refresh */}
          <button
            type="button"
            onClick={async () => {
              const fresh = await csvSync.syncFromSupabase()
              setProfiles(fresh)
              setLastSyncTime(new Date().toLocaleTimeString())
            }}
            title="Force refresh profiles from Supabase"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Return to user app */}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all"
            >
              User UI
            </button>
          )}

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            title="Lock & Logout Admin"
            className="p-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Broadcast Delivery Feedback */}
      {broadcastFeedback && (
        <div className="bg-amber-950/90 border-b border-amber-800/80 px-6 py-2 text-center text-xs text-amber-200 font-medium animate-fade-in">
          📢 {broadcastFeedback}
        </div>
      )}

      {/* --- MAIN DESKTOP BODY --- */}
      <div className="flex-1 flex overflow-hidden">
        {/* --- LEFT FILTER SIDEBAR --- */}
        <aside className="w-72 bg-slate-900/60 border-r border-slate-800 flex flex-col p-4 overflow-y-auto space-y-6">
          <div className="flex items-center space-x-2 text-xs font-bold text-slate-300 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-rose-400" />
            <span>Campus Taxonomy Filters</span>
          </div>

          {/* 1. Department Checkbox Tree */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setIsDeptAccordionOpen(!isDeptAccordionOpen)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white py-1"
            >
              <div className="flex items-center space-x-1.5">
                <Building2 className="w-3.5 h-3.5 text-sky-400" />
                <span>Department ({selectedDepartments.size || 'All'})</span>
              </div>
              {isDeptAccordionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {isDeptAccordionOpen && (
              <div className="space-y-1.5 pl-2 pt-1 max-h-64 overflow-y-auto pr-1">
                {JADAVPUR_DEPARTMENTS.map((dept) => {
                  const isChecked = selectedDepartments.has(dept)
                  return (
                    <label
                      key={dept}
                      className="flex items-start space-x-2 text-[11px] text-slate-300 hover:text-white cursor-pointer select-none py-0.5"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDepartment(dept)}
                        className="mt-0.5 rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="leading-tight truncate">{dept}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* 2. Graduation Year Checkbox Tree */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsYearAccordionOpen(!isYearAccordionOpen)}
              className="w-full flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white py-1"
            >
              <div className="flex items-center space-x-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                <span>Graduation Year ({selectedYears.size || 'All'})</span>
              </div>
              {isYearAccordionOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>

            {isYearAccordionOpen && (
              <div className="grid grid-cols-2 gap-1.5 pl-2 pt-1">
                {GRADUATION_YEARS.map((year) => {
                  const isChecked = selectedYears.has(year)
                  return (
                    <label
                      key={year}
                      className="flex items-center space-x-2 text-xs text-slate-300 hover:text-white cursor-pointer py-1"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleYear(year)}
                        className="rounded border-slate-700 bg-slate-950 text-rose-600 focus:ring-0"
                      />
                      <span>{year}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>

          {/* Active Filter Clear */}
          {(selectedDepartments.size > 0 || selectedYears.size > 0) && (
            <button
              type="button"
              onClick={() => {
                setSelectedDepartments(new Set())
                setSelectedYears(new Set())
              }}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-semibold text-left pt-2"
            >
              Reset All Filters
            </button>
          )}
        </aside>

        {/* --- CENTER CONTENT: DIRECTORY TABS & PROFILE GRID --- */}
        <main className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
          {/* Top Tabs */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex space-x-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('female')}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'female'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Female Directory ({profiles.filter((p) => p.gender === 'female' && !p.is_deactivated).length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('male')}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'male'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Male Directory ({profiles.filter((p) => p.gender === 'male' && !p.is_deactivated).length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('deactivated')}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'deactivated'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Re-Authentication Panel ({profiles.filter((p) => p.is_deactivated).length})
              </button>
            </div>

            <div className="text-xs text-slate-400">
              Showing <span className="text-white font-bold">{filteredProfiles.length}</span> records
            </div>
          </div>

          {/* Profile Grid */}
          {filteredProfiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 text-slate-500 space-y-3">
              <Users className="w-10 h-10 stroke-1" />
              <p className="text-sm">No profiles found matching active filters and query.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredProfiles.map((p) => {
                const avatar = p.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'

                return (
                  <div
                    key={p.id}
                    onClick={() => handleInspectProfile(p)}
                    className="group relative bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-2xl overflow-hidden cursor-pointer transition-all shadow-md flex flex-col justify-between"
                  >
                    {/* Square Avatar */}
                    <div className="aspect-square w-full relative overflow-hidden bg-slate-950">
                      <img
                        src={avatar}
                        alt={p.full_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-80" />

                      {/* Top Badges */}
                      <div className="absolute top-2 left-2 flex flex-col space-y-1">
                        {p.is_approved === false && (
                          <span className="text-[9px] bg-amber-500 text-black font-bold px-1.5 py-0.5 rounded shadow">
                            Pending Approval
                          </span>
                        )}
                        {p.is_deactivated && (
                          <span className="text-[9px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded shadow">
                            Deactivated
                          </span>
                        )}
                      </div>

                      {/* Bottom Quick Info */}
                      <div className="absolute bottom-2 left-2 right-2">
                        <h3 className="font-bold text-sm text-white truncate drop-shadow">{p.full_name}</h3>
                        <p className="text-[11px] text-rose-300 font-medium truncate drop-shadow">{p.insta_handle}</p>
                      </div>
                    </div>

                    {/* Card Meta Footer */}
                    <div className="p-3 text-[11px] text-slate-400 space-y-1 bg-slate-900/90">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="truncate text-slate-300 font-medium">{p.department || 'General'}</span>
                        <span className="text-amber-400 font-mono font-semibold">{p.grad_year || '—'}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[10px]">
                        <span className="text-emerald-400 flex items-center space-x-1">
                          <MessageCircle className="w-3 h-3" />
                          <span>{p.active_chat_count ?? 0} chats</span>
                        </span>
                        {(p.report_count > 0 || p.block_count > 0) && (
                          <span className="text-amber-400 font-mono">
                            ⚠️{p.report_count} 🚫{p.block_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {/* --- MODAL 1: DETAILED PROFILE INSPECTION MODAL --- */}
      {inspectingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
            {/* Raw Photo */}
            <div className="md:w-1/2 h-72 md:h-auto bg-slate-950 relative">
              <img
                src={inspectingProfile.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'}
                alt={inspectingProfile.full_name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-white border border-white/10">
                Raw Verified Photo
              </div>
            </div>

            {/* Details Panel */}
            <div className="flex-1 p-6 flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-white">{inspectingProfile.full_name}</h2>
                    <a
                      href={`https://instagram.com/${inspectingProfile.insta_handle.replace('@', '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-rose-400 hover:underline inline-flex items-center space-x-1 mt-0.5"
                    >
                      <span>{inspectingProfile.insta_handle}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectingProfile(null)}
                    className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Campus Details */}
                <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Department:</span>
                    <span className="text-white font-medium">{inspectingProfile.department || 'Unspecified'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Graduation Year:</span>
                    <span className="text-white font-medium">{inspectingProfile.grad_year || 'Unspecified'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Live Active Chats:</span>
                    <span className="text-emerald-400 font-bold">{inspectingProfile.active_chat_count ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reports Received:</span>
                    <span className="text-amber-400 font-mono font-semibold">{inspectingProfile.report_count ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Blocked by Others:</span>
                    <span className="text-rose-400 font-mono font-semibold">{inspectingProfile.block_count ?? 0}</span>
                  </div>
                </div>

                {/* Users They Have Blocked */}
                <div className="space-y-1 text-xs">
                  <h4 className="font-semibold text-slate-300">Users Blocked by this Profile:</h4>
                  {blockedByInspected.length === 0 ? (
                    <p className="text-[11px] text-slate-500 italic">None</p>
                  ) : (
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {blockedByInspected.map((b) => (
                        <div key={b.id} className="text-[11px] bg-slate-950 px-2 py-1 rounded border border-slate-800 flex justify-between">
                          <span>{b.full_name}</span>
                          <span className="text-slate-400">{b.insta_handle}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {inspectingProfile.is_deactivated && inspectingProfile.deactivation_reason && (
                  <div className="p-2.5 bg-rose-950/60 rounded-xl border border-rose-900/60 text-xs text-rose-300">
                    <span className="font-bold block">Deactivation Reason:</span>
                    {inspectingProfile.deactivation_reason}
                  </div>
                )}
              </div>

              {/* Actions: Deactivate or Re-Authenticate */}
              <div className="pt-3 border-t border-slate-800">
                {inspectingProfile.is_deactivated ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleReauthenticate(inspectingProfile.id)
                      setInspectingProfile(null)
                    }}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-md"
                  >
                    <Unlock className="w-4 h-4" />
                    <span>Re-Authenticate User</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsDeactivatingModalOpen(true)}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all shadow-md"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Deactivate User</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 2: DEACTIVATION REASON PROMPT --- */}
      {isDeactivatingModalOpen && inspectingProfile && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-rose-400">
              <AlertOctagon className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-white">Deactivate Campus Profile</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This action will sever all active P2P DataChannels, transition all peer chat screens to *"User Deactivated"*, and broadcast a revocation announcement.
            </p>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Mandatory Reason:
              </label>
              <textarea
                rows={3}
                required
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                placeholder="e.g. Identity impersonation or harassment reports..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setIsDeactivatingModalOpen(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!deactivationReason.trim()}
                onClick={handleDeactivate}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-lg"
              >
                Confirm Deactivation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: APPROVAL QUEUE MODAL --- */}
      {pendingApprovalProfile && (
        <ApprovalModal
          profile={pendingApprovalProfile}
          onClose={() => setPendingApprovalProfile(null)}
          onApprove={async (id, comment) => {
            await api.approveProfile(id, comment)
            const fresh = await csvSync.syncFromSupabase()
            setProfiles(fresh)
          }}
          onReject={async (id, comment, deletePermanently) => {
            await api.rejectProfile(id, comment, deletePermanently)
            const fresh = await csvSync.syncFromSupabase()
            setProfiles(fresh)
          }}
        />
      )}
    </div>
  )
}

export default AdminDashboard
