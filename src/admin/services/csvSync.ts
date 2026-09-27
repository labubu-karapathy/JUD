import { api, type Profile } from '../../services/supabase'

const CSV_STORAGE_KEY = 'jlb_admin_profiles_csv'
const CSV_TIMESTAMP_KEY = 'jlb_admin_profiles_csv_synced_at'

const CSV_COLUMNS = [
  'id',
  'full_name',
  'gender',
  'target_gender',
  'age',
  'department',
  'grad_year',
  'is_approved',
  'is_deactivated',
  'active_chat_count',
  'report_count',
  'block_count',
  'insta_handle',
  'library_card_hash',
  'bio',
  'photo_urls',
  'created_at',
  'updated_at',
  'approval_comment',
  'deactivation_reason',
] as const

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return ''
  let str = ''
  if (Array.isArray(val)) {
    str = val.join(';')
  } else if (typeof val === 'object') {
    str = JSON.stringify(val)
  } else {
    str = String(val)
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function serializeProfilesToCsv(profiles: Profile[]): string {
  const header = CSV_COLUMNS.join(',')
  const rows = profiles.map((p) => {
    return [
      escapeCsvField(p.id),
      escapeCsvField(p.full_name),
      escapeCsvField(p.gender),
      escapeCsvField(p.target_gender),
      escapeCsvField(p.age),
      escapeCsvField(p.department || ''),
      escapeCsvField(p.grad_year || ''),
      escapeCsvField(p.is_approved ? 'true' : 'false'),
      escapeCsvField(p.is_deactivated ? 'true' : 'false'),
      escapeCsvField(p.active_chat_count ?? 0),
      escapeCsvField(p.report_count ?? 0),
      escapeCsvField(p.block_count ?? 0),
      escapeCsvField(p.insta_handle),
      escapeCsvField(p.library_card_hash),
      escapeCsvField(p.bio || ''),
      escapeCsvField(p.photo_urls || []),
      escapeCsvField(p.created_at || ''),
      escapeCsvField(p.updated_at || ''),
      escapeCsvField(p.approval_comment || ''),
      escapeCsvField(p.deactivation_reason || ''),
    ].join(',')
  })
  return [header, ...rows].join('\n')
}

export function parseCsvToProfiles(csv: string): Profile[] {
  if (!csv || !csv.trim()) return []

  const lines = csv.trim().split(/\r?\n/)
  if (lines.length <= 1) return []

  // Skip header
  const dataLines = lines.slice(1)
  const profiles: Profile[] = []

  for (const line of dataLines) {
    if (!line.trim()) continue

    // Regex to split by commas respecting quoted strings
    const fields: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current)
        current = ''
      } else {
        current += char
      }
    }
    fields.push(current)

    if (fields.length < 5) continue

    const [
      id,
      full_name,
      gender,
      target_gender,
      age,
      department,
      grad_year,
      is_approved,
      is_deactivated,
      active_chat_count,
      report_count,
      block_count,
      insta_handle,
      library_card_hash,
      bio,
      photo_urls_raw,
      created_at,
      updated_at,
      approval_comment,
      deactivation_reason,
    ] = fields

    profiles.push({
      id: id || `p_${Date.now()}`,
      full_name: full_name || 'Anonymous',
      gender: (gender as any) || 'female',
      target_gender: (target_gender as any) || 'all',
      age: parseInt(age) || 20,
      department: department || undefined,
      grad_year: grad_year ? parseInt(grad_year) : undefined,
      is_verified: true,
      is_approved: is_approved === 'true',
      is_deactivated: is_deactivated === 'true',
      active_chat_count: parseInt(active_chat_count) || 0,
      report_count: parseInt(report_count) || 0,
      block_count: parseInt(block_count) || 0,
      insta_handle: insta_handle || '',
      library_card_hash: library_card_hash || '',
      bio: bio || '',
      photo_urls: photo_urls_raw ? photo_urls_raw.split(';') : [],
      created_at: created_at || new Date().toISOString(),
      updated_at: updated_at || new Date().toISOString(),
      approval_comment: approval_comment || undefined,
      deactivation_reason: deactivation_reason || undefined,
    })
  }

  return profiles
}

export const csvSync = {
  saveProfilesToCsv(profiles: Profile[]): void {
    const csv = serializeProfilesToCsv(profiles)
    localStorage.setItem(CSV_STORAGE_KEY, csv)
    localStorage.setItem(CSV_TIMESTAMP_KEY, new Date().toISOString())
  },

  getLocalCsvProfiles(): Profile[] {
    const csv = localStorage.getItem(CSV_STORAGE_KEY)
    if (!csv) return []
    return parseCsvToProfiles(csv)
  },

  getLastSyncedAt(): string | null {
    return localStorage.getItem(CSV_TIMESTAMP_KEY)
  },

  async syncFromSupabase(): Promise<Profile[]> {
    const fresh = await api.getAllProfilesForAdmin()
    this.saveProfilesToCsv(fresh)
    return fresh
  },

  setupSyncLoop(
    onUpdate: (profiles: Profile[]) => void,
    intervalMs: number = 5 * 60 * 1000 // 5 minutes
  ): () => void {
    // 1. Load cached or fetch initial
    const cached = this.getLocalCsvProfiles()
    if (cached.length > 0) {
      onUpdate(cached)
    } else {
      this.syncFromSupabase().then(onUpdate).catch(console.error)
    }

    // 2. Incremental delta poll every 5 minutes
    const interval = setInterval(async () => {
      try {
        const updated = await this.syncFromSupabase()
        onUpdate(updated)
      } catch (err) {
        console.warn('Incremental CSV sync delta poll error:', err)
      }
    }, intervalMs)

    return () => clearInterval(interval)
  },
}
