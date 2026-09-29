import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'

export interface Profile {
  id: string
  full_name: string
  gender: 'male' | 'female' | 'other'
  target_gender: 'male' | 'female' | 'all'
  age: number
  bio: string
  insta_handle: string
  library_card_hash: string
  photo_urls: string[]
  is_verified: boolean
  report_count: number
  block_count: number
  department?: string
  grad_year?: number
  is_approved?: boolean
  approval_comment?: string
  is_deactivated?: boolean
  deactivation_reason?: string
  active_chat_count?: number
  pin_hash?: string
  created_at: string
  updated_at: string
}

/**
 * Calculates current student age with automatic annual increment based on registration year
 */
export function calculateCurrentAge(profile: { age?: number; created_at?: string }): number {
  const baseAge = profile?.age || 20
  if (!profile?.created_at) return baseAge
  try {
    const regYear = new Date(profile.created_at).getFullYear()
    const nowYear = new Date().getFullYear()
    if (!isNaN(regYear) && nowYear > regYear) {
      return baseAge + (nowYear - regYear)
    }
  } catch {
    // fallback
  }
  return baseAge
}

export interface MatchRecord {
  id: string
  female_id: string
  male_id: string
  has_female_initiated: boolean
  media_allowed: boolean
  matched_at: string
  partner?: Profile
}

export interface BlockRecord {
  id: string
  blocker_id: string
  blocked_id: string
  created_at: string
}

export interface ReportRecord {
  id: string
  reporter_id: string
  reported_id: string
  reason: string
  created_at: string
}

export interface ChatRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'rejected'
  created_at: string
  sender?: Profile
  receiver?: Profile
}

export interface GlobalCampusMessage {
  id: string
  sender_id: string
  sender_name: string
  department: string
  gender: 'female' | 'male' | 'other'
  text: string
  created_at: number
}

export interface GlobalAnnouncement {
  id: string
  content: string
  type: 'admin_broadcast' | 'user_deactivation' | 'system'
  created_at: string
}

export interface AdminPasskey {
  id: string
  credential_id: string
  public_key: string
  counter: number
  device_label?: string
  created_at: string
}

export interface AppUpdateRecord {
  id: string
  version: string
  build_hash: string
  commit_message: string
  patch_bundle: any
  bundle_size: number
  is_active: boolean
  created_at: string
}

export interface OfflineQueueMessage {
  id: string
  match_id: string
  sender_id: string
  receiver_id: string
  text?: string
  media_blob?: string
  media_type?: string
  is_view_once?: boolean
  created_at: number
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mock-supabase-instance.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.mock_key'

export const isLiveSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && 
  import.meta.env.VITE_SUPABASE_ANON_KEY &&
  !import.meta.env.VITE_SUPABASE_URL.includes('mock-supabase')
)

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// --- Mock / Local Storage Fallback Layer for Zero-Friction Demo Mode ---
const LOCAL_STORAGE_PROFILES = 'jud_mock_profiles'
const LOCAL_STORAGE_MATCHES = 'jud_mock_matches'
const LOCAL_STORAGE_BLOCKS = 'jud_mock_blocks'
const LOCAL_STORAGE_REPORTS = 'jud_mock_reports'
const LOCAL_STORAGE_ANNOUNCEMENTS = 'jud_mock_announcements'
const LOCAL_STORAGE_CHAT_REQUESTS = 'jud_mock_chat_requests'
const LOCAL_STORAGE_ADMIN_PASSKEYS = 'jud_mock_admin_passkeys'

const DEFAULT_SEED_PROFILES: Profile[] = []

const DEFAULT_ANNOUNCEMENTS: GlobalAnnouncement[] = [
  {
    id: 'ann-1',
    content: 'Welcome to Jadavpur Love Birds! Zero cloud storage, direct WebRTC P2P.',
    type: 'system',
    created_at: new Date().toISOString()
  }
]

function getLocalStored<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultVal))
      return defaultVal
    }
    return JSON.parse(raw) as T
  } catch {
    return defaultVal
  }
}

function setLocalStored<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (e) {
    console.error('Failed writing to localStorage', e)
  }
}

