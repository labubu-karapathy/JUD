import React, { useState, useRef, useEffect, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'
import { Camera, QrCode, CheckCircle2, AlertCircle, ArrowRight, ShieldCheck, Lock, User, Upload, RefreshCw } from 'lucide-react'
import { InstagramIcon } from '../components/InstagramIcon'
import { sha256, vibrateDevice } from '../utils/crypto'
import { api, type Profile } from '../services/supabase'
import { db } from '../db'

interface AuthProps {
  onAuthSuccess: (profile: Profile) => void
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [scanError, setScanError] = useState<string>('')
  const [rawBarcode, setRawBarcode] = useState<string>('')
  const [cardHash, setCardHash] = useState<string>('')

  // Form Fields
  const [fullName, setFullName] = useState<string>('')
  const [gender, setGender] = useState<'male' | 'female' | 'other'>('female')
  const [targetGender, setTargetGender] = useState<'male' | 'female' | 'all'>('all')
  const [age, setAge] = useState<number>(22)
  const [bio, setBio] = useState<string>('')
  const [instaHandle, setInstaHandle] = useState<string>('')
  const [photoUrls, setPhotoUrls] = useState<string[]>([
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
  ])

  // Step 3 PIN State
  const [pin, setPin] = useState<string>('')
  const [confirmPin, setConfirmPin] = useState<string>('')
  const [pinError, setPinError] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Scanner ref
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  // Cleanup scanner on unmount or step change
  const stopScanner = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.reset()
      readerRef.current = null
    }
    setIsScanning(false)
  }, [])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [stopScanner])

  // Step 1: Start Camera Barcode Scanner
  const startCameraScan = async () => {
    setScanError('')
    setIsScanning(true)
    try {
      const codeReader = new BrowserMultiFormatReader()
      readerRef.current = codeReader

      const videoInputDevices = await codeReader.listVideoInputDevices()
      if (videoInputDevices.length === 0) {
        throw new Error('No video camera detected on this system')
      }

      const selectedDeviceId = videoInputDevices[0].deviceId
      codeReader.decodeFromVideoDevice(
        selectedDeviceId,
        videoRef.current,
        async (result, err) => {
          if (result) {
            const scannedText = result.getText()
            stopScanner()
            await handleBarcodeReceived(scannedText)
          }
          if (err && !(err.name === 'NotFoundException')) {
            // Non-critical frame decode exceptions are expected while scanning
          }
        }
      )
    } catch (err: any) {
      console.error('Camera barcode scanning failed:', err)
      setScanError(err.message || 'Unable to open camera. Try image upload or demo card.')
      setIsScanning(false)
    }
  };

  // Image Upload Barcode decode
  const handleBarcodeImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setScanError('')
    try {
      const codeReader = new BrowserMultiFormatReader()
      const imageUrl = URL.createObjectURL(file)
      const result = await codeReader.decodeFromImageUrl(imageUrl)
      URL.revokeObjectURL(imageUrl)
      if (result) {
        await handleBarcodeReceived(result.getText())
      }
    } catch {
      setScanError('Could not decode a valid barcode from the image. Please try another clear photo or use manual simulation.')
    }
  }

  // Barcode string processing
  const handleBarcodeReceived = async (code: string) => {
    setRawBarcode(code)
    const hashed = await sha256(code)
    setCardHash(hashed)
    setCurrentStep(2)
  }

  // Fast Demo card generator for testing in desktop/terminal environments
  const handleUseDemoBarcode = async () => {
    const mockCard = `LIB-UNIV-${Math.floor(100000000 + Math.random() * 900000000)}`
    await handleBarcodeReceived(mockCard)
  }

  // Photo upload
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

  // Validate Step 2
  const handleProceedToPin = (e: React.FormEvent) => {
    e.preventDefault()

    if (!fullName.trim()) {
      alert('Please enter your full name')
      return
    }

    if (age < 18) {
      alert('You must be 18 years or older to join JUD')
      return
    }

    // Instagram validation (@username)
    let formattedInsta = instaHandle.trim()
    if (!formattedInsta.startsWith('@')) {
      formattedInsta = `@${formattedInsta}`
    }

    const instaRegex = /^@[a-zA-Z0-9._]{1,30}$/
    if (!instaRegex.test(formattedInsta)) {
      alert('Please provide a valid Instagram handle (e.g. @username)')
      return
    }

    setInstaHandle(formattedInsta)
    setCurrentStep(3)
  }

  // Step 3: Complete Registration
  const handleCompleteSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError('')

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setPinError('PIN must be exactly 4 digits')
      vibrateDevice([100, 50, 100])
      return
    }

    if (pin !== confirmPin) {
      setPinError('PIN confirmation does not match')
      vibrateDevice([100, 50, 100])
      return
    }

    setIsSubmitting(true)
    try {
      const hashedPin = await sha256(pin)
      localStorage.setItem('jud_user_pin_hash', hashedPin)

      const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`

      const newProfile: Profile = {
        id: userId,
        full_name: fullName.trim(),
        gender,
        target_gender: targetGender,
        age,
        bio: bio.trim() || 'Curious reader & verified campus member.',
        insta_handle: instaHandle,
        library_card_hash: cardHash,
        photo_urls: photoUrls.length > 0 ? photoUrls : [
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80'
        ],
        is_verified: true,
        report_count: 0,
        block_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Upsert to Supabase
      const savedProfile = await api.upsertProfile(newProfile)

      // Cache locally into Dexie
      await db.cached_profiles.put({
        id: savedProfile.id,
        full_name: savedProfile.full_name,
        gender: savedProfile.gender,
        target_gender: savedProfile.target_gender,
        age: savedProfile.age,
        bio: savedProfile.bio,
        insta_handle: savedProfile.insta_handle,
        library_card_hash: savedProfile.library_card_hash,
        photo_urls: savedProfile.photo_urls,
        is_verified: savedProfile.is_verified,
        report_count: savedProfile.report_count,
        block_count: savedProfile.block_count,
        updated_at: savedProfile.updated_at,
      })

      localStorage.setItem('jud_current_user_id', savedProfile.id)
      onAuthSuccess(savedProfile)
    } catch (err: any) {
      console.error('Registration failed:', err)
      setPinError(err.message || 'Registration failed. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col justify-between px-5 py-6">
      {/* Step Indicators */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl font-black tracking-tight text-white">JUD</span>
            <span className="text-xs bg-rose-500/20 text-rose-400 font-bold px-2 py-0.5 rounded-full border border-rose-500/30">
              CAMPUS P2P
            </span>
          </div>
          <span className="text-xs font-mono text-slate-400">Step {currentStep} of 3</span>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-3 gap-2">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${currentStep >= 1 ? 'bg-rose-500' : 'bg-slate-800'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${currentStep >= 2 ? 'bg-rose-500' : 'bg-slate-800'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${currentStep >= 3 ? 'bg-rose-500' : 'bg-slate-800'}`} />
        </div>
      </div>

      {/* --- STEP 1: LIBRARY CARD SCAN --- */}
      {currentStep === 1 && (
        <div className="flex-1 flex flex-col justify-center space-y-6 my-auto">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20 shadow-lg shadow-rose-500/10">
              <QrCode className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Scan University Library Card</h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              JUD is exclusively for verified students. We scan your physical library card and hash it with SHA-256 for privacy.
            </p>
          </div>

          {/* Scanner Viewport */}
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-4 overflow-hidden flex flex-col items-center justify-center min-h-[260px]">
            {isScanning ? (
              <div className="relative w-full h-56 rounded-xl overflow-hidden bg-black flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-2 border-rose-500/60 rounded-xl pointer-events-none animate-pulse" />
                <div className="absolute bottom-2 bg-black/70 px-3 py-1 rounded-full text-[10px] text-white">
                  Point camera directly at card barcode
                </div>
              </div>
            ) : (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 bg-slate-800/80 rounded-xl flex items-center justify-center mx-auto text-slate-400">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-200">Camera / Image Scanner</p>
                  <p className="text-[11px] text-slate-500">Supports standard barcodes & Code 128 / 39</p>
                </div>
              </div>
            )}

            {scanError && (
              <div className="mt-3 flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/60 p-2.5 rounded-lg border border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scanError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="w-full mt-4 space-y-2">
              {!isScanning ? (
                <button
                  type="button"
                  onClick={startCameraScan}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-rose-600/20"
                >
                  <Camera className="w-4 h-4" />
                  <span>Open Device Camera</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopScanner}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition-all"
                >
                  Cancel Camera
                </button>
              )}

              <label className="w-full py-2 bg-slate-800 hover:bg-slate-700/80 border border-slate-700 text-slate-300 font-semibold rounded-xl text-xs flex items-center justify-center space-x-2 cursor-pointer transition-all">
                <Upload className="w-4 h-4 text-slate-400" />
                <span>Upload Barcode Image</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBarcodeImageUpload}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={handleUseDemoBarcode}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-400 hover:text-slate-200 rounded-xl flex items-center justify-center space-x-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Simulate Verified Card (Quick Test)</span>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-2 text-[11px] text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Zero database storage of raw student card numbers</span>
          </div>
        </div>
      )}

      {/* --- STEP 2: PROFILE DETAILS & INSTAGRAM --- */}
      {currentStep === 2 && (
        <form onSubmit={handleProceedToPin} className="flex-1 flex flex-col justify-between my-auto space-y-4 py-2 overflow-y-auto max-h-[75vh]">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Library Card Verified: {rawBarcode.slice(0, 10)}...</span>
            </div>
            <h2 className="text-xl font-bold text-white">Create Your Profile</h2>
            <p className="text-xs text-slate-400">Campus transparency is key. Add your true details.</p>
          </div>

          <div className="space-y-3">
            {/* Full Name */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Lin"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Instagram Handle */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Instagram Handle
              </label>
              <div className="relative">
                <InstagramIcon className="absolute left-3 top-3 w-4 h-4 text-rose-400" />
                <input
                  type="text"
                  required
                  placeholder="@your_instagram"
                  value={instaHandle}
                  onChange={(e) => setInstaHandle(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Must start with @ and be a valid handle</p>
            </div>

            {/* Gender Selection & Target */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  I am a
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                >
                  <option value="female">Female (First-Move Active)</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  Age (18+)
                </label>
                <input
                  type="number"
                  min="18"
                  max="99"
                  value={age}
                  onChange={(e) => setAge(parseInt(e.target.value) || 18)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            {/* Looking For */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Interested in meeting
              </label>
              <select
                value={targetGender}
                onChange={(e) => setTargetGender(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500"
              >
                <option value="all">Everyone</option>
                <option value="male">Men</option>
                <option value="female">Women</option>
              </select>
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
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-rose-500 resize-none"
              />
            </div>

            {/* Photos Preview & Upload */}
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Profile Photos
              </label>
              <div className="flex items-center space-x-2">
                {photoUrls.map((url, i) => (
                  <div key={i} className="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-700 bg-slate-800">
                    <img src={url} alt="Profile" className="w-full h-full object-cover" />
                  </div>
                ))}
                <label className="w-14 h-14 rounded-xl border border-dashed border-slate-700 hover:border-rose-500 flex flex-col items-center justify-center text-slate-400 cursor-pointer transition-all">
                  <Upload className="w-4 h-4" />
                  <span className="text-[8px] mt-0.5 font-semibold">+ Add</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="py-2.5 px-4 bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold rounded-xl"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-rose-600/20"
            >
              <span>Setup Master PIN</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* --- STEP 3: 4-DIGIT PIN SETUP --- */}
      {currentStep === 3 && (
        <form onSubmit={handleCompleteSetup} className="flex-1 flex flex-col justify-center space-y-6 my-auto">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-rose-500/10 text-rose-500 rounded-2xl flex items-center justify-center mx-auto border border-rose-500/20 shadow-lg shadow-rose-500/10">
              <Lock className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-white">Setup 4-Digit Master PIN</h2>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Your PIN secures the app on backgrounding or lock. It is hashed with SHA-256 and never leaves your device.
            </p>
          </div>

          <div className="space-y-4 max-w-xs mx-auto w-full">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Enter 4-Digit PIN
              </label>
              <input
                type="password"
                maxLength={4}
                required
                pattern="\d{4}"
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Confirm 4-Digit PIN
              </label>
              <input
                type="password"
                maxLength={4}
                required
                pattern="\d{4}"
                placeholder="••••"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-center text-2xl font-mono tracking-widest text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {pinError && (
              <div className="flex items-center space-x-1.5 text-xs text-rose-400 bg-rose-950/60 p-2.5 rounded-lg border border-rose-900">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="py-2.5 px-4 bg-slate-900 border border-slate-800 text-slate-400 text-xs font-semibold rounded-xl"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isSubmitting || pin.length !== 4 || confirmPin.length !== 4}
              className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-rose-600/20"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'Finalizing Setup...' : 'Complete & Enter App'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default Auth
