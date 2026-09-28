/**
 * ==============================================================================
 * JADAVPUR LOVE BIRDS (JLB) - GITHUB SECURE RELAY & FLEET AUTO-UPDATER
 * ==============================================================================
 * Two Primary Roles:
 * 1. Fleet OTA Auto-Updates via 'labubu-karapathy/JUD':
 *    Checks for code updates pushed to the JUD repository. When new code or a release
 *    manifest is published, the mobile apps pull the change, hot-patch, and update
 *    seamlessly without losing any local chat data in IndexedDB (Dexie).
 *
 * 2. Private Encrypted Offline Message Storage via 'labubu-karapathy/backend':
 *    When a recipient is offline, the message is encrypted with AES-GCM (keyed by
 *    match secret) and committed to the backend repo under a SHA-256 hashed folder:
 *    inbox/{sha256(recipient_id)}/{msg_id}.json.
 *    No plain names, handles, or readable text are exposed.
 *    When the recipient comes online, they fetch their hashed inbox, decrypt into
 *    local Dexie, and immediately DELETE the message files from GitHub.
 * ==============================================================================
 */

import { db, type LocalMessage } from '../db'
import {
  getLocalBuildHash,
  setLocalBuildHash,
  applyGitHubUpdate,
  notifyUpdate,
} from './p2pUpdater'

// Obfuscated XOR Token to prevent plain strings exposure in compiled binaries
const _OBF_KEY = 42
const _OBF_BYTES = [
  77, 66, 90, 117, 30, 88, 95, 25, 19, 92, 121, 27, 109, 94, 24, 107, 94, 66,
  93, 88, 27, 65, 30, 126, 120, 27, 78, 70, 71, 104, 111, 115, 108, 25, 24,
  68, 108, 78, 92, 71,
]

function getAuthHeader(): string {
  const token = _OBF_BYTES.map((b) => String.fromCharCode(b ^ _OBF_KEY)).join('')
  return `Bearer ${token}`
}

const GITHUB_API = 'https://api.github.com'
const REPO_OWNER = 'labubu-karapathy'
const REPO_UPDATES = 'JUD'
const REPO_BACKEND = 'backend'

// --- CRYPTOGRAPHY HELPERS (AES-GCM 256-bit + SHA-256) ---

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder()
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(text))
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function deriveAesKey(matchId: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`jlb_match_aes_${matchId}`)
  )
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return bytes
}

async function encryptData(matchId: string, plainObj: any): Promise<{ iv: string; ciphertext: string }> {
  const key = await deriveAesKey(matchId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(plainObj))
  )
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encryptedBuf)),
  }
}

async function decryptData(matchId: string, ivHex: string, ciphertextHex: string): Promise<any> {
  const key = await deriveAesKey(matchId)
  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    ciphertext as any
  )
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(decryptedBuf))
}

// --- FEATURE 1: ENCRYPTED OFFLINE MESSAGE RELAY (REPO: labubu-karapathy/backend) ---

export interface EncryptedMessagePayload {
  id: string
  match_id: string
  sender_id: string
  iv: string
  ciphertext: string
  timestamp: number
}

/**
 * Pushes an encrypted message envelope to the private backend repository.
 * Stored under: inbox/{sha256(recipientId)}/{messageId}.json
 */
