import React from 'react'
import { ShieldAlert, AlertTriangle, CheckCircle2, X, Lock, ScrollText, HeartHandshake } from 'lucide-react'

interface TermsAndConditionsModalProps {
  isOpen: boolean
  onClose: () => void
  onAccept?: () => void
}

export const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
  isOpen,
  onClose,
  onAccept,
}) => {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-scale-in">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white leading-none">
                Terms & Conditions & Disclaimer
              </h2>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Compulsory Campus Safety & Liability Protocol
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Scrollable Terms */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-left text-xs leading-relaxed text-slate-300">
          {/* Important Highlight Box */}
          <div className="p-3.5 bg-rose-950/30 border border-rose-800/50 rounded-2xl flex items-start space-x-3 text-rose-200">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-[11px] leading-snug">
              <strong className="block text-rose-300 font-bold mb-0.5 uppercase tracking-wide">
                Compulsory Acceptance Notice
              </strong>
              By signing up or using Jadavpur Love Birds, you unconditionally agree to all terms stated below. If you do not agree, you are strictly prohibited from using the platform.
            </div>
          </div>

          {/* Section 1: Sole Personal Responsibility */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
            <h3 className="font-bold text-white text-xs flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>1. Sole Personal Responsibility of the User</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Whatever you do, say, text, send, or engage in through this application is <strong className="text-white">solely your own personal matter and responsibility</strong>. You agree to exercise utmost caution, maturity, common sense, and personal care in all peer interactions, chat discussions, profile contents, and offline meetups.
            </p>
          </div>

          {/* Section 2: Absolute Disclaimer / Zero Creator Liability */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
            <h3 className="font-bold text-white text-xs flex items-center space-x-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>2. Absolute Creator Disclaimer & Zero Liability</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              The creators, software developers, campus contributors, and administrators of Jadavpur Love Birds bear <strong className="text-white">ZERO liability or responsibility</strong> for any mishap, dispute, emotional disturbance, physical conflict, personal injury, fraud, financial damage, defamation, or adverse incident arising directly or indirectly from your usage of this software. You join, interact, and communicate entirely at your own independent risk and discretion.
            </p>
          </div>

          {/* Section 3: Prohibition of Derogatory, Harmful & Illegal Content */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
            <h3 className="font-bold text-white text-xs flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400" />
              <span>3. Zero Tolerance: Derogatory, Harmful & Illegal Content</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              You must <strong className="text-white">use this app carefully and respectfully</strong>. You are strictly forbidden from transmitting, publishing, or sending:
            </p>
            <ul className="list-disc list-inside text-[11px] text-slate-400 space-y-1 pl-1">
              <li>Derogatory, abusive, obscene, sexually harassing, or defamatory statements</li>
              <li>Unsolicited non-consensual media, explicit imagery, or privacy intrusions</li>
              <li>Threats, intimidation, stalking, blackmail, or hate speech targeting any student</li>
              <li>Any illegal activities, narcotics solicitation, or cyber offenses under law</li>
            </ul>
            <p className="text-[10px] text-rose-400 font-medium pt-1">
              Violators will face permanent device/card bans, public peer block counter increments, and direct referral to university authorities and law enforcement.
            </p>
          </div>

          {/* Section 4: Zero Cloud Storage & Privacy Architecture */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
            <h3 className="font-bold text-white text-xs flex items-center space-x-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>4. Zero-Knowledge Private Local Storage</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              This app stores chat communications solely on your device’s local encrypted storage (IndexedDB) via peer-to-peer WebRTC. Creators do not possess or store chat archives on central servers. You are personally responsible for exporting and securing your own chat backups.
            </p>
          </div>

          {/* Section 5: Campus Eligibility & Truthfulness */}
          <div className="space-y-1.5 bg-slate-950/60 border border-slate-800/80 p-3.5 rounded-2xl">
            <h3 className="font-bold text-white text-xs flex items-center space-x-1.5">
              <HeartHandshake className="w-3.5 h-3.5 text-sky-400" />
              <span>5. Age & Campus Verification Integrity</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              You certify that you are at least 18 years of age and a currently enrolled, verified student of Jadavpur University with genuine credentials. Impersonation of another student or falsifying library credentials will result in instant de-authentication.
            </p>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center space-x-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl border border-slate-800 transition-all"
          >
            Close
          </button>

          {onAccept && (
            <button
              type="button"
              onClick={() => {
                onAccept()
                onClose()
              }}
              className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-rose-600/30 flex items-center justify-center space-x-1.5 transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>I Compulsory Accept</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TermsAndConditionsModal
