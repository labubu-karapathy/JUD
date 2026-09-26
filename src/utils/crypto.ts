/**
 * Client-side cryptographic and biometric authentication helpers
 */

export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function vibrateDevice(pattern: number[] = [100, 50, 100]): void {
  if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch (e) {
      console.warn('Vibration failed or not permitted', e)
    }
  }
}

export async function isBiometricsAvailable(): Promise<boolean> {
  if (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  ) {
    try {
      return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    } catch {
      return false
    }
  }
  return false
}

export async function authenticateWithBiometrics(challengeText: string = 'jud-auth-challenge'): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false
  }

  try {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    // Using navigator.credentials.get for biometrics / passkey
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        timeout: 60000,
        userVerification: 'required',
        rpId: window.location.hostname,
      },
    })

    return Boolean(assertion)
  } catch (err: any) {
    console.warn('Biometric authentication failed or was cancelled', err)
    return false
  }
}

export async function registerBiometrics(userId: string, userName: string): Promise<boolean> {
  if (!window.PublicKeyCredential) {
    return false
  }

  try {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    const credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: 'JUD Dating App',
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: userName,
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
        },
        timeout: 60000,
      },
    })

    return Boolean(credential)
  } catch (err) {
    console.warn('Biometric registration error or not supported on this device/domain:', err)
    return false
  }
}