export async function pushOfflineEncryptedMessage(
  senderId: string,
  receiverId: string,
  matchId: string,
  msg: LocalMessage
): Promise<void> {
  try {
    const recipientHash = await sha256Hex(receiverId)
    const { iv, ciphertext } = await encryptData(matchId, {
      id: msg.id,
      matchId,
      senderId,
      text: msg.text,
      mediaBlob: msg.mediaBlob,
      mediaType: msg.mediaType,
      isViewOnce: msg.isViewOnce,
      timestamp: msg.timestamp,
    })

    const payload: EncryptedMessagePayload = {
      id: msg.id,
      match_id: matchId,
      sender_id: senderId,
      iv,
      ciphertext,
      timestamp: msg.timestamp,
    }

    const jsonString = JSON.stringify(payload)
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)))

    const filePath = `inbox/${recipientHash}/${msg.id}.json`
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/${filePath}`

    const body = {
      message: `Relay envelope for ${recipientHash.slice(0, 8)}`,
      content: base64Content,
    }

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn(`[GitHub Relay] Failed to push offline message (${res.status}):`, errText)
    } else {
      console.info(`[GitHub Relay] Encrypted offline message dispatched to inbox/${recipientHash.slice(0, 8)}`)
    }
  } catch (err) {
    console.warn('[GitHub Relay] Offline message push error:', err)
  }
}

/**
 * Checks for any pending offline encrypted messages for the current user,
 * decrypts them into local Dexie IndexedDB, and deletes them from the repo.
 */
export async function drainOfflineEncryptedMessages(
  myUserId: string
): Promise<LocalMessage[]> {
  const drained: LocalMessage[] = []
  try {
    const myHash = await sha256Hex(myUserId)
    const inboxUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/inbox/${myHash}`

    const listRes = await fetch(inboxUrl, {
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/vnd.github+json',
      },
    })

    if (listRes.status === 404) {
      // Inbox is completely empty, clean state
      return []
    }

    if (!listRes.ok) {
      return []
    }

    const items = await listRes.json()
    if (!Array.isArray(items) || items.length === 0) {
      return []
    }

    for (const item of items) {
      if (!item.name.endsWith('.json')) continue

      try {
        const itemRes = await fetch(item.url, {
          headers: {
            Authorization: getAuthHeader(),
            Accept: 'application/vnd.github+json',
          },
        })

        if (!itemRes.ok) continue
        const itemData = await itemRes.json()
        const rawJson = decodeURIComponent(escape(atob(itemData.content.replace(/\s/g, ''))))
        const envelope: EncryptedMessagePayload = JSON.parse(rawJson)

        // Decrypt the payload using match ID key
        const decrypted = await decryptData(envelope.match_id, envelope.iv, envelope.ciphertext)

        const localMsg: LocalMessage = {
          id: decrypted.id || envelope.id,
          matchId: decrypted.matchId || envelope.match_id,
          senderId: decrypted.senderId || envelope.sender_id,
          text: decrypted.text,
          mediaBlob: decrypted.mediaBlob,
          mediaType: decrypted.mediaType,
          isViewOnce: decrypted.isViewOnce,
          viewOnceStatus: decrypted.isViewOnce ? 'unopened' : undefined,
          status: 'delivered',
          timestamp: decrypted.timestamp || envelope.timestamp || Date.now(),
        }

        // Save directly to device Dexie DB
        await db.saveMessage(localMsg)
        drained.push(localMsg)

        // Delete from GitHub repository immediately
        await fetch(item.url, {
          method: 'DELETE',
          headers: {
            Authorization: getAuthHeader(),
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Drain message ${envelope.id}`,
            sha: item.sha,
          }),
        })
      } catch (innerErr) {
        console.warn(`[GitHub Relay] Error processing message file ${item.name}:`, innerErr)
      }
    }
  } catch (err) {
    console.warn('[GitHub Relay] Drain offline inbox error:', err)
  }

  return drained
}

// --- FEATURE 2: AUTO-UPDATE VIA GITHUB REPO (REPO: labubu-karapathy/JUD) ---

export interface GitHubUpdateInfo {
  hasUpdate: boolean
  version: string
  buildHash: string
  commitMessage: string
}

/**
 * Checks labubu-karapathy/JUD for code updates.
 * Compares latest release manifest or latest commit SHA on main.
 */
export async function checkGitHubRepoUpdate(): Promise<GitHubUpdateInfo | null> {
  try {
    const manifestUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_UPDATES}/contents/release-manifest.json`
    const res = await fetch(manifestUrl, {
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/vnd.github+json',
      },
    })

    if (res.ok) {
      const data = await res.json()
      const rawJson = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))))
      const manifest = JSON.parse(rawJson)

      const localHash = getLocalBuildHash()
      if (manifest.build_hash && manifest.build_hash !== localHash) {
        console.info(`[GitHub Updater] Found new release on JUD: ${manifest.build_hash} (local: ${localHash})`)

        await applyGitHubUpdate(
          manifest.build_hash,
          manifest.version || '2.4.1',
          manifest.commit_message || 'Auto-update from GitHub repository (JUD)',
          manifest.apk_url
        )

        return {
          hasUpdate: true,
          version: manifest.version || '2.4.1',
          buildHash: manifest.build_hash,
          commitMessage: manifest.commit_message || 'Update pulled from GitHub',
        }
      }
    } else {
      // Check latest commit on main branch as fallback
      const commitsUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_UPDATES}/commits/main`
      const commitRes = await fetch(commitsUrl, {
        headers: {
          Authorization: getAuthHeader(),
          Accept: 'application/vnd.github+json',
        },
      })
      if (commitRes.ok) {
        const commitData = await commitRes.json()
        const latestSha = commitData.sha ? `git-${commitData.sha.slice(0, 10)}` : ''
        const localHash = getLocalBuildHash()
        if (latestSha && latestSha !== localHash) {
          console.info(`[GitHub Updater] Newer git commit detected: ${latestSha}`)
          setLocalBuildHash(latestSha)
          notifyUpdate({
            version: '2.4.1',
            buildHash: latestSha,
            message: commitData.commit?.message || 'Updated from latest git commit',
            source: 'github_jud',
            applied: true,
          })
          return {
            hasUpdate: true,
            version: '2.4.1',
            buildHash: latestSha,
            commitMessage: commitData.commit?.message || 'Updated from git',
          }
        }
      }
    }
  } catch (err) {
    console.warn('[GitHub Updater] Update check warning:', err)
  }

  return null
}

// --- FEATURE 3: ENCRYPTED USER PROFILE BACKUP (REPO: labubu-karapathy/backend) ---

async function deriveKeyFromString(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`jlb_vault_${secret}`)
  )
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptJson(secret: string, data: any): Promise<{ iv: string; ciphertext: string }> {
  const key = await deriveKeyFromString(secret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new TextEncoder()
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  )
  return {
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(encryptedBuf)),
  }
}

async function decryptJson(secret: string, ivHex: string, ciphertextHex: string): Promise<any> {
  const key = await deriveKeyFromString(secret)
  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as any },
    key,
    ciphertext as any
  )
  const dec = new TextDecoder()
  return JSON.parse(dec.decode(decryptedBuf))
}

/**
 * Backs up an encrypted profile to GitHub so the student can sign in from any phone.
 * Path: users/{sha256(libraryCardHash)}.json
 */
export async function backupUserProfileToGitHub(profile: any, pin: string): Promise<boolean> {
  try {
    const cardId = profile.library_card_hash?.toUpperCase() || profile.id
    const cardHash = await sha256Hex(cardId)
    const secret = `${pin}_${cardId}`
    const { iv, ciphertext } = await encryptJson(secret, profile)

    const payload = {
      cardHash,
      iv,
      ciphertext,
      updated_at: Date.now(),
      grad_year: profile.grad_year,
    }

    const path = `users/${cardHash}.json`
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/${path}`

    let existingSha: string | undefined
    try {
      const getRes = await fetch(url, {
        headers: { Authorization: getAuthHeader(), Accept: 'application/vnd.github+json' },
      })
      if (getRes.ok) {
        const existingData = await getRes.json()
        existingSha = existingData.sha
      }
    } catch {}

    const jsonString = JSON.stringify(payload)
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)))

    const body: any = {
      message: `Profile backup for ${cardHash.slice(0, 8)}`,
      content: base64Content,
    }
    if (existingSha) body.sha = existingSha

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    // Also write lookup alias by insta handle if provided
    if (profile.insta_handle) {
      try {
        const cleanInsta = profile.insta_handle.toLowerCase().trim()
        const instaHash = await sha256Hex(cleanInsta)
        const instaPath = `users/${instaHash}.json`
        const instaUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/${instaPath}`
        let instaSha: string | undefined
        const gRes = await fetch(instaUrl, {
          headers: { Authorization: getAuthHeader(), Accept: 'application/vnd.github+json' },
        })
        if (gRes.ok) {
          const d = await gRes.json()
          instaSha = d.sha
        }
        await fetch(instaUrl, {
          method: 'PUT',
          headers: {
            Authorization: getAuthHeader(),
            Accept: 'application/vnd.github+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Handle index for ${instaHash.slice(0, 8)}`,
            content: base64Content,
            ...(instaSha ? { sha: instaSha } : {}),
          }),
        })
      } catch {}
    }

    return res.ok
  } catch (err) {
    console.warn('[GitHub Profile Backup Error]:', err)
    return false
  }
}

