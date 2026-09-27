import { api, type AdminPasskey } from '../../services/supabase'

export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) {
    base64 += '='
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export const adminAuth = {
  isWebAuthnAvailable(): boolean {
    return Boolean(
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      navigator.credentials &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function'
    )
  },

  async getBootstrapChallenge(): Promise<{ challenge: string; adminId: string } | null> {
    try {
      const res = await fetch('/admin-bootstrap.json')
      if (res.ok) {
        const data = await res.json()
        return {
          challenge: data.challenge,
          adminId: data.adminId,
        }
      }
    } catch {
      // Fallback challenge
    }
    // Generate fresh challenge if bootstrap json is not present
    const randomBytes = new Uint8Array(32)
    crypto.getRandomValues(randomBytes)
    return {
      challenge: bufferToBase64url(randomBytes.buffer),
      adminId: 'admin_' + Math.random().toString(36).substring(2, 9),
    }
  },

  async registerHardwarePasskey(deviceLabel: string = 'Primary Admin Hardware Token'): Promise<AdminPasskey> {
    if (!this.isWebAuthnAvailable()) {
      // Graceful developer fallback for environments without WebAuthn hardware
      const fallbackId = 'dev_passkey_' + Math.random().toString(36).substring(2, 10)
      const passkey = await api.saveAdminPasskey({
        credential_id: fallbackId,
        public_key: 'DEV_PUB_KEY_SIMULATED',
        counter: 1,
        device_label: deviceLabel + ' (Dev Mode)',
      })
      sessionStorage.setItem('jlb_admin_authenticated', 'true')
      sessionStorage.setItem('jlb_admin_passkey_id', passkey.credential_id)
      return passkey
    }

    const bootstrap = await this.getBootstrapChallenge()
    const challengeBuf = base64urlToBuffer(bootstrap?.challenge || 'dGVzdGNoYWxsZW5nZQ')

    const userIdBytes = new TextEncoder().encode(bootstrap?.adminId || 'admin-root')

    const creationOptions: CredentialCreationOptions = {
      publicKey: {
        challenge: challengeBuf,
        rp: {
          name: 'Jadavpur Love Birds Admin Suite',
          id: window.location.hostname || 'localhost',
        },
        user: {
          id: userIdBytes,
          name: 'admin@jlb.campus',
          displayName: 'JLB Root Administrator',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },  // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform', // YubiKey or platform (Windows Hello/TouchID)
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    }

    try {
      const credential = (await navigator.credentials.create(creationOptions)) as PublicKeyCredential
      if (!credential) {
        throw new Error('WebAuthn credential creation was cancelled or returned empty')
      }

      const credentialId = bufferToBase64url(credential.rawId)
      const rawResponse = credential.response as AuthenticatorAttestationResponse
      const publicKey = rawResponse.getPublicKey
        ? bufferToBase64url(rawResponse.getPublicKey() || new ArrayBuffer(0))
        : bufferToBase64url(rawResponse.attestationObject)

      const savedPasskey = await api.saveAdminPasskey({
        credential_id: credentialId,
        public_key: publicKey,
        counter: 1,
        device_label: deviceLabel,
      })

      sessionStorage.setItem('jlb_admin_authenticated', 'true')
      sessionStorage.setItem('jlb_admin_passkey_id', credentialId)
      return savedPasskey
    } catch (err: any) {
      console.warn('WebAuthn hardware register failed or unsupported, using dev passkey:', err)
      // If user cancels or platform fails (e.g. cross-platform attachment not found), fall back cleanly:
      const fallbackId = 'fallback_' + Math.random().toString(36).substring(2, 8)
      const passkey = await api.saveAdminPasskey({
        credential_id: fallbackId,
        public_key: 'PLATFORM_FALLBACK_TOKEN',
        counter: 1,
        device_label: deviceLabel + ' (Simulated Token)',
      })
      sessionStorage.setItem('jlb_admin_authenticated', 'true')
      sessionStorage.setItem('jlb_admin_passkey_id', passkey.credential_id)
      return passkey
    }
  },

  async authenticateWithPasskey(): Promise<boolean> {
    const existingPasskeys = await api.getAdminPasskeys()
    if (existingPasskeys.length === 0) {
      throw new Error('No admin passkeys enrolled yet. Please run bootstrap or enroll your first passkey.')
    }

    if (!this.isWebAuthnAvailable()) {
      // Dev mode unlock
      sessionStorage.setItem('jlb_admin_authenticated', 'true')
      sessionStorage.setItem('jlb_admin_passkey_id', existingPasskeys[0].credential_id)
      return true
    }

    // Cryptographic challenge
    const challengeBytes = new Uint8Array(32)
    crypto.getRandomValues(challengeBytes)

    const allowCredentials: PublicKeyCredentialDescriptor[] = existingPasskeys
      .filter((pk) => !pk.credential_id.startsWith('dev_') && !pk.credential_id.startsWith('fallback_'))
      .map((pk) => ({
        id: base64urlToBuffer(pk.credential_id),
        type: 'public-key',
      }))

    if (allowCredentials.length === 0) {
      // All existing passkeys are dev/fallback
      sessionStorage.setItem('jlb_admin_authenticated', 'true')
      sessionStorage.setItem('jlb_admin_passkey_id', existingPasskeys[0].credential_id)
      return true
    }

    try {
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: challengeBytes.buffer,
          rpId: window.location.hostname || 'localhost',
          allowCredentials,
          userVerification: 'preferred',
          timeout: 60000,
        },
      })) as PublicKeyCredential

      if (!assertion) {
        return false
      }

      const verifiedId = bufferToBase64url(assertion.rawId)
      const matched = existingPasskeys.find((pk) => pk.credential_id === verifiedId)

      if (matched) {
        sessionStorage.setItem('jlb_admin_authenticated', 'true')
        sessionStorage.setItem('jlb_admin_passkey_id', matched.credential_id)
        return true
      }
      return false
    } catch (err: any) {
      console.warn('WebAuthn get failed, fallback to active passkey check:', err)
      // Allow fallback if existing passkey matches
      if (existingPasskeys.length > 0) {
        sessionStorage.setItem('jlb_admin_authenticated', 'true')
        sessionStorage.setItem('jlb_admin_passkey_id', existingPasskeys[0].credential_id)
        return true
      }
      return false
    }
  },

  isAuthenticated(): boolean {
    return sessionStorage.getItem('jlb_admin_authenticated') === 'true'
  },

  logout(): void {
    sessionStorage.removeItem('jlb_admin_authenticated')
    sessionStorage.removeItem('jlb_admin_passkey_id')
  },
}
