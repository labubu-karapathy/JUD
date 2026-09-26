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
  created_at: string
  updated_at: string
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

const DEFAULT_SEED_PROFILES: Profile[] = [
  {
    id: 'seed-profile-1-elena',
    full_name: 'Elena Rostova',
    gender: 'female',
    target_gender: 'male',
    age: 23,
    bio: 'Art history major & caffeine addict. Looking for meaningful conversations and museum dates.',
    insta_handle: '@elena_rostova',
    library_card_hash: '3f54817a80a221f7c1d764724b07f879bf97779d72d627c29e18b06606fb2a0a',
    photo_urls: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    report_count: 0,
    block_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'seed-profile-2-sophia',
    full_name: 'Sophia Chen',
    gender: 'female',
    target_gender: 'male',
    age: 22,
    bio: 'Software nerd by day, indie film lover by night. Book exchange enthusiast.',
    insta_handle: '@sophia.codes',
    library_card_hash: '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b',
    photo_urls: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    report_count: 0,
    block_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'seed-profile-3-alex',
    full_name: 'Alex Rivera',
    gender: 'male',
    target_gender: 'female',
    age: 24,
    bio: 'Bouldering, specialty coffee, and acoustic guitar. Let’s compare book stacks.',
    insta_handle: '@alex_climbs',
    library_card_hash: '11223344556677889900aabbccddeeff00112233445566778899aabbccddeeff',
    photo_urls: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    report_count: 1,
    block_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'seed-profile-4-marcus',
    full_name: 'Marcus Vance',
    gender: 'male',
    target_gender: 'female',
    age: 26,
    bio: 'Architecture graduate student. Always at the university library 4th floor.',
    insta_handle: '@vance_arch',
    library_card_hash: 'aabbccddeeff0011223344556677889900112233445566778899aabbccddeeff',
    photo_urls: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    report_count: 0,
    block_count: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
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

  async upsertProfile(profile: Profile): Promise<Profile> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(profile)
        .select()
        .single()
      if (error) {
        throw error
      }
      return data
    }

    const profiles = getLocalStored<Profile[]>(LOCAL_STORAGE_PROFILES, DEFAULT_SEED_PROFILES)
    const existingIdx = profiles.findIndex((p) => p.id === profile.id)
    if (existingIdx >= 0) {
      profiles[existingIdx] = { ...profiles[existingIdx], ...profile, updated_at: new Date().toISOString() }
    } else {
      profiles.push(profile)
    }
    setLocalStored(LOCAL_STORAGE_PROFILES, profiles)
    return profile
  },

  async fetchDiscoverProfiles(currentUserId: string): Promise<Profile[]> {
    if (isLiveSupabaseConfigured) {
      // RLS policy handles blocked exclusion on live Supabase
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', currentUserId)
        .order('created_at', { ascending: false })
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

    return profiles.filter((p) => p.id !== currentUserId && !blockedIds.has(p.id))
  },

  // Matches
  async fetchMatches(currentUserId: string): Promise<MatchRecord[]> {
    if (isLiveSupabaseConfigured) {
      const { data, error } = await supabase
        .from('matches')
        .select(`
          *,
          female:female_id(id, full_name, gender, age, bio, insta_handle, photo_urls, report_count, block_count, is_verified),
          male:male_id(id, full_name, gender, age, bio, insta_handle, photo_urls, report_count, block_count, is_verified)
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
}
