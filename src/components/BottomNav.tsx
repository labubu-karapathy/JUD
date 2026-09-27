import React from 'react'
import { Flame, MessageSquare, User, Lock } from 'lucide-react'

export type NavTab = 'discover' | 'matches' | 'profile'

interface BottomNavProps {
  currentTab: NavTab
  onTabChange: (tab: NavTab) => void
  onManualLock: () => void
  unreadCount?: number
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  onManualLock,
  unreadCount = 0,
}) => {
  return (
    <div
      className="sticky bottom-0 z-40 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/80 px-4 pt-2 pb-3 flex items-center justify-around shadow-2xl"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {/* Discover Tab */}
      <button
        type="button"
        onClick={() => onTabChange('discover')}
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'discover'
            ? 'text-rose-500 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Flame className={`w-6 h-6 transition-transform ${currentTab === 'discover' ? 'scale-110 fill-rose-500/20' : ''}`} />
        <span className="text-[10px] mt-1 tracking-tight">Discover</span>
      </button>

      {/* Matches / Chats Tab */}
      <button
        type="button"
        onClick={() => onTabChange('matches')}
        className={`relative flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'matches'
            ? 'text-rose-500 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <MessageSquare className={`w-6 h-6 transition-transform ${currentTab === 'matches' ? 'scale-110 fill-rose-500/20' : ''}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full border border-slate-950">
              {unreadCount}
            </span>
          )}
        </div>
        <span className="text-[10px] mt-1 tracking-tight">Chats</span>
      </button>

      {/* Profile Tab */}
      <button
        type="button"
        onClick={() => onTabChange('profile')}
        className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition-all ${
          currentTab === 'profile'
            ? 'text-rose-500 font-bold'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <User className={`w-6 h-6 transition-transform ${currentTab === 'profile' ? 'scale-110' : ''}`} />
        <span className="text-[10px] mt-1 tracking-tight">Profile</span>
      </button>

      {/* Instant App Lock Action */}
      <button
        type="button"
        onClick={onManualLock}
        title="Lock Application Instantly"
        className="flex flex-col items-center justify-center py-1 px-3 rounded-2xl text-slate-400 hover:text-rose-400 transition-all active:scale-95"
      >
        <Lock className="w-6 h-6" />
        <span className="text-[10px] mt-1 tracking-tight">Lock</span>
      </button>
    </div>
  )
}

export default BottomNav
