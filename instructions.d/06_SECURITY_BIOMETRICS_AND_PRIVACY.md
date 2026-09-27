# 06 - Security, Biometrics & Privacy Architecture

Files: `src/utils/crypto.ts`, `src/components/SecurityLock.tsx`, `src/components/LockScreen.tsx`, `src/pages/Auth.tsx`

## 1. Zero-Knowledge Library Card Barcode Hashing
During Onboarding Step 1 (`Auth.tsx`):
- Device camera or image upload scans the student's physical card barcode via `@zxing/library`.
- The raw barcode string is IMMEDIATELY hashed client-side:
  ```typescript
  export async function sha256(message: string): Promise<string> {
    const msgUint8 = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  ```
- **Privacy Guarantee**: The raw student ID number NEVER leaves the user's browser. Only the 64-character SHA-256 hex signature is stored in `public.profiles.library_card_hash` for uniqueness validation.

---

## 2. Master PIN & WebAuthn Biometrics
- **Fallback PIN**: User sets a 4-digit PIN. Hashed with client-side SHA-256 and stored in `localStorage.getItem('jud_user_pin_hash')`. Plaintext PIN is never stored.
- **Biometric Unlock**: Integrated with W3C WebAuthn standard (`navigator.credentials.get` / `navigator.credentials.create`) with `userVerification: 'required'`. Supports Windows Hello, FaceID, TouchID, and Android Biometric Prompt.
- **Haptic Failure Alert**: Incorrect PIN or failed biometrics triggers `navigator.vibrate([100, 50, 100])`.

---

## 3. Instant Background Auto-Lock
File: `src/components/SecurityLock.tsx`

To guarantee campus privacy if a student sets their phone down or switches applications:
```typescript
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) setIsLocked(true);
  };
  const handleWindowBlur = () => {
    setIsLocked(true);
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleWindowBlur);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
  };
}, []);
```
Whenever the app loses focus or is backgrounded, `LockScreen` immediately renders over the entire UI, protecting all chats and profile views.
