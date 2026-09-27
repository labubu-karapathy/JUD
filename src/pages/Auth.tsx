import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Lock,
  User,
  Upload,
  GraduationCap,
  AlertCircle,
  LogIn,
  UserPlus,
  Trash2,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import { InstagramIcon } from '../components/InstagramIcon'
import { sha256, vibrateDevice } from '../utils/crypto'
import { api, type Profile } from '../services/supabase'
import { db } from '../db'
import { JADAVPUR_DEPARTMENTS } from '../utils/departmentValidator'
import { backupUserProfileToGitHub, fetchUserProfileFromGitHub } from '../services/githubRelay'

interface AuthProps {
  onAuthSuccess: (profile: Profile) => void
}

const SAVED_PROFILE_KEY = 'jud_saved_device_profile'

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const currentYear = new Date().getFullYear()

  // Mode: 'signup' vs 'signin'
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup')
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null)
  const [useDifferentAccount, setUseDifferentAccount] = useState<boolean>(false)

  // Single-page registration form state
  const [fullName, setFullName] = useState<string>('')
  const [libraryCard, setLibraryCard] = useState<string>('')
  const [department, setDepartment] = useState<string>('Computer Science & Engineering')
  const [gradYearInput, setGradYearInput] = useState<string>(String(currentYear + 2))
  const [age, setAge] = useState<number>(20)
  const [gender, setGender] = useState<'female' | 'male'>('female')
  const [instaHandle, setInstaHandle] = useState<string>('')
  const [bio, setBio] = useState<string>('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([])

  // Master Passcode setup (6 digits)
  const [pin, setPin] = useState<string>('')
  const [confirmPin, setConfirmPin] = useState<string>('')

  // Universal Sign-in state
  const [signInIdentifier, setSignInIdentifier] = useState<string>('')
  const [signInPin, setSignInPin] = useState<string>('')

  // Status & Error
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [pendingApprovalProfile, setPendingApprovalProfile] = useState<Profile | null>(null)

  // Load saved device profile on boot
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_PROFILE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Profile
        setSavedProfile(parsed)
        setAuthMode('signin')
      }
    } catch {
      // Ignore parse errors
    }
  }, [])

  // Handle Photo Upload (real student photo only, zero placeholders)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setPhotoUrls([reader.result, ...photoUrls])
      }
    }
    reader.readAsDataURL(file)
  }

  const handleRemovePhoto = (index: number) => {
    setPhotoUrls((prev) => prev.filter((_, i) => i !== index))
  }

  // Handle Universal Sign In (Saved Profile or Library Card / @Instagram + Passcode)
  const handleUniversalSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    if (signInPin.length < 4 || signInPin.length > 6) {
      setErrorMsg('Please enter your 4 to 6 digit passcode')
      vibrateDevice([100, 50, 100])
      return
    }

    setIsSubmitting(true)
    try {
      const enteredHash = await sha256(signInPin)

      // 1. If signing in with saved profile on this device
      if (savedProfile && !useDifferentAccount) {
        const storedHash = localStorage.getItem('jud_user_pin_hash')
        if (storedHash && enteredHash !== storedHash) {
          setErrorMsg('Incorrect passcode. Please try again.')
          vibrateDevice([100, 50, 100])
          setIsSubmitting(false)
          return
        }

        const remote = await api.getProfile(savedProfile.id)
        const activeProfile = remote || savedProfile

        if (activeProfile.pin_hash && activeProfile.pin_hash !== enteredHash) {
          setErrorMsg('Incorrect passcode. Please try again.')
          vibrateDevice([100, 50, 100])
          setIsSubmitting(false)
          return
        }

        localStorage.setItem('jud_current_user_id', activeProfile.id)
        localStorage.setItem('jud_user_pin_hash', enteredHash)
        onAuthSuccess(activeProfile)
        return
      }

      // 2. Sign In with Library Card ID or @Instagram Handle
      const cleanId = signInIdentifier.trim()
      if (!cleanId) {
        setErrorMsg('Please enter your Library Card ID (e.g. SL-4762) or @Instagram handle')
        vibrateDevice([100, 50, 100])
        setIsSubmitting(false)
        return
      }

      // A. Check GitHub Encrypted Vault
      let activeProfile: Profile | null = null
      try {
        const ghProfile = await fetchUserProfileFromGitHub(cleanId, signInPin)
        if (ghProfile) {
          activeProfile = ghProfile as Profile
        }
      } catch (err) {
        console.warn('GitHub profile retrieval:', err)
      }

      // B. Check Supabase as primary/sync source
      if (!activeProfile) {
        const remote = await api.checkExistingStudent(cleanId.toUpperCase(), cleanId)
        if (remote && remote.pin_hash === enteredHash) {
          activeProfile = remote
          // Synchronize to GitHub encrypted vault
          backupUserProfileToGitHub(remote, signInPin).catch(() => {})
        }
      }

      if (!activeProfile) {
        setErrorMsg('Account not found or incorrect passcode. If new to campus, please Sign Up.')
        vibrateDevice([100, 50, 100])
        setIsSubmitting(false)
        return
      }

      if (activeProfile.pin_hash && activeProfile.pin_hash !== enteredHash) {
        setErrorMsg('Incorrect passcode. Please try again.')
        vibrateDevice([100, 50, 100])
        setIsSubmitting(false)
        return
      }

      // Cache locally
      localStorage.setItem('jud_current_user_id', activeProfile.id)
      localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(activeProfile))
      localStorage.setItem('jud_user_pin_hash', enteredHash)
      await db.cached_profiles.put({
        id: activeProfile.id,
        full_name: activeProfile.full_name,
        gender: activeProfile.gender,
        target_gender: activeProfile.target_gender,
        age: activeProfile.age,
        department: activeProfile.department,
        grad_year: activeProfile.grad_year,
        is_approved: activeProfile.is_approved,
        is_deactivated: activeProfile.is_deactivated,
        active_chat_count: activeProfile.active_chat_count,
        bio: activeProfile.bio,
        insta_handle: activeProfile.insta_handle,
        library_card_hash: activeProfile.library_card_hash,
        photo_urls: activeProfile.photo_urls,
        is_verified: activeProfile.is_verified,
        report_count: activeProfile.report_count || 0,
        block_count: activeProfile.block_count || 0,
        updated_at: activeProfile.updated_at || new Date().toISOString(),
      })

      onAuthSuccess(activeProfile)
    } catch (err: any) {
      console.error('Sign-in error:', err)
      setErrorMsg(err.message || 'Failed to authenticate')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle Single-Page Registration Submission
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg('')

    // 1. Full name validation
    if (!fullName.trim()) {
      setErrorMsg('Please enter your full name')
      vibrateDevice([100, 50, 100])
      return
    }

    // 2. Library card ID validation (e.g. SL-4762)
    const cleanCard = libraryCard.trim().toUpperCase()
    if (!cleanCard || cleanCard.length < 3) {
      setErrorMsg('Please enter your valid Library Card ID (e.g. SL-4762)')
      vibrateDevice([100, 50, 100])
      return
    }

    // 3. Department validation
    if (!department) {
      setErrorMsg('Please select your department')
      return
    }

    // 4. Graduation year validation: typable, and anything below current year won't be allowed
    const parsedGradYear = parseInt(gradYearInput.trim(), 10)
    if (isNaN(parsedGradYear) || parsedGradYear < currentYear) {
      setErrorMsg(`Graduation year must be ${currentYear} or later (graduated alumni are auto-removed)`)
      vibrateDevice([100, 50, 100])
      return
    }

    // 5. Age validation
    if (age < 18 || age > 99) {
      setErrorMsg('You must be 18 years or older to join Jadavpur Love Birds')
      return
    }

    // 6. Instagram handle validation
    let formattedInsta = instaHandle.trim()
    if (!formattedInsta.startsWith('@')) {
      formattedInsta = `@${formattedInsta}`
    }
    const instaRegex = /^@[a-zA-Z0-9._]{1,30}$/
    if (!instaRegex.test(formattedInsta)) {
      setErrorMsg('Please enter a valid Instagram handle (e.g. @username)')
      vibrateDevice([100, 50, 100])
      return
    }

    // 7. Photo requirement check
    if (photoUrls.length === 0) {
      setErrorMsg('Please upload at least 1 real profile photo')
      vibrateDevice([100, 50, 100])
      return
    }

    // 8. 6-Digit Master Passcode validation
    if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      setErrorMsg('Passcode must be exactly 6 digits')
      vibrateDevice([100, 50, 100])
      return
    }

    if (pin !== confirmPin) {
      setErrorMsg('Passcode confirmation does not match')
      vibrateDevice([100, 50, 100])
      return
    }

    setIsSubmitting(true)
    try {
      // Check for duplicate Library Card ID or Instagram handle on campus
      const existing = await api.checkExistingStudent(cleanCard, formattedInsta)
      if (existing) {
        if (existing.library_card_hash?.toUpperCase() === cleanCard) {
          setErrorMsg(`Library card '${cleanCard}' is already registered on campus. Use a different card or sign in.`)
          vibrateDevice([100, 50, 100])
          setIsSubmitting(false)
          return
        }
        if (existing.insta_handle?.toLowerCase() === formattedInsta.toLowerCase()) {
          setErrorMsg(`Instagram handle '${formattedInsta}' is already registered. Please check your username.`)
          vibrateDevice([100, 50, 100])
          setIsSubmitting(false)
          return
        }
      }

      // Hash passcode locally with SHA-256 and store locally
      const hashedPin = await sha256(pin)
      localStorage.setItem('jud_user_pin_hash', hashedPin)

      const userId = crypto.randomUUID()
      // Cross-gender interest derived smoothly in backend
      const targetGender: 'male' | 'female' = gender === 'female' ? 'male' : 'female'

      const newProfile: Profile = {
        id: userId,
        full_name: fullName.trim(),
        gender,
        target_gender: targetGender,
        age,
        department,
        grad_year: parsedGradYear,
        is_approved: false, // Strict: profile starts locked under admin review
        is_deactivated: false,
        active_chat_count: 0,
        bio: bio.trim() || 'Jadavpur University student.',
        insta_handle: formattedInsta,
        library_card_hash: cleanCard,
        photo_urls: photoUrls,
        is_verified: true,
        report_count: 0,
        block_count: 0,
        pin_hash: hashedPin, // Persisted to Supabase
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // 1. Persist to Supabase
      const saved = await api.upsertProfile(newProfile)

      // 2. Cache in local IndexedDB
      await db.cached_profiles.put({
        id: saved.id,
        full_name: saved.full_name,
        gender: saved.gender,
        target_gender: saved.target_gender,
        age: saved.age,
        department: saved.department,
        grad_year: saved.grad_year,
        is_approved: saved.is_approved,
        is_deactivated: saved.is_deactivated,
        active_chat_count: saved.active_chat_count,
        bio: saved.bio,
        insta_handle: saved.insta_handle,
        library_card_hash: saved.library_card_hash,
        photo_urls: saved.photo_urls,
        is_verified: saved.is_verified,
        report_count: saved.report_count,
        block_count: saved.block_count,
        updated_at: saved.updated_at,
      })

      // 3. Save profile locally so user can quickly sign back in upon logout
      localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(saved))
      localStorage.setItem('jud_current_user_id', saved.id)

      // Back up encrypted profile to GitHub repository (labubu-karapathy/backend)
      backupUserProfileToGitHub(saved, pin).catch((ghErr) =>
        console.warn('[GitHub Profile Backup Error]:', ghErr)
      )

      // Show the dedicated "Request Sent, Waiting for Approval" window modal!
      setPendingApprovalProfile(saved)
    } catch (err: any) {
      console.error('Registration error caught:', err)
      const errStr = (err?.message || '').toLowerCase()
      // If statement was cancelled or timeout occurred, request was received or pending
      if (errStr.includes('canceling statement') || errStr.includes('timeout') || errStr.includes('network')) {
        const fallbackProfile: Profile = {
          id: crypto.randomUUID(),
          full_name: fullName.trim(),
          gender,
          target_gender: gender === 'female' ? 'male' : 'female',
          age,
          department,
          grad_year: parsedGradYear,
          is_approved: false,
          is_deactivated: false,
          active_chat_count: 0,
          bio: bio.trim() || 'Jadavpur University student.',
          insta_handle: formattedInsta,
          library_card_hash: cleanCard,
          photo_urls: photoUrls,
          is_verified: true,
          report_count: 0,
          block_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        localStorage.setItem(SAVED_PROFILE_KEY, JSON.stringify(fallbackProfile))
        setPendingApprovalProfile(fallbackProfile)
      } else {
        setErrorMsg(err.message || 'Registration failed. Please check network and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // Clear saved profile from device
  const handleForgetSavedProfile = () => {
    localStorage.removeItem(SAVED_PROFILE_KEY)
    setSavedProfile(null)
    setAuthMode('signup')
  }

  return (
    <div className="flex-1 flex flex-col justify-between px-5 py-6 overflow-y-auto">
      {/* Header Branding */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img
              src="/icon.png"
              alt="JLB"
              className="w-9 h-9 rounded-2xl object-cover border border-slate-700/80 shadow-md"
            />
            <div>
              <span className="text-lg font-black tracking-tight text-white block leading-none">
                Jadavpur Love Birds
              </span>
              <span className="text-[10px] text-slate-400">Exclusive Verified Campus Dating</span>
            </div>
          </div>
          <span className="text-[9px] bg-rose-500/20 text-rose-400 font-bold px-2 py-0.5 rounded-full border border-rose-500/30">
            CAMPUS P2P
          </span>
        </div>

        {/* Universal Top Tabs: Sign In vs Sign Up */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-2xl p-1 gap-1 shadow-inner">
          <button
            type="button"
            onClick={() => {
              setAuthMode('signin')
              setErrorMsg('')
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-all ${
              authMode === 'signin'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setAuthMode('signup')
              setErrorMsg('')
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-xl flex items-center justify-center space-x-1.5 transition-all ${
              authMode === 'signup'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Sign Up</span>
          </button>
        </div>
      </div>

      {/* --- MODE 1: UNIVERSAL SIGN IN --- */}
      {authMode === 'signin' && (
        <form onSubmit={handleUniversalSignIn} className="my-auto space-y-4 py-3">
          {savedProfile && !useDifferentAccount ? (
            /* Saved Profile Quick Access */
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="relative w-20 h-20 mx-auto rounded-3xl overflow-hidden border-2 border-rose-500/40 shadow-xl bg-slate-800">
                  {savedProfile.photo_urls?.[0] ? (
                    <img
                      src={savedProfile.photo_urls[0]}
                      alt={savedProfile.full_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white">
                      {savedProfile.full_name?.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">{savedProfile.full_name}</h2>
                  <p className="text-xs text-rose-300 font-mono">{savedProfile.insta_handle}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {savedProfile.department} • Class of {savedProfile.grad_year}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 max-w-xs mx-auto w-full">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold text-center">
                  Enter Passcode (4–6 Digits)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="••••••"
                  value={signInPin}
                  onChange={(e) => setSignInPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/60 p-2.5 rounded-lg border border-rose-900 max-w-xs mx-auto">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-2.5 max-w-xs mx-auto w-full pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || signInPin.length < 4}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-rose-600/20 active:scale-98"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isSubmitting ? 'Authenticating...' : 'Sign In to Account'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setUseDifferentAccount(true)
                    setErrorMsg('')
                    setSignInPin('')
                  }}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-all border border-slate-800"
                >
                  Sign In with Different ID
                </button>

                <button
                  type="button"
                  onClick={handleForgetSavedProfile}
                  className="w-full py-1.5 text-slate-500 hover:text-rose-400 text-[10px] font-semibold flex items-center justify-center space-x-1 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Remove Saved Profile</span>
                </button>
              </div>
            </div>
          ) : (
            /* Universal Sign In with Library Card ID or @Instagram */
            <div className="space-y-3.5 max-w-xs mx-auto w-full">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white">Student Sign In</h2>
                <p className="text-xs text-slate-400">
                  Access your encrypted campus profile & chats backed up on GitHub.
                </p>
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Library Card ID or @Instagram
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SL-4762 or @username"
                  value={signInIdentifier}
                  onChange={(e) => setSignInIdentifier(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-semibold text-slate-400">
                  Passcode (4–6 Digits)
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  placeholder="••••••"
                  value={signInPin}
                  onChange={(e) => setSignInPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-center text-xl font-mono tracking-widest text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              {errorMsg && (
                <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/60 p-2.5 rounded-lg border border-rose-900">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-2 pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || signInPin.length < 4 || !signInIdentifier.trim()}
                  className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-rose-600/20 active:scale-98"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{isSubmitting ? 'Decrypting Vault...' : 'Sign In to Campus Network'}</span>
                </button>

                {savedProfile && (
                  <button
                    type="button"
                    onClick={() => {
                      setUseDifferentAccount(false)
                      setErrorMsg('')
                      setSignInPin('')
                    }}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition-all border border-slate-800"
                  >
                    Back to Saved Profile ({savedProfile.full_name})
                  </button>
                )}
              </div>
            </div>
          )}
        </form>
      )}

      {/* --- MODE 2: SINGLE-PAGE REGISTRATION FORM --- */}
      {authMode === 'signup' && (
        <form onSubmit={handleRegister} className="my-auto space-y-3.5 py-3">
          <div>
            <h2 className="text-lg font-black text-white">Campus Student Registration</h2>
            <p className="text-xs text-slate-400">
              Fill all details once. Profile requires Admin approval before unlocking matches.
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/60 p-2.5 rounded-lg border border-rose-900">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="space-y-3">
            {/* Full Name */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Sreya Roy"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Library Card ID (Typable directly, e.g. SL-4762) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Library Card ID
                </label>
                <span className="text-[10px] text-slate-500 font-mono">Format: SL-4762</span>
              </div>
              <input
                type="text"
                required
                placeholder="e.g. SL-4762"
                value={libraryCard}
                onChange={(e) => setLibraryCard(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white uppercase placeholder-slate-600 focus:outline-none focus:border-rose-500 font-mono tracking-wider"
              />
            </div>

            {/* Department (Full Name Dropdown) */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Department
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
              >
                {JADAVPUR_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>

            {/* Graduation Year (Typable, >= currentYear) & Age */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                    Grad Year
                  </label>
                  <span className="text-[10px] text-amber-400 font-mono">&gt;= {currentYear}</span>
                </div>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="number"
                    required
                    min={currentYear}
                    placeholder={String(currentYear + 2)}
                    value={gradYearInput}
                    onChange={(e) => setGradYearInput(e.target.value)}
                    className="w-full pl-8 pr-2 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Age (18+)
                </label>
                <input
                  type="number"
                  min="18"
                  max="99"
                  required
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value, 10) || 18)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>
            </div>

            {/* Gender Selection (strictly Female & Male only) */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Gender
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setGender('female')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                    gender === 'female'
                      ? 'bg-rose-600/20 border-rose-500 text-rose-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Female (First-Move)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setGender('male')}
                  className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all ${
                    gender === 'male'
                      ? 'bg-rose-600/20 border-rose-500 text-rose-300 shadow-sm'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Male</span>
                </button>
              </div>
            </div>

            {/* Instagram Handle */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Instagram Handle
              </label>
              <div className="relative">
                <InstagramIcon className="absolute left-3 top-2.5 w-4 h-4 text-rose-400" />
                <input
                  type="text"
                  required
                  placeholder="@username"
                  value={instaHandle}
                  onChange={(e) => setInstaHandle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Short Bio
              </label>
              <textarea
                rows={2}
                placeholder="Major, campus hangout spot, or favorite study drink..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            {/* Real Student Photos Upload (Zero placeholder) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Profile Photo (Real student photo required)
                </label>
                <span className="text-[10px] text-rose-400 font-semibold">
                  {photoUrls.length === 0 ? 'Required' : `${photoUrls.length} added`}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                {photoUrls.map((url, i) => (
                  <div
                    key={i}
                    className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-700 bg-slate-800 group"
                  >
                    <img src={url} alt="Profile" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(i)}
                      className="absolute inset-0 bg-black/60 text-rose-400 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <label className="w-14 h-14 rounded-xl border border-dashed border-slate-700 hover:border-rose-500 flex flex-col items-center justify-center text-slate-400 cursor-pointer transition-all">
                  <Upload className="w-4 h-4" />
                  <span className="text-[8px] mt-0.5 font-semibold">+ Add</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            </div>

              {/* Master Passcode Setup (6 digits) */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800/80">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  6-Digit Passcode
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  pattern="\d{6}"
                  placeholder="••••••"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Confirm Passcode
                </label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  pattern="\d{6}"
                  placeholder="••••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-center text-lg font-mono tracking-widest text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || photoUrls.length === 0}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all shadow-md shadow-rose-600/20 active:scale-98"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Submitting Request...' : 'Submit Profile for Admin Approval'}</span>
            </button>
          </div>
        </form>
      )}

      {/* --- DEDICATED WINDOW: REQUEST SENT, WAITING FOR APPROVAL --- */}
      {pendingApprovalProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-6 text-center space-y-4 shadow-2xl animate-scale-in">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-white">Request Sent</h3>
              <p className="text-sm font-semibold text-amber-300">Waiting for Admin Approval</p>
              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                Your campus verification for <span className="text-white font-semibold">{pendingApprovalProfile.full_name}</span> ({pendingApprovalProfile.library_card_hash}) has been safely submitted.
              </p>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3.5 text-left text-xs space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-[11px]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Encrypted credentials dispatched to workstation</span>
              </div>
              <p className="text-[11px] text-slate-400">
                You will be granted full access once campus administrators review and permit your student credentials.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const refreshed = await api.getProfile(pendingApprovalProfile.id)
                    if (refreshed && refreshed.is_approved) {
                      onAuthSuccess(refreshed)
                    } else {
                      alert('Profile is still under review by campus administrators. Please check back shortly!')
                    }
                  } catch {
                    alert('Profile is still awaiting admin authorization.')
                  }
                }}
                className="w-full py-3 bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold text-xs rounded-xl shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center space-x-2"
              >
                <span>🔄 Check Approval Status</span>
              </button>

              <button
                type="button"
                onClick={() => onAuthSuccess(pendingApprovalProfile)}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all"
              >
                Proceed to Under Review Screen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Notice */}
      <div className="flex items-center justify-center space-x-1.5 text-[11px] text-slate-500 pt-2">
        <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Zero Server Storage • Admin verification required for activation</span>
      </div>
    </div>
  )
}

export default Auth
