import React from 'react'
import { X, Building2, GraduationCap, ShieldCheck, AlertTriangle, ShieldX } from 'lucide-react'
import { InstagramIcon } from './InstagramIcon'
import { type Profile, calculateCurrentAge } from '../services/supabase'

interface ProfileModalProps {
  profile: Profile | null
  isOpen: boolean
  onClose: () => void
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ profile, isOpen, onClose }) => {
  if (!isOpen || !profile) return null

  const photos = profile.photo_urls && profile.photo_urls.length > 0 ? profile.photo_urls : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header photo & close */}
        <div className="relative h-60 w-full bg-slate-950">
          {photos.length > 0 ? (
            <img
              src={photos[0]}
              alt={profile.full_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-lg bg-slate-800">
              {profile.full_name?.charAt(0) || 'U'}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info Content */}
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-xl font-black text-white">{profile.full_name}</h3>
              <span className="text-lg font-bold text-rose-400">{calculateCurrentAge(profile)}</span>
            </div>
            <p className="text-xs text-rose-300 font-mono mt-0.5">{profile.insta_handle}</p>
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            {profile.department && (
              <div className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="truncate">{profile.department}</span>
              </div>
            )}
            {profile.grad_year && (
              <div className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Graduation Class of {profile.grad_year}</span>
              </div>
            )}
          </div>

          {profile.bio && (
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed italic">
              "{profile.bio}"
            </div>
          )}

          {/* Safety Transparency details */}
          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            <div className="flex items-center space-x-1.5 bg-amber-950/40 border border-amber-800/40 p-2 rounded-xl text-amber-300 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Reported: {profile.report_count || 0}</span>
            </div>
            <div className="flex items-center space-x-1.5 bg-rose-950/40 border border-rose-800/40 p-2 rounded-xl text-rose-300 font-semibold">
              <ShieldX className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>Blocked: {profile.block_count || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
