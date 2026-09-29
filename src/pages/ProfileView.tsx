import React, { useState, useRef } from 'react'
import {
  User,
  ShieldCheck,
  Lock,
  LogOut,
  AlertTriangle,
  ShieldX,
  KeyRound,
  Building2,
  GraduationCap,
  Camera,
  Pencil,
  Check,
  Loader2,
  RefreshCw,
  Download,
  HardDrive,
  Upload,
  CheckCircle2,
  ScrollText,
} from 'lucide-react'
import { InstagramIcon } from '../components/InstagramIcon'
import { api, type Profile, calculateCurrentAge } from '../services/supabase'
import { db } from '../db'
import { sha256, vibrateDevice } from '../utils/crypto'
import { TermsAndConditionsModal } from '../components/TermsAndConditionsModal'
import {
  checkForUpdate,
  applyOtaUpdate,
  downloadAndInstallUpdate,
  CURRENT_APP_VERSION,
} from '../services/updateService'

interface ProfileViewProps {
  currentProfile: Profile
  onLogout: () => void
  onProfileUpdated?: (updated: Profile) => void
}

/**
 * Client-side lightweight image compression for crisp avatar rendering without heavy storage overhead
 */
const compressImage = (file: File, maxWidth = 800, maxHeight = 800, quality = 0.85): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          } else {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(e.target?.result as string)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentProfile,
  onLogout,
  onProfileUpdated,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Passcode state
  const [isChangingPin, setIsChangingPin] = useState<boolean>(false)
  const [newPin, setNewPin] = useState<string>('')
  const [confirmNewPin, setConfirmNewPin] = useState<string>('')
  const [pinChangeMsg, setPinChangeMsg] = useState<string>('')

  // Mutable Bio / Description state
  const [isEditingBio, setIsEditingBio] = useState<boolean>(false)
  const [bioInput, setBioInput] = useState<string>(currentProfile.bio || '')
  const [isSavingBio, setIsSavingBio] = useState<boolean>(false)

  // Mutable Profile Picture state
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false)

  // Transient Toast Feedback
  const [toastMessage, setToastMessage] = useState<string>('')

  // OTA Updates State
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false)
  const [updateInfo, setUpdateInfo] = useState<{
    available: boolean
    latestVersion?: string
    releaseNotes?: string
    isNative?: boolean
    directApkUrl?: string
  } | null>(null)
  const [isUpdating, setIsUpdating] = useState<boolean>(false)

  // Local Chat Backup & Restore State
  const backupFileInputRef = useRef<HTMLInputElement>(null)
  const [isExportingBackup, setIsExportingBackup] = useState<boolean>(false)
  const [isImportingBackup, setIsImportingBackup] = useState<boolean>(false)

  // Terms & Conditions Modal State
  const [isTermsOpen, setIsTermsOpen] = useState<boolean>(false)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3500)
  }

  // Handle Manual Check for Updates
  const handleCheckForUpdates = async () => {
    setIsCheckingUpdate(true)
    try {
      const result = await checkForUpdate()
      if (result.hasUpdate && result.remoteManifest) {
        setUpdateInfo({
          available: true,
          latestVersion: result.remoteManifest.version,
          releaseNotes: result.remoteManifest.commit_message || 'Performance and bug fixes',
          isNative: !result.isOtaAvailable,
          directApkUrl: result.remoteManifest.downloadUrl,
        })
        showToast(`Update v${result.remoteManifest.version} is available!`)
      } else {
        setUpdateInfo({ available: false })
        showToast('App is up to date!')
      }
    } catch (err: any) {
      console.error('Update check error:', err)
      showToast('Failed to check for updates. Check internet connection.')
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  // Handle Applying OTA Update
  const handleApplyUpdate = async () => {
    if (!updateInfo?.available) return
    setIsUpdating(true)
    try {
      showToast('Downloading and installing update...')
      const result = await checkForUpdate()
      if (result.isOtaAvailable && result.remoteManifest?.webBundleUrl) {
        await applyOtaUpdate(result.remoteManifest.webBundleUrl, result.remoteManifest.version)
      } else if (result.remoteManifest?.downloadUrl) {
        await downloadAndInstallUpdate(result.remoteManifest.downloadUrl)
      }
    } catch (err: any) {
      console.error('Failed to apply update:', err)
      showToast(err?.message || 'Failed to update')
      setIsUpdating(false)
    }
  }

  // Handle Export Local Chat Backup (JSON)
  const handleExportBackup = async () => {
    setIsExportingBackup(true)
    try {
      const jsonStr = await db.exportChatBackup()
      const blob = new Blob([jsonStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const dateStr = new Date().toISOString().slice(0, 10)
      a.href = url
      a.download = `JLB_Chat_Backup_${dateStr}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      showToast('Chat backup downloaded to device!')
    } catch (err: any) {
      console.error('Backup export error:', err)
      showToast('Failed to export backup')
    } finally {
      setIsExportingBackup(false)
    }
  }

  // Handle Import Local Chat Backup (JSON)
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImportingBackup(true)
    try {
      const text = await file.text()
      const result = await db.importChatBackup(text)
      if (result.success) {
        showToast(`Restored ${result.messagesRestored} messages & ${result.profilesRestored} profiles!`)
      } else {
        showToast(`Restore failed: ${result.error}`)
      }
    } catch (err: any) {
      console.error('Backup import error:', err)
      showToast('Invalid backup file')
    } finally {
      setIsImportingBackup(false)
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = ''
      }
    }
  }

  // Dynamic age auto-increments with each passing calendar year
  const dynamicAge = calculateCurrentAge(currentProfile)

  // Handle Profile Picture Update
  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const file = files[0]
    setIsUploadingPhoto(true)
    try {
      const base64Data = await compressImage(file, 800, 800, 0.85)
      const existingPhotos = currentProfile.photo_urls || []
      const updatedPhotos = [base64Data, ...existingPhotos.slice(1)]

      const updatedProfile: Profile = {
        ...currentProfile,
        photo_urls: updatedPhotos,
        updated_at: new Date().toISOString(),
      }

      // 1. Sync with Supabase PostgreSQL
      await api.upsertProfile(updatedProfile)

      // 2. Sync local storage & local Dexie DB
      localStorage.setItem('jud_saved_device_profile', JSON.stringify(updatedProfile))
      await db.cached_profiles.put(updatedProfile)

      // 3. Notify parent app state
      if (onProfileUpdated) {
        onProfileUpdated(updatedProfile)
      }

      showToast('Profile photo updated successfully!')
    } catch (err: any) {
      console.error('Failed to update photo:', err)
      showToast(err?.message || 'Failed to update photo')
    } finally {
      setIsUploadingPhoto(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Handle Bio / Description Update
  const handleSaveBio = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingBio(true)
    try {
      const updatedBio = bioInput.trim()
      const updatedProfile: Profile = {
        ...currentProfile,
        bio: updatedBio,
        updated_at: new Date().toISOString(),
      }

      // 1. Sync with Supabase PostgreSQL
      await api.upsertProfile(updatedProfile)

      // 2. Sync local storage & local Dexie DB
      localStorage.setItem('jud_saved_device_profile', JSON.stringify(updatedProfile))
      await db.cached_profiles.put(updatedProfile)

      // 3. Notify parent app state
      if (onProfileUpdated) {
        onProfileUpdated(updatedProfile)
      }

      setIsEditingBio(false)
      showToast('Description updated successfully!')
    } catch (err: any) {
      console.error('Failed to update description:', err)
      showToast(err?.message || 'Failed to update description')
    } finally {
      setIsSavingBio(false)
    }
  }

  // Handle Passcode Update
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinChangeMsg('')

    if (newPin.length < 4 || newPin.length > 6 || !/^\d{4,6}$/.test(newPin)) {
      setPinChangeMsg('Passcode must be 4 to 6 digits.')
      vibrateDevice([100, 50, 100])
      return
    }

    if (newPin !== confirmNewPin) {
      setPinChangeMsg('Passcode confirmation does not match.')
      vibrateDevice([100, 50, 100])
      return
    }

    try {
      const hashed = await sha256(newPin)
      localStorage.setItem('jud_user_pin_hash', hashed)

      // Sync updated passcode with Supabase
      await api.upsertProfile({
        ...currentProfile,
        pin_hash: hashed,
      })

      setPinChangeMsg('Master Passcode updated & synced successfully!')
      setNewPin('')
      setConfirmNewPin('')
      setTimeout(() => {
        setIsChangingPin(false)
        setPinChangeMsg('')
      }, 1500)
    } catch (err: any) {
      setPinChangeMsg(err?.message || 'Failed to update passcode')
    }
  }

  return (
    <div className="flex-1 flex flex-col px-4 py-4 space-y-4 overflow-y-auto select-none relative">
      {/* Toast Feedback Notification */}
      {toastMessage && (
        <div className="fixed top-4 inset-x-4 max-w-sm mx-auto z-50 bg-emerald-950 border border-emerald-500/50 text-emerald-300 px-4 py-2.5 rounded-2xl shadow-2xl flex items-center space-x-2 text-xs font-semibold animate-bounce">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
          <User className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-base font-bold text-white leading-none">Your Campus Identity</h1>
          <p className="text-[10px] text-slate-400">Security & Profile Settings</p>
        </div>
      </div>

      {/* Main Profile Info Card: Centered Square Photo + Details Below */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-xl text-center">
        {/* Profile photo in a square with rounded edges, centered and MUTABLE */}
        <div className="flex flex-col items-center justify-center pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <div
            className="relative group cursor-pointer"
            onClick={() => !isUploadingPhoto && fileInputRef.current?.click()}
            title="Tap to change profile picture"
          >
            <img
              src={currentProfile.photo_urls?.[0] || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
              alt={currentProfile.full_name}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-rose-500/40 bg-slate-800 shadow-lg mx-auto transition-transform active:scale-95"
            />
            {isUploadingPhoto ? (
              <div className="absolute inset-0 bg-black/60 rounded-2xl flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-rose-400 animate-spin" />
              </div>
            ) : (
              <button
                type="button"
                className="absolute -bottom-1 -right-1 bg-rose-600 hover:bg-rose-500 text-white p-1.5 rounded-xl shadow-lg border-2 border-slate-900 transition-all flex items-center justify-center"
                title="Change Photo"
                onClick={(e) => {
                  e.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-[11px] text-rose-400/90 hover:text-rose-300 font-medium flex items-center space-x-1 mt-2 transition-colors cursor-pointer"
          >
            <Camera className="w-3 h-3" />
            <span>Change Profile Photo</span>
          </button>
        </div>

        {/* Below the image: Name, Age (auto-increments each passing year), and Instagram ID */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-center space-x-2">
            <h2 className="text-xl font-bold text-white tracking-tight">{currentProfile.full_name}</h2>
            <span className="text-xs font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
              {dynamicAge} yrs
            </span>
          </div>

          <div>
            <a
              href={`https://instagram.com/${currentProfile.insta_handle.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 text-xs text-rose-400 font-medium hover:underline bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20 transition-all hover:bg-rose-500/20"
            >
              <InstagramIcon className="w-3.5 h-3.5 text-rose-400" />
              <span>{currentProfile.insta_handle.startsWith('@') ? currentProfile.insta_handle : `@${currentProfile.insta_handle}`}</span>
            </a>
          </div>

          <div className="flex items-center justify-center space-x-1 text-[11px] text-emerald-400 font-medium pt-0.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Student Profile</span>
          </div>
        </div>

        {/* Department and Grad Year */}
        {(currentProfile.department || currentProfile.grad_year) && (
          <div className="flex flex-wrap justify-center gap-2 text-xs pt-1">
            {currentProfile.department && (
              <div className="flex items-center space-x-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-slate-300">
                <Building2 className="w-3.5 h-3.5 text-sky-400" />
                <span className="truncate max-w-[200px]">{currentProfile.department}</span>
              </div>
            )}
            {currentProfile.grad_year && (
              <div className="flex items-center space-x-1.5 bg-slate-950/80 px-2.5 py-1 rounded-xl border border-slate-800 text-slate-300">
                <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                <span>Class of {currentProfile.grad_year}</span>
              </div>
            )}
          </div>
        )}

        {/* Mutable Bio / Description */}
        <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800/80 text-left">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center space-x-1">
              <span>About Me / Description</span>
            </span>
            {!isEditingBio && (
              <button
                type="button"
                onClick={() => {
                  setBioInput(currentProfile.bio || '')
                  setIsEditingBio(true)
                }}
                className="inline-flex items-center space-x-1 text-xs text-rose-400 hover:text-rose-300 font-semibold px-2 py-0.5 rounded-md hover:bg-rose-500/10 transition-all"
              >
                <Pencil className="w-3 h-3" />
                <span>Edit</span>
              </button>
            )}
          </div>

          {!isEditingBio ? (
            <p className="text-xs text-slate-300 leading-relaxed italic text-center sm:text-left">
              “{currentProfile.bio || 'Campus member with verified credentials. Tap Edit to personalize your description!'}”
            </p>
          ) : (
            <form onSubmit={handleSaveBio} className="space-y-2 mt-2">
              <textarea
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value)}
                maxLength={400}
                rows={3}
                placeholder="Write your campus bio, interests, vibe..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 resize-none leading-relaxed"
                autoFocus
              />
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{bioInput.length}/400 characters</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingBio(false)}
                    className="px-2.5 py-1 text-slate-400 hover:text-slate-200 text-xs font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBio}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all flex items-center space-x-1 shadow-md shadow-rose-600/20"
                  >
                    {isSavingBio ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>{isSavingBio ? 'Saving...' : 'Save Description'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Public Transparency Reputation */}
        <div className="space-y-2 text-left">
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

        {/* University Library Card ID */}
        <div className="space-y-1 text-left">
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
            University Library Card ID
          </span>
          <p className="text-xs font-mono text-slate-300 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 tracking-wider">
            {currentProfile.library_card_hash || 'SL-4762'}
          </p>
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-1.5">
          <Lock className="w-3.5 h-3.5 text-rose-400" />
          <span>Device Security</span>
        </h3>

        {/* Change Master Passcode */}
        <button
          type="button"
          onClick={() => setIsChangingPin(!isChangingPin)}
          className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-between text-slate-300 hover:text-white transition-all"
        >
          <div className="flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-rose-400" />
            <span>Change 4 to 6 Digit Master Passcode</span>
          </div>
          <span className="text-[10px] text-slate-500">Edit</span>
        </button>

        {isChangingPin && (
          <form onSubmit={handleChangePin} className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-2 mt-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="password"
                maxLength={6}
                required
                placeholder="New Passcode (4-6 digits)"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-center font-mono text-xs text-white focus:outline-none focus:border-rose-500"
              />
              <input
                type="password"
                maxLength={6}
                required
                placeholder="Confirm Passcode"
                value={confirmNewPin}
                onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-center font-mono text-xs text-white focus:outline-none focus:border-rose-500"
              />
            </div>
            {pinChangeMsg && (
              <p className="text-[10px] text-rose-400 font-medium">{pinChangeMsg}</p>
            )}
            <button
              type="submit"
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl transition-all"
            >
              Save New Passcode
            </button>
          </form>
        )}

        {/* Terms of Service & Campus Liability Disclaimer */}
        <button
          type="button"
          onClick={() => setIsTermsOpen(true)}
          className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-between text-slate-300 hover:text-white transition-all"
        >
          <div className="flex items-center space-x-2">
            <ScrollText className="w-4 h-4 text-amber-400" />
            <span>Terms of Service & Liability Disclaimer</span>
          </div>
          <span className="text-[10px] text-slate-500">View</span>
        </button>
      </div>

      {/* App Updates Section (Zero-Cost OTA) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-1.5">
            <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            <span>App Updates (Zero-Cost OTA)</span>
          </h3>
          <span className="text-[10px] font-mono bg-rose-500/10 border border-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">
            v{CURRENT_APP_VERSION}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 text-left leading-relaxed">
          Get seamless bug fixes and features directly from the open-source CDN without manual APK reinstalls.
        </p>

        {updateInfo?.available ? (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-2xl space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-200">
                New Version v{updateInfo.latestVersion} Available!
              </span>
              <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.5 rounded font-bold">NEW</span>
            </div>
            {updateInfo.releaseNotes && (
              <p className="text-[11px] text-rose-300/80 leading-snug">{updateInfo.releaseNotes}</p>
            )}
            {updateInfo.isNative ? (
              <a
                href={updateInfo.directApkUrl || 'https://github.com/labubu-karapathy/JUD/releases'}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all block text-center"
              >
                <Download className="w-3.5 h-3.5 inline mr-1" />
                <span>Download APK Upgrade</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center space-x-1.5 transition-all"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Installing & Restarting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Apply Instant OTA Update</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : updateInfo && !updateInfo.available ? (
          <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded-xl flex items-center space-x-2 text-emerald-300 text-xs">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>You are on the latest version (v{CURRENT_APP_VERSION}).</span>
          </div>
        ) : null}

        <button
          type="button"
          onClick={handleCheckForUpdates}
          disabled={isCheckingUpdate}
          className="w-full py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-center space-x-2 text-slate-300 hover:text-white transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-rose-400 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
          <span>{isCheckingUpdate ? 'Checking GitHub CDN...' : 'Check for Updates'}</span>
        </button>
      </div>

      {/* Local Chat Storage & Backup Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-slate-400 font-semibold flex items-center space-x-1.5">
            <HardDrive className="w-3.5 h-3.5 text-rose-400" />
            <span>Local Chat Storage & Backup</span>
          </h3>
          <span className="text-[10px] font-mono bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
            Zero-Knowledge
          </span>
        </div>
        <p className="text-[11px] text-slate-400 text-left leading-relaxed">
          Chats are saved only on your device. When uninstalling the app or switching devices, export a backup to keep your conversations safe.
        </p>

        {/* Hidden File Input for Restore */}
        <input
          ref={backupFileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportBackup}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={handleExportBackup}
            disabled={isExportingBackup}
            className="py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-center space-x-1.5 text-slate-300 hover:text-white transition-all disabled:opacity-50"
          >
            {isExportingBackup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
            ) : (
              <Download className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>Export Backup</span>
          </button>

          <button
            type="button"
            onClick={() => backupFileInputRef.current?.click()}
            disabled={isImportingBackup}
            className="py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-medium rounded-xl flex items-center justify-center space-x-1.5 text-slate-300 hover:text-white transition-all disabled:opacity-50"
          >
            {isImportingBackup ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-rose-400" />
            )}
            <span>Restore Backup</span>
          </button>
        </div>
      </div>

      {/* Logout / Switch Account */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full py-3 bg-rose-950/40 hover:bg-rose-950/70 border border-rose-900/60 text-rose-300 font-semibold text-xs rounded-2xl flex items-center justify-center space-x-2 transition-all mt-auto"
      >
        <LogOut className="w-4 h-4" />
        <span>Log Out of Jadavpur Love Birds</span>
      </button>

      {/* Terms of Service & Campus Liability Disclaimer Modal */}
      <TermsAndConditionsModal
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />
    </div>
  )
}

export default ProfileView
