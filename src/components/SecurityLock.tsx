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

  // Lock only when explicit manual lock is triggered (e.g. from bottom nav or settings)
  // or when explicit lock flag is set, not on every single window minimize/blur
  useEffect(() => {
    // If the user wants to lock manually via the Lock button
    if (isLockedManual) {
      setIsLocked(true)
    }
  }, [isLockedManual])

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
