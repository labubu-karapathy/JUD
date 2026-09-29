import Dexie, { type Table } from 'dexie'

export interface CachedProfile {
  id: string
  full_name: string
  gender: 'male' | 'female' | 'other'
  target_gender?: 'male' | 'female' | 'all'
  age: number
  bio: string
  insta_handle: string
  library_card_hash?: string
  photo_urls: string[]
  is_verified?: boolean
  report_count: number
  block_count: number
  department?: string
  grad_year?: number
  is_approved?: boolean
  approval_comment?: string
  is_deactivated?: boolean
  deactivation_reason?: string
  active_chat_count?: number
  updated_at: string
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read'

export interface LocalMessage {
  id: string
  matchId: string
  senderId: string
  text?: string
  mediaBlob?: string // Base64 encoded or object URL data
  mediaType?: string // e.g. 'image/jpeg', 'image/png'
  status: MessageStatus
  timestamp: number
  isDeleted?: boolean
  isViewOnce?: boolean
  viewOnceStatus?: 'unopened' | 'opened'
}

export interface CachedMatchEntry {
  id: string
  userId: string
  partnerId: string
  data: any
  updatedAt: number
}

export class AppLocalDatabase extends Dexie {
  cached_profiles!: Table<CachedProfile, string>
  local_messages!: Table<LocalMessage, string>
  cached_matches!: Table<CachedMatchEntry, string>

  constructor() {
    super('JUDAppLocalDB')
    
    this.version(1).stores({
      cached_profiles: 'id, full_name, gender, age, insta_handle, report_count, block_count, updated_at',
      local_messages: 'id, matchId, senderId, status, timestamp, [matchId+timestamp]'
    })

    this.version(2).stores({
      cached_matches: 'id, userId, partnerId, updatedAt'
    })
  }

  // --- Profile Cache Methods ---
  async getCachedProfile(id: string): Promise<CachedProfile | undefined> {
    return this.cached_profiles.get(id)
  }

  async getAllCachedProfiles(): Promise<CachedProfile[]> {
    return this.cached_profiles.toArray()
  }

  async upsertCachedProfiles(profiles: CachedProfile[]): Promise<void> {
    await this.cached_profiles.bulkPut(profiles)
  }

  async removeCachedProfile(id: string): Promise<void> {
    await this.cached_profiles.delete(id)
  }

  // --- Local Message Storage (Zero Server Storage) ---
  async saveMessage(message: LocalMessage): Promise<void> {
    await this.local_messages.put(message)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jlb_local_messages_updated', { detail: message }))
    }
  }

  async getMessagesForMatch(matchId: string): Promise<LocalMessage[]> {
    return this.local_messages
      .where('matchId')
      .equals(matchId)
      .sortBy('timestamp')
  }

  async updateMessageStatus(id: string, status: MessageStatus): Promise<void> {
    await this.local_messages.update(id, { status })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jlb_local_messages_updated'))
    }
  }

  async deleteMessageForEveryone(id: string): Promise<void> {
    await this.local_messages.update(id, {
      text: '🚫 This message was deleted',
      mediaBlob: undefined,
      isDeleted: true,
    })
  }

  async markViewOnceOpened(id: string): Promise<void> {
    await this.local_messages.update(id, {
      mediaBlob: undefined,
      viewOnceStatus: 'opened',
    })
  }

  async markMessagesDelivered(matchId: string, recipientId: string): Promise<void> {
    const unacknowledged = await this.local_messages
      .where('matchId')
      .equals(matchId)
      .filter((m) => m.senderId === recipientId && (m.status === 'sending' || m.status === 'sent'))
      .toArray()

    const updates = unacknowledged.map((m) =>
      this.local_messages.update(m.id, { status: 'delivered' })
    )
    await Promise.all(updates)
  }

  async markMessagesRead(matchId: string, recipientId: string): Promise<void> {
    const delivered = await this.local_messages
      .where('matchId')
      .equals(matchId)
      .filter((m) => m.senderId === recipientId && m.status !== 'read')
      .toArray()

    const updates = delivered.map((m) =>
      this.local_messages.update(m.id, { status: 'read' })
    )
    await Promise.all(updates)
  }

  async deleteMessagesForMatch(matchId: string): Promise<void> {
    await this.local_messages.where('matchId').equals(matchId).delete()
  }

  async clearAllLocalData(): Promise<void> {
    await Promise.all([
      this.cached_profiles.clear(),
      this.local_messages.clear(),
    ])
  }

  async exportChatBackup(): Promise<string> {
    const messages = await this.local_messages.toArray()
    const profiles = await this.cached_profiles.toArray()
    const backup = {
      appName: 'JadavpurLoveBirds',
      schemaVersion: 1,
      timestamp: Date.now(),
      exportedAt: new Date().toISOString(),
      messages,
      profiles,
    }
    return JSON.stringify(backup, null, 2)
  }

  async importChatBackup(jsonString: string): Promise<{
    success: boolean
    messagesRestored: number
    profilesRestored: number
    error?: string
  }> {
    try {
      const data = JSON.parse(jsonString)
      if (!data || !Array.isArray(data.messages)) {
        return {
          success: false,
          messagesRestored: 0,
          profilesRestored: 0,
          error: 'Invalid backup file format: missing messages array',
        }
      }
      if (data.messages.length > 0) {
        await this.local_messages.bulkPut(data.messages)
      }
      let profilesRestored = 0
      if (data.profiles && Array.isArray(data.profiles) && data.profiles.length > 0) {
        await this.cached_profiles.bulkPut(data.profiles)
        profilesRestored = data.profiles.length
      }
      return {
        success: true,
        messagesRestored: data.messages.length,
        profilesRestored,
      }
    } catch (err: any) {
      return {
        success: false,
        messagesRestored: 0,
        profilesRestored: 0,
        error: err?.message || 'Failed to parse backup JSON',
      }
    }
  }

  // --- Matches IndexedDB Storage ---
  async saveMatches(userId: string, matches: any[]): Promise<void> {
    if (!matches || matches.length === 0) return
    const entries: CachedMatchEntry[] = matches.map((m) => ({
      id: m.id,
      userId,
      partnerId: m.partner?.id || '',
      data: m,
      updatedAt: Date.now(),
    }))
    await this.cached_matches.bulkPut(entries)
  }

  async getMatches(userId: string): Promise<any[]> {
    const entries = await this.cached_matches
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('updatedAt')
    return entries.map((e) => e.data)
  }
}