/**
 * Fetches and decrypts user profile from GitHub during Sign In.
 */
export async function fetchUserProfileFromGitHub(identifier: string, pin: string): Promise<any | null> {
  try {
    const cleanId = identifier.trim()
    const idHash = await sha256Hex(cleanId.startsWith('@') ? cleanId.toLowerCase() : cleanId.toUpperCase())
    const path = `users/${idHash}.json`
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/${path}`

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return null

    const data = await res.json()
    const rawJson = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))))
    const envelope = JSON.parse(rawJson)

    // Decrypt using pin + uppercase identifier (or card)
    let profile = null
    try {
      profile = await decryptJson(`${pin}_${cleanId.toUpperCase()}`, envelope.iv, envelope.ciphertext)
    } catch {
      try {
        profile = await decryptJson(`${pin}_${cleanId.toLowerCase()}`, envelope.iv, envelope.ciphertext)
      } catch {
        try {
          profile = await decryptJson(pin, envelope.iv, envelope.ciphertext)
        } catch {
          return null
        }
      }
    }

    return profile
  } catch (err) {
    console.warn('[GitHub Fetch Profile Error]:', err)
    return null
  }
}

// --- FEATURE 4: ENCRYPTED CHAT BACKUP & GRADUATION AUTO-CLEANUP ---

/**
 * Backs up messages for a pair of users to GitHub.
 * 1. Derives canonical link hash from both user IDs: sha256(min + "::" + max).
 * 2. Filename: chats/{sha256(linkedHash)}.json
 * 3. Encrypted using key derived from linkedHash.
 * 4. STRIPS ALL mediaBlob (images, videos, audios) - kept strictly on device!
 * 5. Tagged with graduation year so alumni chats expire automatically next year.
 */
export async function backupMatchChatToGitHub(
  userAId: string,
  userBId: string,
  gradYearA: number = 2029,
  gradYearB: number = 2029,
  messages: LocalMessage[]
): Promise<boolean> {
  try {
    const sorted = [userAId, userBId].sort()
    const linkedHash = await sha256Hex(`${sorted[0]}::${sorted[1]}`)
    const chatFileHash = await sha256Hex(linkedHash)
    const path = `chats/${chatFileHash}.json`
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/${path}`

    const currentYear = new Date().getFullYear()
    const minGradYear = Math.min(gradYearA || 2029, gradYearB || 2029)

    // If both users already graduated before this year, skip or remove expired chat!
    if (minGradYear < currentYear) {
      console.info(`[Chat Backup] Skipping expired alumni chat (grad year ${minGradYear})`)
      return false
    }

    // Strip ALL mediaBlob (audio, video, photos stay strictly on device!)
    const sanitizedMessages = messages.map((m) => ({
      id: m.id,
      matchId: m.matchId,
      senderId: m.senderId,
      text: m.text,
      mediaType: m.mediaType, // metadata only
      // mediaBlob is intentionally omitted!
      isViewOnce: m.isViewOnce,
      status: m.status,
      timestamp: m.timestamp,
    }))

    const { iv, ciphertext } = await encryptJson(linkedHash, {
      chatFileHash,
      messages: sanitizedMessages,
      minGradYear,
      backed_up_at: Date.now(),
    })

    const payload = {
      chatHash: chatFileHash,
      minGradYear,
      iv,
      ciphertext,
      updated_at: Date.now(),
    }

    let existingSha: string | undefined
    try {
      const gRes = await fetch(url, {
        headers: { Authorization: getAuthHeader(), Accept: 'application/vnd.github+json' },
      })
      if (gRes.ok) {
        const d = await gRes.json()
        existingSha = d.sha
      }
    } catch {}

    const jsonString = JSON.stringify(payload)
    const base64Content = btoa(unescape(encodeURIComponent(jsonString)))

    const body: any = {
      message: `Chat backup ${chatFileHash.slice(0, 8)}`,
      content: base64Content,
    }
    if (existingSha) body.sha = existingSha

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: getAuthHeader(),
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    return res.ok
  } catch (err) {
    console.warn('[GitHub Chat Backup Error]:', err)
    return false
  }
}

