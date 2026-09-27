import React, { useState } from 'react'
import {
  X,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Building2,
  GraduationCap,
  Hash,
} from 'lucide-react'
import { InstagramIcon } from '../../components/InstagramIcon'
import { type Profile } from '../../services/supabase'

interface ApprovalModalProps {
  profile: Profile
  onClose: () => void
  onApprove: (profileId: string, comment?: string) => Promise<void>
  onReject: (profileId: string, comment?: string, deleteProfile?: boolean) => Promise<void>
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({
  profile,
  onClose,
  onApprove,
  onReject,
}) => {
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState<number>(0)
  const [comment, setComment] = useState<string>('')
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [rejectMode, setRejectMode] = useState<boolean>(false)

  const photos = profile.photo_urls && profile.photo_urls.length > 0
    ? profile.photo_urls
    : ['https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80']

  const handleNextPhoto = () => {
    setCurrentPhotoIdx((prev) => (prev + 1) % photos.length)
  }

  const handlePrevPhoto = () => {
    setCurrentPhotoIdx((prev) => (prev - 1 + photos.length) % photos.length)
  }

  const handleAccept = async () => {
    setIsProcessing(true)
    try {
      await onApprove(profile.id, comment.trim() || undefined)
      onClose()
    } catch (err: any) {
      alert(err.message || 'Failed to approve profile')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async (deletePermanently: boolean) => {
    setIsProcessing(true)
    try {
      await onReject(profile.id, comment.trim() || 'Rejected by administrator', deletePermanently)
      onClose()
    } catch (err: any) {
      alert(err.message || 'Failed to reject profile')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
        {/* Left Side: Photo Carousel */}
        <div className="relative md:w-1/2 h-72 md:h-auto bg-slate-950 flex items-center justify-center overflow-hidden">
          <img
            src={photos[currentPhotoIdx]}
            alt={profile.full_name}
            className="w-full h-full object-cover"
          />

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrevPhoto}
                className="absolute left-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNextPhoto}
                className="absolute right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/90 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-2 flex space-x-1.5">
                {photos.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all ${
                      idx === currentPhotoIdx ? 'w-4 bg-rose-500' : 'w-1.5 bg-white/50'
                    }`}
                  />
                ))}
              </div>
            </>
          )}

          <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Onboarding Verification</span>
          </div>
        </div>

        {/* Right Side: Details & Actions (Explicitly OMITS Block Counters) */}
        <div className="flex-1 p-5 md:p-6 flex flex-col justify-between overflow-y-auto space-y-4">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400 bg-rose-950/60 px-2 py-0.5 rounded-full border border-rose-800/40">
                  {profile.gender}
                </span>
                <h2 className="text-xl font-black text-white mt-1">{profile.full_name}</h2>
                <p className="text-xs text-slate-400">Age: {profile.age}</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Credentials Information */}
            <div className="space-y-2.5 text-xs bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80">
              {/* Instagram */}
              <div className="flex items-center space-x-2 text-slate-300">
                <InstagramIcon className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="text-slate-400">Instagram:</span>
                <a
                  href={`https://instagram.com/${profile.insta_handle.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-rose-400 font-semibold hover:underline truncate"
                >
                  {profile.insta_handle}
                </a>
              </div>

              {/* Department */}
              <div className="flex items-center space-x-2 text-slate-300">
                <Building2 className="w-4 h-4 text-sky-400 shrink-0" />
                <span className="text-slate-400">Department:</span>
                <span className="text-white font-medium truncate">
                  {profile.department || 'Not specified'}
                </span>
              </div>

              {/* Graduation Year */}
              <div className="flex items-center space-x-2 text-slate-300">
                <GraduationCap className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-slate-400">Graduation Year:</span>
                <span className="text-white font-medium">
                  {profile.grad_year || 'Not specified'}
                </span>
              </div>

              {/* University Library Card ID */}
              <div className="flex items-start space-x-2 text-slate-300">
                <Hash className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="text-slate-400 block text-[10px]">University Library Card ID:</span>
                  <span className="text-xs font-mono font-bold text-emerald-300 tracking-wider select-all">
                    {profile.library_card_hash || 'Unverified'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bio if available */}
            {profile.bio && (
              <div className="text-xs text-slate-300 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">
                <p className="italic">"{profile.bio}"</p>
              </div>
            )}

            {/* Note / Review Note Input */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Admin Review Comment (Optional):
              </label>
              <input
                type="text"
                placeholder="e.g. Student card verified via departmental roster"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            {!rejectMode ? (
              <div className="flex space-x-3">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => setRejectMode(true)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 rounded-xl text-xs font-semibold border border-slate-700 hover:border-rose-800 flex items-center justify-center space-x-1.5 transition-all"
                >
                  <XCircle className="w-4 h-4" />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleAccept}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-1.5 transition-all"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isProcessing ? 'Approving...' : 'Accept Profile'}</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2 bg-rose-950/40 p-3 rounded-2xl border border-rose-900/50">
                <p className="text-[11px] text-rose-300 font-medium text-center">
                  Select Rejection Action:
                </p>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleReject(false)}
                    className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-semibold rounded-xl"
                  >
                    Retain with Reason
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => handleReject(true)}
                    className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold rounded-xl"
                  >
                    Permanently Delete
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectMode(false)}
                  className="w-full text-center text-[10px] text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