export const db = new AppLocalDatabase()

// --- Permanent On-Device Match Cache Utilities ---
const PERMANENT_MATCHES_PREFIX = 'jud_permanent_matches_'

export function getPermanentMatches(userId: string): any[] {
  try {
    const raw = localStorage.getItem(PERMANENT_MATCHES_PREFIX + userId)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Filter out and discard any legacy dummy 'Campus Match' entries
    return Array.isArray(parsed)
      ? parsed.filter((m) => m && m.partner && m.partner.full_name && m.partner.full_name !== 'Campus Match')
      : []
  } catch {
    return []
  }
}

export function savePermanentMatches(userId: string, matches: any[]): void {
  try {
    // Only save real, verified partner profiles - never dummy 'Campus Match' entries
    const cleanMatches = (matches || []).filter(
      (m) => m && m.partner && m.partner.full_name && m.partner.full_name !== 'Campus Match'
    )
    localStorage.setItem(PERMANENT_MATCHES_PREFIX + userId, JSON.stringify(cleanMatches))
    // Also save directly into Dexie IndexedDB
    db.saveMatches(userId, cleanMatches).catch(() => {})
  } catch (e) {
    console.warn('Failed to save permanent matches cache:', e)
  }
}

export async function getPermanentMatchesAsync(userId: string): Promise<any[]> {
  try {
    const idbMatches = await db.getMatches(userId)
    if (idbMatches && idbMatches.length > 0) {
      const clean = idbMatches.filter(
        (m) => m && m.partner && m.partner.full_name && m.partner.full_name !== 'Campus Match'
      )
      if (clean.length > 0) return clean
    }
  } catch (e) {
    console.warn('Failed to load matches from IndexedDB:', e)
  }

  const local = getPermanentMatches(userId)
  if (local && local.length > 0) {
    return local
  }

  // Deep offline fallback: Reconstruct active conversations from local_messages & verified cached_profiles
  try {
    const allMsgs = await db.local_messages.toArray()
    if (allMsgs.length > 0) {
      const matchMap = new Map<string, { partnerId: string; lastTimestamp: number }>()
      for (const msg of allMsgs) {
        if (!msg.matchId) continue
        const existing = matchMap.get(msg.matchId)
        const partnerId = msg.senderId !== userId ? msg.senderId : existing?.partnerId || ''
        const timestamp = msg.timestamp || 0
        if (!existing || timestamp > existing.lastTimestamp || (partnerId && !existing.partnerId)) {
          matchMap.set(msg.matchId, {
            partnerId: partnerId || existing?.partnerId || '',
            lastTimestamp: Math.max(timestamp, existing?.lastTimestamp || 0),
          })
        }
      }

      const reconstructed: any[] = []
      for (const [matchId, meta] of matchMap.entries()) {
        if (!meta.partnerId) continue
        const partner = await db.cached_profiles.get(meta.partnerId)
        // ONLY accept real profiles with non-dummy names
        if (partner && partner.full_name && partner.full_name !== 'Campus Match') {
          reconstructed.push({
            id: matchId,
            female_id: partner.gender === 'female' ? partner.id : userId,
            male_id: partner.gender === 'male' ? partner.id : userId,
            has_female_initiated: true,
            media_allowed: true,
            partner,
          })
        }
      }

      if (reconstructed.length > 0) {
        savePermanentMatches(userId, reconstructed)
        return reconstructed
      }
    }
  } catch (err) {
    console.warn('Failed to reconstruct matches from local messages:', err)
  }

  return []
}
