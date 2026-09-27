import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Heart,
  X,
  ShieldAlert,
  Ban,
  BadgeCheck,
  AlertTriangle,
  ShieldX,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Building2,
  Lock,
  Clock,
} from 'lucide-react'
import { InstagramIcon } from './InstagramIcon'
import { type Profile, calculateCurrentAge } from '../services/supabase'

interface ProfileCardProps {
  profile: Profile
  viewerProfile: Profile
  requestStatus?: 'pending' | 'accepted' | 'rejected' | null
  onLike: (profile: Profile) => void
  onPass: (profile: Profile) => void
  onBlock: (profile: Profile) => void
  onReport: (profile: Profile) => void
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  viewerProfile,
  requestStatus,
  onLike,
  onPass,
  onBlock,
  onReport,
}) => {
  const [photoIndex, setPhotoIndex] = useState<number>(0)
  const photos = profile.photo_urls && profile.photo_urls.length > 0
    ? profile.photo_urls
    : ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80']

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPhotoIndex((prev) => (prev + 1) % photos.length)
  }

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length)
  }

  const isViewerFemale = viewerProfile.gender === 'female'
  const isTargetMale = profile.gender === 'male'
  // Rule: Females can view male Instagram handles directly on cards
  const canViewInstagram = isViewerFemale || !isTargetMale

  return (
    <motion.div
      initial={{ scale: 0.95, opacity: 0, y: 15 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: -20 }}
      transition={{ duration: 0.25 }}
      className="relative w-full h-[540px] rounded-3xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex flex-col justify-between select-none"
    >
      {/* Background Image Carousel */}
      <div className="absolute inset-0 z-0">
        <AnimatePresence mode="wait">
          <motion.img
            key={photoIndex}
            src={photos[photoIndex]}
            alt={profile.full_name}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0.8 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full object-cover"
          />
        </AnimatePresence>

        {/* Gradient overlays for high legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-black/30" />

        {/* Photo Navigation Click Zones */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevPhoto}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 transition-all z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={nextPhoto}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md text-white flex items-center justify-center hover:bg-black/70 transition-all z-10"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        {/* Indicators on top */}
        {photos.length > 1 && (
          <div className="absolute top-3 inset-x-0 flex justify-center space-x-1.5 z-10 px-4">
            {photos.map((_, idx) => (
              <div
                key={idx}
                className={`h-1 rounded-full transition-all duration-300 ${
                  idx === photoIndex ? 'w-6 bg-white' : 'w-2 bg-white/40'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Top Header: Instagram Badge & Safety Counters */}
      <div className="relative z-10 p-4 flex items-start justify-between">
        <div className="flex flex-col space-y-1.5">
          {/* Instagram Handle Badge: Females see male IG directly */}
          {canViewInstagram ? (
            <a
              href={`https://instagram.com/${profile.insta_handle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center space-x-1 bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-xs text-rose-300 font-medium transition-all shadow-md"
            >
              <InstagramIcon className="w-3.5 h-3.5 text-rose-400" />
              <span>{profile.insta_handle}</span>
            </a>
          ) : (
            <div
              title="Instagram unlocks when request is accepted"
              className="inline-flex items-center space-x-1 bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-xs text-slate-400 font-medium shadow-md"
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>IG Locked (Approval Required)</span>
            </div>
          )}

          {profile.is_verified && (
            <div className="inline-flex items-center space-x-1 bg-emerald-950/70 backdrop-blur-md border border-emerald-500/30 px-2 py-0.5 rounded-full text-[10px] text-emerald-300 font-medium">
              <BadgeCheck className="w-3 h-3 text-emerald-400" />
              <span>Verified Library Card</span>
            </div>
          )}
        </div>

        {/* Transparent Public Safety Counters */}
        <div className="flex flex-col items-end space-y-1">
          <div className="inline-flex items-center space-x-1 bg-amber-950/80 backdrop-blur-md border border-amber-600/40 px-2.5 py-1 rounded-full text-[11px] font-semibold text-amber-300 shadow-sm">
            <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
            <span>⚠️ Reported: {profile.report_count} times</span>
          </div>

          <div className="inline-flex items-center space-x-1 bg-rose-950/80 backdrop-blur-md border border-rose-600/40 px-2.5 py-1 rounded-full text-[11px] font-semibold text-rose-300 shadow-sm">
            <ShieldX className="w-3 h-3 text-rose-400 shrink-0" />
            <span>🚫 Blocked: {profile.block_count} times</span>
          </div>
        </div>
      </div>

      {/* Bottom Profile Details & Interaction Buttons */}
      <div className="relative z-10 p-4 space-y-3">
        {/* Name, Age, Gender badge */}
        <div className="space-y-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap min-w-0">
            <h2 className="text-xl font-black text-white tracking-tight truncate min-w-0 max-w-[55%]">
              {profile.full_name}
            </h2>
            <span className="text-lg font-bold text-rose-400 shrink-0">{calculateCurrentAge(profile)}</span>
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold px-2 py-0.5 bg-slate-800/80 rounded-md shrink-0">
              {profile.gender}
            </span>
          </div>

          {/* Department & Grad Year Badge */}
          {(profile.department || profile.grad_year) && (
            <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-[10px] text-slate-300 pt-0.5">
              {profile.department && (
                <span className="inline-flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800 min-w-0 max-w-full">
                  <Building2 className="w-3 h-3 text-sky-400 shrink-0" />
                  <span className="truncate">{profile.department}</span>
                </span>
              )}
              {profile.grad_year && (
                <span className="inline-flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded-md border border-slate-800 shrink-0">
                  <GraduationCap className="w-3 h-3 text-amber-400" />
                  <span>Class of {profile.grad_year}</span>
                </span>
              )}
            </div>
          )}

          <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed pt-0.5">
            {profile.bio || 'Campus explorer. Reach out to connect!'}
          </p>
        </div>

        {/* Action Controls: Pass, Block, Report, Like */}
        <div className="flex items-center justify-between pt-1">
          {/* Block Button */}
          <button
            type="button"
            onClick={() => onBlock(profile)}
            title="Block User"
            className="w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-rose-950/60 border border-slate-800 hover:border-rose-700 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-all active:scale-95 shadow-lg"
          >
            <Ban className="w-5 h-5" />
          </button>

          {/* Pass Button */}
          <button
            type="button"
            onClick={() => onPass(profile)}
            title="Pass"
            className="w-14 h-14 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all active:scale-95 shadow-lg"
          >
            <X className="w-7 h-7" />
          </button>

          {/* Like / Chat Request Button */}
          {requestStatus === 'pending' ? (
            <div className="px-4 py-3 rounded-2xl bg-amber-950/80 border border-amber-600/40 text-amber-300 flex items-center space-x-1.5 shadow-lg text-xs font-bold">
              <Clock className="w-4 h-4 animate-spin text-amber-400" />
              <span>Request Pending</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onLike(profile)}
              title={!isViewerFemale ? 'Send Chat Request (Female-First)' : 'Like & Match'}
              className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-rose-600 to-pink-500 hover:from-rose-500 hover:to-pink-400 text-white flex items-center justify-center transition-all active:scale-95 shadow-xl shadow-rose-600/30"
            >
              <Heart className="w-8 h-8 fill-white" />
            </button>
          )}

          {/* Report Button */}
          <button
            type="button"
            onClick={() => onReport(profile)}
            title="Report User"
            className="w-11 h-11 rounded-2xl bg-slate-900/90 hover:bg-amber-950/60 border border-slate-800 hover:border-amber-700 text-slate-400 hover:text-amber-400 flex items-center justify-center transition-all active:scale-95 shadow-lg"
          >
            <ShieldAlert className="w-5 h-5" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default ProfileCard
