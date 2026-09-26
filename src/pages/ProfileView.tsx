import React, { useState } from 'react'
import {
  User,
  ShieldCheck,
  Lock,
  Fingerprint,
  LogOut,
  AlertTriangle,
  ShieldX,
  CheckCircle2,
  KeyRound
} from 'lucide-react'
import { InstagramIcon } from '../components/InstagramIcon'
import { type Profile } from '../services/supabase'
import { registerBiometrics, sha256, vibrateDevice } from '../utils/crypto'

interface ProfileViewProps {
  currentProfile: Profile
  onLogout: () => void
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentProfile,
  onLogout,
}) => {
  const [bioSuccess, setBioSuccess] = useState<string>('')
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false)
  const [newPin, setNewPin] = useState<string>('')
  const [confirmNewPin, setConfirmNewPin] = useState<string>('')
  const [pinChangeMsg, setPinChangeMsg] = useState<string>('')

  const handleRegisterBiometrics = async () => {
    setBioSuccess('')
    const ok = await registerBiometrics(currentProfile.id, currentProfile.full_name)
    if (ok) {
      setBioSuccess('Biometrics enrolled successfully on this device!')
      setTimeout(() => setBioSuccess(''), 3000)
    } else {
      setBioSuccess('Biometric registration could not be completed on this browser/device.')
      setTimeout(() => setBioSuccess(''), 3000)
    }
  }

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinChangeMsg('')

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinChangeMsg('PIN must be 4 digits.')
      vibrateDevice([100, 50, 100])
      return
    }

    if (newPin !== confirmNewPin) {
      setPinChangeMsg('PIN confirmation does not match.')
      vibrateDevice([100, 50, 100])
      return
    }

    const hashed = await sha256(newPin)
    localStorage.setItem('jud_user_pin_hash', hashed)
    setPinChangeMsg('Master PIN updated successfully!')
    setNewPin('')
    setConfirmNewPin('')
    setTimeout(() => {
      setIsChangingPin(false)
      setPinChangeMsg('')
    }, 1500)
  }

  return (
    <div className="flex-1 flex flex-col px-4 py-4 space-y-4 overflow-y-auto select-none">
      {/* Header */}
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <User className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-none">Your Campus Identity</h1>
          <p className="text-[10px] text-slate-400">Security & Reputation Settings</p>
        </div>
      </div>

      {/* Main Profile Info Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex items-center space-x-4">
          <img
            src={currentProfile.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
            alt={currentProfile.full_name}
            className="w-18 h-18 rounded-2xl object-cover border-2 border-rose-500/40 bg-slate-800"
          />

          <div className="space-y-1">
            <div className="flex items-baseline space-x-2">
              <h2 className="text-xl font-bold text-white">{currentProfile.full_name}</h2>
              <span className="text-sm font-semibold text-rose-400">{currentProfile.age}</span>
            </div>
            <a
              href={`https://instagram.com/${currentProfile.insta_handle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1 text-xs text-rose-400 font-medium hover:underline"
            >
              <InstagramIcon className="w-3.5 h-3.5" />
              <span>{currentProfile.insta_handle}</span>
            </a>
            <div className="flex items-center space-x-1 text-[11px] text-emerald-400 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verified Library Card</span>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
          <p className="text-xs text-slate-300 leading-relaxed">
            {currentProfile.bio || 'Campus member with verified credentials.'}
          </p>
        </div>

        {/* Public Transparency Reputation */}
        <div className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Public Safety Counters (Visible to Peers)
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-950/80 border border-amber-900/40 p-2.5 rounded-xl flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block">Reports Received</span>
                <span className="text-sm font-bold text-amber-400">{currentProfile.report_count}</span>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-rose-900/40 p-2.5 rounded-xl flex items-center space-x-2">
              <ShieldX className="w-4 h-4 text-rose-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block">Blocks Received</span>
                <span className="text-sm font-bold text-rose-400">{currentProfile.block_count}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Library Card Hash */}
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
            SHA-256 Card Signature
          </span>
          <p className="text-[10px] font-mono text-slate-500 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800 break-all">
            {currentProfile.library_card_hash || '3f54817a80a221f7c1d764724b07f879bf97779d72d627c29e18b06606fb2a0a'}
          </p>
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-1.5">
          <Lock className="w-3.5 h-3.5 text-rose-400" />
          <span>Device Security</span>
        </h3>

        {/* Biometrics Enrolment */}
        <button
          type="button"
          onClick={handleRegisterBiometrics}
          className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-between text-slate-300 hover:text-white transition-all"
        >
          <div className="flex items-center space-x-2">
            <Fingerprint className="w-4 h-4 text-rose-400" />
            <span>Enroll Device Biometrics (FaceID / Fingerprint)</span>
          </div>
          <span className="text-[10px] text-rose-400 font-mono">WebAuthn</span>
        </button>

        {bioSuccess && (
          <p className="text-[11px] text-emerald-400 bg-emerald-950/60 p-2 rounded-lg border border-emerald-900">
            {bioSuccess}
          </p>
        )}

        {/* Change Master PIN */}
        <button
          type="button"
          onClick={() => setIsChangingPin(!isChangingPin)}
          className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-between text-slate-300 hover:text-white transition-all"
        >
          <div className="flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-rose-400" />
            <span>Change 4-Digit Master PIN</span>
          </div>
          <span className="text-[10px] text-slate-500">Edit</span>
        </button>

        {isChangingPin && (
          <form onSubmit={handleChangePin} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                maxLength={4}
                required
                pattern="\d{4}"
                placeholder="New PIN"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-center font-mono text-sm text-white focus:outline-none focus:border-rose-500"
              />
              <input
                type="password"
                maxLength={4}
                required
                pattern="\d{4}"
                placeholder="Confirm PIN"
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-center font-mono text-sm text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            {pinChangeMsg && (
              <p className="text-[10px] text-rose-400 font-medium">{pinChangeMsg}</p>
            )}
            <button
              type="submit"
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all"
            >
              Save New PIN
            </button>
          </form>
        )}
      </div>

      {/* Logout / Switch Account */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full py-3 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/60 text-rose-300 font-semibold text-xs rounded-2xl flex items-center justify-center space-x-2 transition-all mt-auto"
      >
        <LogOut className="w-4 h-4" />
        <span>Log Out of JUD App</span>
      </button>
    </div>
  )
}

export default ProfileView