// In-memory cross-tab mock broadcast channel for WebRTC signaling when no live Supabase
const mockBroadcastChannels: Map<string, Set<(payload: unknown) => void>> = new Map()
const announcementListeners: Set<(announcement: GlobalAnnouncement) => void> = new Set()
const deactivationListeners: Set<(userId: string) => void> = new Set()

/**
 * 12-Hour Promotional Auto-Approval Window:
 * All registrations within this period (until 2026-09-30T11:00:00+05:30) are automatically approved.
 */
export const AUTO_APPROVE_WINDOW_UNTIL = new Date('2026-09-30T11:00:00+05:30').getTime()

export function isAutoApprovalActive(): boolean {
  return Date.now() <= AUTO_APPROVE_WINDOW_UNTIL
}

export const api = {
  // Profiles
  async getProfile(userId: string): Promise<Profile | null> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error && error.code !== 'PGRST116') {
        console.error('Error getting profile:', error)
      }
      return data || null
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    return profiles.find((p) => p.id === userId) || null
  },

  async checkExistingStudent(libraryCard: string, instaHandle: string): Promise<Profile | null> {
    const cleanCard = libraryCard.trim().toUpperCase()
    const cleanInsta = instaHandle.trim().toLowerCase().startsWith('@')
      ? instaHandle.trim().toLowerCase()
      : `@${instaHandle.trim().toLowerCase()}`

    if (isLiveSupabaseConfigured) {
      try {
        // Query 1: Library card check
        const cardRes = await supabase
          .from('profiles')
          .select('*')
          .eq('library_card_hash', cleanCard)
          .maybeSingle()

        if (cardRes.data) {
          return cardRes.data as Profile
        }

        // Query 2: Instagram handle check
        const instaRes = await supabase
          .from('profiles')
          .select('*')
          .ilike('insta_handle', cleanInsta)
          .maybeSingle()

        if (instaRes.data) {
          return instaRes.data as Profile
        }

        return null
      } catch (err) {
        console.warn('Error checking existing student:', err)
        return null
      }
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    return (
      profiles.find(
        (p) =>
          (p.library_card_hash && p.library_card_hash.toUpperCase() === cleanCard) ||
          (p.insta_handle && p.insta_handle.toLowerCase() === cleanInsta)
      ) || null
    )
  },

  async upsertProfile(profile: Profile): Promise<Profile> {
    const enriched: Profile = {
      ...profile,
      department: profile.department || 'Computer Science & Engineering',
      grad_year: profile.grad_year || 2026,
      is_approved: profile.is_approved !== undefined ? profile.is_approved : isAutoApprovalActive(),
      is_deactivated: profile.is_deactivated || false,
      active_chat_count: profile.active_chat_count || 0,
      report_count: profile.report_count || 0,
      block_count: profile.block_count || 0,
      updated_at: new Date().toISOString(),
    }

    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(enriched)
        .select()
        .single()
      if (error) {
        throw error
      }
      return data
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const existingIdx = profiles.findIndex((p) => p.id === enriched.id)
    if (existingIdx >= 0) {
      profiles[existingIdx] = { ...profiles[existingIdx], ...enriched }
    } else {
      profiles.push(enriched)
    }
    setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
    return enriched
  },

  async fetchDiscoverProfiles(currentUserId: string, requesterGender?: 'male' | 'female' | 'other'): Promise<Profile[]> {
    if (isLiveSupabaseConfigured) {
      // RLS policy handles blocked & deactivated exclusion on live Supabase
      let query = supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUserId)
        .eq('is_deactivated', false)
        .eq('is_approved', true)

      // Male query sorts by active_chat_count ASC, block_count ASC
      if (requesterGender === 'male') {
        query = query.order('active_chat_count', { ascending: true }).order('block_count', { ascending: true })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const { data, error } = await query
      if (error) throw error
      return data || []
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const blocks = getLocalStored<BlockRecord[]>(LOCAL_STORAGE_BLOCKS, [])
    const blockedIds = new Set(
      blocks
        .filter((b) => b.blocker_id === currentUserId || b.blocked_id === currentUserId)
        .map((b) => (b.blocker_id === currentUserId ? b.blocked_id : b.blocker_id))
    )

    let results = profiles.filter(
      (p) => p.id !== currentUserId &&
             !blockedIds.has(p.id) &&
             !p.is_deactivated &&
             p.is_approved !== false
    )

    // Male discovery feed sorting: ORDER BY active_chat_count ASC, block_count ASC
    if (requesterGender === 'male') {
      results.sort((a, b) => {
        const chatDelta = (a.active_chat_count || 0) - (b.active_chat_count || 0)
        if (chatDelta !== 0) return chatDelta
        return (a.block_count || 0) - (b.block_count || 0)
      })
    } else {
      results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return results
  },

  // Matches
  async fetchMatches(currentUserId: string): Promise<MatchRecord[]> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          female:female_id(id, full_name, gender, age, bio, insta_handle, photo_urls, report_count, block_count, is_verified, is_deactivated, active_chat_count),
          male:male_id(id, full_name, gender, age, bio, insta_handle, photo_urls, report_count, block_count, is_verified, is_deactivated, active_chat_count)
        `)
        .or(`female_id.eq.${currentUserId},male_id.eq.${currentUserId}`)

      if (error) throw error
      return (data || []).map((row: any) => {
        const partner = row.female_id === currentUserId ? row.male : row.female
        return {
          id: row.id,
          female_id: row.female_id,
          male_id: row.male_id,
          has_female_initiated: row.has_female_initiated,
          media_allowed: row.media_allowed,
          matched_at: row.matched_at,
          partner,
        }
      })
    }

    const matches = getLocalStored<MatchRecord[]>(LOCAL_STORAGE_MATCHES, [])
    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)

    const userMatches = matches.filter(
      (m) => m.female_id === currentUserId || m.male_id === currentUserId
    )

    return userMatches.map((m) => {
      const partnerId = m.female_id === currentUserId ? m.male_id : m.female_id
      const partner = profiles.find((p) => p.id === partnerId)
      return {
        ...m,
        partner,
      }
    })
  },

  async getMatch(matchId: string): Promise<MatchRecord | null> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .maybeSingle()

      if (error) {
        console.warn('Error fetching single match:', error)
        return null
      }
      return data || null
    }

    const matches = getLocalStored<MatchRecord[]>(LOCAL_STORAGE_MATCHES, [])
    return matches.find((m) => m.id === matchId) || null
  },

  async createMatch(femaleId: string, maleId: string): Promise<MatchRecord> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('matches')
        .insert({
          female_id: femaleId,
          male_id: maleId,
          has_female_initiated: false,
          media_allowed: false,
        })
        .select()
        .single()
      if (error) throw error
      return data
    }

    const matches = getLocalStored<MatchRecord[]>(LOCAL_STORAGE_MATCHES, [])
    const existing = matches.find(
      (m) => m.female_id === femaleId && m.male_id === maleId
    )
    if (existing) return existing

    const newMatch: MatchRecord = {
      id: `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      female_id: femaleId,
      male_id: maleId,
      has_female_initiated: false,
      media_allowed: false,
      matched_at: new Date().toISOString(),
    }
    matches.push(newMatch)
    setLocalStored(LOCAL_STORAGE_MATCHES, matches)

    // Trigger atomic chat counter increment
    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    for (const p of profiles) {
      if (p.id === femaleId || p.id === maleId) {
        p.active_chat_count = (p.active_chat_count || 0) + 1
      }
    }
    setLocalStored(LOCAL_STORAGE_PROFILES, profiles)

    return newMatch
  },

  async setFemaleInitiated(matchId: string): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('matches')
        .update({ has_female_initiated: true })
        .eq('id', matchId)
      if (error) throw error
      return
    }

    const matches = getLocalStored<MatchRecord[]>(LOCAL_STORAGE_MATCHES, [])
    const match = matches.find((m) => m.id === matchId)
    if (match) {
      match.has_female_initiated = true
      setLocalStored(LOCAL_STORAGE_MATCHES, matches)
    }
  },

  async toggleMediaAllowed(matchId: string, allowed: boolean): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('matches')
        .update({ media_allowed: allowed })
        .eq('id', matchId)
      if (error) throw error
      return
    }

    const matches = getLocalStored<MatchRecord[]>(LOCAL_STORAGE_MATCHES, [])
    const match = matches.find((m) => m.id === matchId)
    if (match) {
      match.media_allowed = allowed
      setLocalStored(LOCAL_STORAGE_MATCHES, matches)
    }
  },

  // Blocks & Reports with atomic counters
  async blockUser(blockerId: string, blockedId: string): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('blocks')
        .insert({ blocker_id: blockerId, blocked_id: blockedId })
      if (error && error.code !== '23505') throw error
      return
    }

    const blocks = getLocalStored<BlockRecord[]>(LOCAL_STORAGE_BLOCKS, [])
    if (!blocks.some((b) => b.blocker_id === blockerId && b.blocked_id === blockedId)) {
      blocks.push({
        id: `block_${Date.now()}`,
        blocker_id: blockerId,
        blocked_id: blockedId,
        created_at: new Date().toISOString(),
      })
      setLocalStored(LOCAL_STORAGE_BLOCKS, blocks)

      // Increment block_count
      const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
      const target = profiles.find((p) => p.id === blockedId)
      if (target) {
        target.block_count = (target.block_count || 0) + 1
        setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
      }
    }
  },

  async getBlockedUsers(userId: string): Promise<Profile[]> {
    if (isLiveSupabaseConfigured) {
      const { data: blocks, error } = await supabase
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', userId)
      if (error) throw error
      const ids = (blocks || []).map((b) => b.blocked_id)
      if (ids.length === 0) return []
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', ids)
      if (pErr) throw pErr
      return profiles || []
    }

    const blocks = getLocalStored<BlockRecord[]>(LOCAL_STORAGE_BLOCKS, [])
    const blockedIds = new Set(blocks.filter((b) => b.blocker_id === userId).map((b) => b.blocked_id))
    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    return profiles.filter((p) => blockedIds.has(p.id))
  },

  async unblockUser(blockerId: string, blockedId: string): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
      if (error) throw error
      return
    }

    const blocks = getLocalStored<BlockRecord[]>(LOCAL_STORAGE_BLOCKS, [])
    const filtered = blocks.filter((b) => !(b.blocker_id === blockerId && b.blocked_id === blockedId))
    setLocalStored(LOCAL_STORAGE_BLOCKS, filtered)
  },

  async reportUser(reporterId: string, reportedId: string, reason: string): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('reports')
        .insert({
          reporter_id: reporterId,
          reported_id: reportedId,
          reason,
        })
      if (error) throw error
      return
    }

    const reports = getLocalStored<ReportRecord[]>(LOCAL_STORAGE_REPORTS, [])
    reports.push({
      id: `report_${Date.now()}`,
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      created_at: new Date().toISOString(),
    })
    setLocalStored(LOCAL_STORAGE_REPORTS, reports)

    // Increment report_count
    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const target = profiles.find((p) => p.id === reportedId)
    if (target) {
      target.report_count = (target.report_count || 0) + 1
      setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
    }
  },

  // --- PART 1 & 4: CHAT REQUESTS (Female-First DM Approval) ---
  async sendChatRequest(senderId: string, receiverId: string): Promise<ChatRequest> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('chat_requests')
        .upsert({ sender_id: senderId, receiver_id: receiverId, status: 'pending' })
        .select()
        .single()
      if (error) throw error
      return data
    }

    const requests = getLocalStored<ChatRequest[]>(LOCAL_STORAGE_CHAT_REQUESTS, [])
    const existing = requests.find((r) => r.sender_id === senderId && r.receiver_id === receiverId)
    if (existing) {
      return existing
    }
    const newReq: ChatRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      created_at: new Date().toISOString()
    }
    requests.push(newReq)
    setLocalStored(LOCAL_STORAGE_CHAT_REQUESTS, requests)
    return newReq
  },

  async getChatRequests(userId: string): Promise<ChatRequest[]> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('chat_requests')
        .select(`
          *,
          sender:sender_id(*),
          receiver:receiver_id(*)
        `)
        .or(`receiver_id.eq.${userId},sender_id.eq.${userId}`)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }

    const requests = getLocalStored<ChatRequest[]>(LOCAL_STORAGE_CHAT_REQUESTS, [])
    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    return requests
      .filter((r) => r.receiver_id === userId || r.sender_id === userId)
      .map((r) => ({
        ...r,
        sender: profiles.find((p) => p.id === r.sender_id),
        receiver: profiles.find((p) => p.id === r.receiver_id),
      }))
  },

  async respondChatRequest(requestId: string, status: 'accepted' | 'rejected'): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('chat_requests')
        .update({ status })
        .eq('id', requestId)
        .select()
        .single()
      if (error) throw error
      if (status === 'accepted' && data) {
        // Create match immediately upon acceptance
        await this.createMatch(data.receiver_id, data.sender_id)
      }
      return
    }

    const requests = getLocalStored<ChatRequest[]>(LOCAL_STORAGE_CHAT_REQUESTS, [])
    const req = requests.find((r) => r.id === requestId)
    if (req) {
      req.status = status
      setLocalStored(LOCAL_STORAGE_CHAT_REQUESTS, requests)
      if (status === 'accepted') {
        await this.createMatch(req.receiver_id, req.sender_id)
      }
    }
  },

  async getChatRequestStatus(senderId: string, receiverId: string): Promise<'pending' | 'accepted' | 'rejected' | null> {
    const requests = await this.getChatRequests(senderId)
    const match = requests.find((r) => r.sender_id === senderId && r.receiver_id === receiverId)
    return match ? match.status : null
  },

  // --- PART 1 & 3: GLOBAL ANNOUNCEMENTS ---
  async createGlobalAnnouncement(
    content: string,
    type: 'admin_broadcast' | 'user_deactivation' | 'system' = 'admin_broadcast'
  ): Promise<GlobalAnnouncement> {
    const announcement: GlobalAnnouncement = {
      id: `ann_${Date.now()}`,
      content,
      type,
      created_at: new Date().toISOString()
    }

    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('global_announcements')
        .insert({ content, type })
        .select()
        .single()
      if (error) throw error
      return data
    }

    const list = getLocalStored<GlobalAnnouncement[]>(LOCAL_STORAGE_ANNOUNCEMENTS, DEFAULT_ANNOUNCEMENTS)
    list.unshift(announcement)
    setLocalStored(LOCAL_STORAGE_ANNOUNCEMENTS, list)

    announcementListeners.forEach((fn) => fn(announcement))
    return announcement
  },

  async getGlobalAnnouncements(): Promise<GlobalAnnouncement[]> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('global_announcements')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }

    return getLocalStored<GlobalAnnouncement[]>(LOCAL_STORAGE_ANNOUNCEMENTS, DEFAULT_ANNOUNCEMENTS)
  },

  subscribeGlobalAnnouncements(callback: (announcement: GlobalAnnouncement) => void): () => void {
    if (isLiveSupabaseConfigured) {
      const channel = supabase
        .channel('public:global_announcements')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'global_announcements' },
          (payload) => {
            callback(payload.new as GlobalAnnouncement)
          }
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }

    announcementListeners.add(callback)
    return () => {
      announcementListeners.delete(callback)
    }
  },

  onUserDeactivated(callback: (userId: string) => void): () => void {
    deactivationListeners.add(callback)
    return () => {
      deactivationListeners.delete(callback)
    }
  },

  // --- PART 3: ADMIN APP PROFILE MANAGEMENT ---
  async getAllProfilesForAdmin(): Promise<Profile[]> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    }

    return getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
  },

  async approveProfile(userId: string, comment?: string): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: true, approval_comment: comment || null })
        .eq('id', userId)
      if (error) throw error
      return
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const target = profiles.find((p) => p.id === userId)
    if (target) {
      target.is_approved = true
      target.approval_comment = comment
      setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
    }
  },

  async rejectProfile(userId: string, reason?: string, deleteProfile: boolean = false): Promise<void> {
    if (isLiveSupabaseConfigured) {
      if (deleteProfile) {
        const { error } = await supabase.from('profiles').delete().eq('id', userId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('profiles')
          .update({ is_approved: false, approval_comment: reason || 'Rejected by Admin' })
          .eq('id', userId)
        if (error) throw error
      }
      return
    }

    let profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    if (deleteProfile) {
      profiles = profiles.filter((p) => p.id !== userId)
    } else {
      const target = profiles.find((p) => p.id === userId)
      if (target) {
        target.is_approved = false
        target.approval_comment = reason || 'Rejected by Admin'
      }
    }
    setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
  },

  async deactivateProfile(userId: string, reason: string): Promise<void> {
    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const target = profiles.find((p) => p.id === userId)
    const handle = target?.insta_handle || 'user'

    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('profiles')
        .update({ is_deactivated: true, deactivation_reason: reason })
        .eq('id', userId)
      if (error) throw error
    } else if (target) {
      target.is_deactivated = true
      target.deactivation_reason = reason
      setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
    }

    // 2. Broadcast de-authentication announcement
    await this.createGlobalAnnouncement(
      `Profile ${handle} has been de-authenticated. Reason: ${reason}`,
      'user_deactivation'
    )

    // 3. Notify local client listeners to immediately sever channels & update UI
    deactivationListeners.forEach((fn) => fn(userId))
  },

  async reauthenticateProfile(userId: string): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const { error } = await supabase
        .from('profiles')
        .update({ is_deactivated: false, deactivation_reason: null })
        .eq('id', userId)
      if (error) throw error
      return
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const target = profiles.find((p) => p.id === userId)
    if (target) {
      target.is_deactivated = false
      target.deactivation_reason = undefined
      setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
    }
  },

  // --- PART 3: ADMIN WEBAUTHN PASSKEYS ---
  async saveAdminPasskey(passkey: Omit<AdminPasskey, 'id' | 'created_at'>): Promise<AdminPasskey> {
    const record: AdminPasskey = {
      ...passkey,
      id: `pk_${Date.now()}`,
      created_at: new Date().toISOString(),
    }

    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('admin_passkeys')
        .insert(passkey)
        .select()
        .single()
      if (error) throw error
      return data
    }

    const passkeys = getLocalStored<AdminPasskey[]>(LOCAL_STORAGE_ADMIN_PASSKEYS, [])
    passkeys.push(record)
    setLocalStored(LOCAL_STORAGE_ADMIN_PASSKEYS, passkeys)
    return record
  },

  async getAdminPasskeys(): Promise<AdminPasskey[]> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase.from('admin_passkeys').select('*')
      if (error) throw error
      return data || []
    }

    return getLocalStored<AdminPasskey[]>(LOCAL_STORAGE_ADMIN_PASSKEYS, [])
  },

  // Ephemeral Realtime Broadcast for WebRTC Signaling
  createSignalChannel(
    matchId: string,
    onSignal: (payload: any) => void
  ): { send: (payload: any) => Promise<void>; unsubscribe: () => void } {
    if (isLiveSupabaseConfigured) {
      const channel: RealtimeChannel = supabase.channel(`signal:${matchId}`, {
        config: { broadcast: { self: false } },
      })

      channel
        .on('broadcast', { event: 'webrtc-signal' }, ({ payload }) => {
          onSignal(payload)
        })
        .subscribe()

      return {
        send: async (payload: any) => {
          await channel.send({
            type: 'broadcast',
            event: 'webrtc-signal',
            payload,
          })
        },
        unsubscribe: () => {
          channel.unsubscribe()
        },
      }
    }

    // Emulated cross-tab BroadcastChannel for zero-config offline testing
    const bcName = `jud_p2p_channel_${matchId}`
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(bcName)
      bc.onmessage = (event) => {
        onSignal(event.data)
      }
    } catch {
      // In-memory fallback
      if (!mockBroadcastChannels.has(matchId)) {
        mockBroadcastChannels.set(matchId, new Set())
      }
      mockBroadcastChannels.get(matchId)!.add(onSignal)
    }

    return {
      send: async (payload: any) => {
        if (bc) {
          bc.postMessage(payload)
        } else {
          const listeners = mockBroadcastChannels.get(matchId)
          if (listeners) {
            listeners.forEach((fn) => {
              if (fn !== onSignal) fn(payload)
            })
          }
        }
      },
      unsubscribe: () => {
        if (bc) {
          bc.close()
        } else {
          mockBroadcastChannels.get(matchId)?.delete(onSignal)
        }
      },
    }
  },

  // --- ZERO-STORAGE OFFLINE P2P MESSAGE RELAY (DELEGATED TO CLOUDFLARE WORKER) ---
  // Retained as zero-write no-ops to protect Supabase Free-Tier database quotas
  async enqueueOfflineMessage(_msg: OfflineQueueMessage): Promise<void> {
    // Zero-write: Handled exclusively by Cloudflare Worker blind drop
  },

  async fetchAndDrainOfflineMessages(_receiverId: string): Promise<OfflineQueueMessage[]> {
    // Zero-write: Handled exclusively by Cloudflare Worker blind drop
    return []
  },

  // Ephemeral User-Level Signaling for Instant Background Reconnection
  createUserSignalChannel(
    userId: string,
    onMessage: (payload: any) => void
  ): { sendToUser: (targetUserId: string, payload: any) => Promise<void>; unsubscribe: () => void } {
    if (isLiveSupabaseConfigured) {
      const channel: RealtimeChannel = supabase.channel(`user-inbox:${userId}`, {
        config: { broadcast: { self: false } },
      })

      channel
        .on('broadcast', { event: 'p2p-signal' }, ({ payload }) => {
          onMessage(payload)
        })
        .subscribe()

      return {
        sendToUser: async (targetUserId: string, payload: any) => {
          const targetChannel = supabase.channel(`user-inbox:${targetUserId}`, {
            config: { broadcast: { self: false } },
          })
          await targetChannel.subscribe()
          await targetChannel.send({
            type: 'broadcast',
            event: 'p2p-signal',
            payload,
          })
          setTimeout(() => {
            targetChannel.unsubscribe()
          }, 3000)
        },
        unsubscribe: () => {
          channel.unsubscribe()
        },
      }
    }

    const bcName = `jud_user_inbox_${userId}`
    let bc: BroadcastChannel | null = null
    try {
      bc = new BroadcastChannel(bcName)
      bc.onmessage = (event) => onMessage(event.data)
    } catch {
      // fallback
    }

    return {
      sendToUser: async (targetUserId: string, payload: any) => {
        try {
          const targetBc = new BroadcastChannel(`jud_user_inbox_${targetUserId}`)
          targetBc.postMessage(payload)
          setTimeout(() => targetBc.close(), 1000)
        } catch {
          // fallback
        }
      },
      unsubscribe: () => {
        if (bc) bc.close()
      },
    }
  },

  // Over-The-Air (OTA) Live Auto-Updates
  async getLatestAppUpdate(): Promise<AppUpdateRecord | null> {
    if (isLiveSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from('app_updates')
          .select('*')
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) {
          console.warn('[OTA] Error checking for updates:', error.message)
          return null
        }
        return data as AppUpdateRecord | null
      } catch (err) {
        console.warn('[OTA] Failed to fetch latest update:', err)
        return null
      }
    }
    return null
  },

  listenToAppUpdates(callback: (update: AppUpdateRecord) => void): () => void {
    if (isLiveSupabaseConfigured) {
      const channel = supabase
        .channel('campus_ota_updates_channel')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'app_updates' },
          (payload) => {
            if (payload.new && (payload.new as AppUpdateRecord).is_active) {
              callback(payload.new as AppUpdateRecord)
            }
          }
        )
        .on('broadcast', { event: 'live_app_update' }, ({ payload }) => {
          if (payload) {
            callback(payload as AppUpdateRecord)
          }
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
    return () => {}
  },

  // Campus-Wide Global Chat (Live slide-over panel for verified students)
  subscribeGlobalCampusChat(callback: (msg: GlobalCampusMessage) => void): () => void {
    if (isLiveSupabaseConfigured) {
      const channel = supabase
        .channel('campus_global_chat')
        .on('broadcast', { event: 'campus_msg' }, ({ payload }) => {
          if (payload) callback(payload as GlobalCampusMessage)
        })
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    const handler = (e: StorageEvent) => {
      if (e.key === 'jud_mock_global_campus_msg' && e.newValue) {
        try {
          callback(JSON.parse(e.newValue))
        } catch {}
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  },

  async sendGlobalCampusMessage(msg: GlobalCampusMessage): Promise<void> {
    if (isLiveSupabaseConfigured) {
      const channel = supabase.channel('campus_global_chat')
      await channel.send({
        type: 'broadcast',
        event: 'campus_msg',
        payload: msg,
      })
      return
    }

    localStorage.setItem('jud_mock_global_campus_msg', JSON.stringify(msg))
  },
}