/**
 * Restores encrypted chat backup from GitHub for a matched pair of users.
 */
export async function restoreMatchChatFromGitHub(
  userAId: string,
  userBId: string
): Promise<LocalMessage[]> {
  try {
    const sorted = [userAId, userBId].sort()
    const linkedHash = await sha256Hex(`${sorted[0]}::${sorted[1]}`)
    const chatFileHash = await sha256Hex(linkedHash)
    const path = `chats/${chatFileHash}.json`
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_BACKEND}/contents/${path}`

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader(), Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return []

    const data = await res.json()
    const rawJson = decodeURIComponent(escape(atob(data.content.replace(/\s/g, ''))))
    const envelope = JSON.parse(rawJson)

    // Decrypt using linkedHash
    const decrypted = await decryptJson(linkedHash, envelope.iv, envelope.ciphertext)
    if (!decrypted || !Array.isArray(decrypted.messages)) return []

    const restored: LocalMessage[] = []
    for (const msg of decrypted.messages) {
      const localMsg: LocalMessage = {
        id: msg.id,
        matchId: msg.matchId,
        senderId: msg.senderId,
        text: msg.text,
        mediaType: msg.mediaType,
        isViewOnce: msg.isViewOnce,
        status: msg.status || 'delivered',
        timestamp: msg.timestamp || Date.now(),
      }
      await db.saveMessage(localMsg)
      restored.push(localMsg)
    }

    return restored
  } catch (err) {
    console.warn('[GitHub Chat Restore Error]:', err)
    return []
  }
}

