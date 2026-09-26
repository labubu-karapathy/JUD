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
}

export const db = new AppLocalDatabase()
