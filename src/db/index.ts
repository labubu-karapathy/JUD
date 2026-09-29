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

export class AppLocalDatabase extends Dexie {
  cached_profiles!: Table<CachedProfile, string>
  local_messages!: Table<LocalMessage, string>

  constructor() {
    super('JUDAppLocalDB')
    
    this.version(1).stores({
      cached_profiles: 'id, full_name, gender, age, insta_handle, report_count, block_count, updated_at',
      local_messages: 'id, matchId, senderId, status, timestamp, [matchId+timestamp]'
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
  }

  async getMessagesForMatch(matchId: string): Promise<LocalMessage[]> {
    return this.local_messages
      .where('matchId')
      .equals(matchId)
      .sortBy('timestamp')
  }

  async updateMessageStatus(id: string, status: MessageStatus): Promise<void> {
    await this.local_messages.update(id, { status })
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
}

export const db = new AppLocalDatabase()

// --- Permanent On-Device Match Cache Utilities ---
const PERMANENT_MATCHES_PREFIX = 'jud_permanent_matches_'

export function getPermanentMatches(userId: string): any[] {
  try {
    const raw = localStorage.getItem(PERMANENT_MATCHES_PREFIX + userId)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePermanentMatches(userId: string, matches: any[]): void {
  try {
    localStorage.setItem(PERMANENT_MATCHES_PREFIX + userId, JSON.stringify(matches))
  } catch (e) {
    console.warn('Failed to save permanent matches cache:', e)
  }
}
