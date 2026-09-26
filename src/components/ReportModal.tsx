import React, { useState } from 'react'
import { ShieldAlert, X, AlertTriangle, CheckCircle } from 'lucide-react'
import { api, type Profile } from '../services/supabase'

interface ReportModalProps {
  isOpen: boolean
  targetProfile: Profile | null
  currentUserId: string
  onClose: () => void
  onReported: (targetProfileId: string) => void
}

const REPORT_REASONS = [
  'Inappropriate or Unsolicited Media',
  'Harassment or Offensive Language',
  'Fake Identity / Impersonation',
  'Non-Student / Invalid Campus Card',
  'Safety or Physical Threat',
  'Spam or Commercial Solicitation',
]

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  targetProfile,
  currentUserId,
  onClose,
  onReported,
}) => {
  const [selectedReason, setSelectedReason] = useState<string>(REPORT_REASONS[0])
  const [details, setDetails] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [isSuccess, setIsSuccess] = useState<boolean>(false)

  if (!isOpen || !targetProfile) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const fullReason = details.trim()
        ? `${selectedReason}: ${details.trim()}`
        : selectedReason

      await api.reportUser(currentUserId, targetProfile.id, fullReason)
      setIsSuccess(true)
      setTimeout(() => {
        setIsSuccess(false)
        onReported(targetProfile.id)
        onClose()
      }, 1400)
    } catch (err: any) {
      console.error('Error reporting profile:', err)
      alert(err.message || 'Failed to submit report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 text-white shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-rose-500">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-bold text-base text-white">Report Member</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3">
            <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <div className="space-y-1">
              <h4 className="font-semibold text-white">Report Submitted</h4>
              <p className="text-xs text-slate-400">
                Thank you for keeping campus safe. Member transparency counter incremented.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-xs text-slate-300">
              Reporting <span className="font-semibold text-rose-400">{targetProfile.full_name}</span> ({targetProfile.insta_handle}) will increment their public community safety counter.
            </p>

            <div className="space-y-2">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                Select Reason
              </label>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {REPORT_REASONS.map((reason) => (
                  <label
                    key={reason}
                    className={`flex items-center space-x-2 p-2 rounded-xl border text-xs cursor-pointer transition-all ${
                      selectedReason === reason
                        ? 'border-rose-500 bg-rose-500/10 text-white font-medium'
                        : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason}
                      checked={selectedReason === reason}
                      onChange={() => setSelectedReason(reason)}
                      className="accent-rose-500 w-3.5 h-3.5"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Additional Details (Optional)
              </label>
              <textarea
                rows={2}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Help us understand the situation..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-rose-600/20"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{isSubmitting ? 'Reporting...' : 'Submit Report'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

export default ReportModal
