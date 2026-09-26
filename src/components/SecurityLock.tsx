import React, { useState, useEffect } from 'react'
import { LockScreen } from './LockScreen'

interface SecurityLockProps {
  children?: React.ReactNode
  userFullName?: string
  isLockedManual?: boolean
  onManualUnlock?: () => void
}

export const SecurityLock: React.FC<SecurityLockProps> = ({
  children,
  userFullName = 'Member',
  isLockedManual = false,
  onManualUnlock,
}) => {
  const [isLocked, setIsLocked] = useState<boolean>(false)

  // Listen for visibilitychange and window blur to instantly trigger lock on backgrounding
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsLocked(true)
      }
    }

    const handleWindowBlur = () => {
      // Trigger instant lock when user tabs out or shifts away
      setIsLocked(true)
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [])

  // Sync with external manual lock toggle if passed
  useEffect(() => {
    if (isLockedManual) {
      setIsLocked(true)
    }
  }, [isLockedManual])

  const handleUnlock = () => {
    setIsLocked(false)
    if (onManualUnlock) {
      onManualUnlock()
    }
  }

  return (
    <>
      {children}
      <LockScreen
        isLocked={isLocked || isLockedManual}
        onUnlock={handleUnlock}
        userFullName={userFullName}
      />
    </>
  )
}

export default SecurityLock
