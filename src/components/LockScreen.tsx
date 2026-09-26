import React, { useState, useEffect, useCallback } from 'react'
import { Fingerprint, Delete, ShieldAlert, Lock, ShieldCheck } from 'lucide-react'
import { sha256, vibrateDevice, authenticateWithBiometrics, isBiometricsAvailable } from '../utils/crypto'

interface LockScreenProps {
  isLocked: boolean
  onUnlock: () => void
  userFullName?: string
}

const PIN_STORAGE_KEY = 'jud_user_pin_hash'

export const LockScreen: React.FC<LockScreenProps> = ({
  isLocked,
  onUnlock,
  userFullName = 'Member',
}) => {
  const [pin, setPin] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [isShaking, setIsShaking] = useState<boolean>(false)
  const [hasBiometrics, setHasBiometrics] = useState<boolean>(false)
  const [isAuthenticatingBio, setIsAuthenticatingBio] = useState<boolean>(false)

  // Check if biometric authentication is available on device
  useEffect(() => {
    isBiometricsAvailable().then((avail) => setHasBiometrics(avail))
  }, [])

  // Auto-attempt biometric check when screen locks
  useEffect(() => {
    if (isLocked) {
      setPin('')
      setErrorMsg('')
    }
  }, [isLocked])

  const triggerFailure = useCallback((msg: string) => {
    vibrateDevice([100, 50, 100])
    setErrorMsg(msg)
    setIsShaking(true)
    setPin('')
    setTimeout(() => setIsShaking(false), 500)
  }, [])

  const verifyPin = useCallback(async (enteredPin: string) => {
    try {
      const storedHash = localStorage.getItem(PIN_STORAGE_KEY)
      const enteredHash = await sha256(enteredPin)

      // If no PIN has been set yet, treat 0000 or the newly entered PIN as valid setup
      if (!storedHash) {
        localStorage.setItem(PIN_STORAGE_KEY, enteredHash)
        onUnlock()
        return
      }

      if (enteredHash === storedHash) {
        setPin('')
        setErrorMsg('')
        onUnlock()
      } else {
        triggerFailure('Incorrect PIN. Try again.')
      }
    } catch {
      triggerFailure('Authentication error.')
    }
  }, [onUnlock, triggerFailure])

  const handleDigitPress = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit
      setPin(newPin)
      setErrorMsg('')

      if (newPin.length === 4) {
        verifyPin(newPin)
      }
    }
  }

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1))
    setErrorMsg('')
  }

  const handleBiometricAuth = async () => {
    setIsAuthenticatingBio(true)
    setErrorMsg('')
    try {
      const success = await authenticateWithBiometrics()
      if (success) {
        onUnlock()
      } else {
        triggerFailure('Biometrics not recognized')
      }
    } catch {
      triggerFailure('Biometric check failed')
    } finally {
      setIsAuthenticatingBio(false)
    }
  }

  if (!isLocked) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-slate-950/98 backdrop-blur-xl px-6 py-10 text-white max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex flex-col items-center mt-6 space-y-3">
        <div className="relative">
          <img
            src="/icon.png"
            alt="Jadavpur Love Birds"
            className="w-18 h-18 rounded-3xl object-cover shadow-2xl shadow-indigo-500/30 border border-slate-800"
          />
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-900 border-2 border-slate-950 flex items-center justify-center text-rose-500 shadow-md">
            <Lock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight">Jadavpur Love Birds Locked</h2>
          <p className="text-sm text-slate-400 mt-1">
            Welcome back, <span className="text-rose-400 font-medium">{userFullName}</span>
          </p>
        </div>
      </div>

      {/* PIN Dots & Status */}
      <div className={`flex flex-col items-center space-y-4 my-auto ${isShaking ? 'animate-bounce text-red-400' : ''}`}>
        <div className="flex items-center space-x-5">
          {[0, 1, 2, 3].map((index) => {
            const isFilled = pin.length > index
            return (
              <div
                key={index}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  isFilled
                    ? 'bg-rose-500 scale-125 shadow-md shadow-rose-500/50'
                    : 'bg-slate-800 border border-slate-700'
                }`}
              />
            )
          })}
        </div>

        {errorMsg ? (
          <div className="flex items-center space-x-1.5 text-xs text-rose-400 font-medium bg-rose-950/50 px-3 py-1.5 rounded-full border border-rose-800/40">
            <ShieldAlert className="w-4 h-4" />
            <span>{errorMsg}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Enter 4-digit PIN or use Biometrics</p>
        )}
      </div>

      {/* Keypad */}
      <div className="w-full max-w-xs grid grid-cols-3 gap-4 mb-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handleDigitPress(num.toString())}
            className="w-18 h-18 rounded-full bg-slate-900/80 border border-slate-800 text-xl font-semibold flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all text-white hover:border-slate-700 shadow-sm"
          >
            {num}
          </button>
        ))}

        {/* Biometrics button */}
        <button
          type="button"
          onClick={handleBiometricAuth}
          disabled={isAuthenticatingBio}
          className="w-18 h-18 rounded-full bg-slate-900/80 border border-slate-800 flex flex-col items-center justify-center hover:bg-slate-800 active:scale-95 transition-all text-rose-400 hover:border-rose-500/40"
          title="Authenticate with Fingerprint / FaceID"
        >
          <Fingerprint className={`w-6 h-6 ${isAuthenticatingBio ? 'animate-spin' : ''}`} />
          <span className="text-[9px] mt-0.5 text-slate-400 font-mono">BIO</span>
        </button>

        {/* 0 */}
        <button
          type="button"
          onClick={() => handleDigitPress('0')}
          className="w-18 h-18 rounded-full bg-slate-900/80 border border-slate-800 text-xl font-semibold flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all text-white hover:border-slate-700 shadow-sm"
        >
          0
        </button>

        {/* Delete */}
        <button
          type="button"
          onClick={handleDelete}
          className="w-18 h-18 rounded-full bg-slate-900/80 border border-slate-800 flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all text-slate-400 hover:text-white hover:border-slate-700"
          title="Delete digit"
        >
          <Delete className="w-6 h-6" />
        </button>
      </div>

      {/* Privacy disclaimer */}
      <div className="flex items-center space-x-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
        <span>End-to-End P2P • Zero Cloud Message Storage</span>
      </div>
    </div>
  )
}

export default LockScreen
