import { createClient } from '@supabase/supabase-js'

const url = 'https://bwvslsvjjclnspmdleyj.supabase.co'
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3dnNsc3ZqamNsbnNwbWRsZXlqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MTM3MzQsImV4cCI6MjEwNjA4OTczNH0.Wq7RqKJMCVzX5CisjZga2SpTk6EfAh20aTfRS9k1vPY'

const client = createClient(url, anonKey)

const SEED_PROFILES = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    full_name: 'Elena Rostova',
    gender: 'female',
    target_gender: 'male',
    age: 23,
    bio: 'Art history major & caffeine addict. Looking for meaningful conversations and museum dates.',
    insta_handle: '@elena_rostova',
    library_card_hash: 'CL-2025',
    photo_urls: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    department: 'Comparative Literature',
    grad_year: 2025,
    is_approved: true,
    is_deactivated: false,
    active_chat_count: 0,
    report_count: 0,
    block_count: 0,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    full_name: 'Sophia Chen',
    gender: 'female',
    target_gender: 'male',
    age: 22,
    bio: 'Software nerd by day, indie film lover by night. Book exchange enthusiast.',
    insta_handle: '@sophia.codes',
    library_card_hash: 'CS-4819',
    photo_urls: [
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    department: 'Computer Science & Engineering',
    grad_year: 2026,
    is_approved: true,
    is_deactivated: false,
    active_chat_count: 1,
    report_count: 0,
    block_count: 0,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    full_name: 'Alex Rivera',
    gender: 'male',
    target_gender: 'female',
    age: 24,
    bio: 'Bouldering, specialty coffee, and acoustic guitar. Let’s compare book stacks.',
    insta_handle: '@alex_climbs',
    library_card_hash: 'ET-3104',
    photo_urls: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    department: 'Electronics & Telecommunication Engineering',
    grad_year: 2024,
    is_approved: true,
    is_deactivated: false,
    active_chat_count: 1,
    report_count: 1,
    block_count: 0,
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    full_name: 'Marcus Vance',
    gender: 'male',
    target_gender: 'female',
    age: 26,
    bio: 'Architecture graduate student. Always at the university library 4th floor.',
    insta_handle: '@vance_arch',
    library_card_hash: 'AR-9012',
    photo_urls: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    department: 'Architecture',
    grad_year: 2024,
    is_approved: true,
    is_deactivated: false,
    active_chat_count: 0,
    report_count: 0,
    block_count: 1,
  },
  {
    id: '55555555-5555-4555-8555-555555555555',
    full_name: 'Ananya Sen',
    gender: 'female',
    target_gender: 'male',
    age: 21,
    bio: 'Physics enthusiast & campus debater. Catch me stargazing near the grounds.',
    insta_handle: '@ananya_physics',
    library_card_hash: 'PH-5521',
    photo_urls: [
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    department: 'Physics',
    grad_year: 2027,
    is_approved: false, // Pending Review for Approval Modal
    is_deactivated: false,
    active_chat_count: 0,
    report_count: 0,
    block_count: 0,
  },
  {
    id: '66666666-6666-4666-8666-666666666666',
    full_name: 'Rohit Bannerjee',
    gender: 'male',
    target_gender: 'female',
    age: 23,
    bio: 'Mechanical geek and Formula Student designer.',
    insta_handle: '@rohit_mech',
    library_card_hash: 'ME-8840',
    photo_urls: [
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=800&q=80'
    ],
    is_verified: true,
    department: 'Mechanical Engineering',
    grad_year: 2025,
    is_approved: true,
    is_deactivated: true, // For Re-Authentication Panel
    deactivation_reason: 'Flagged for campus guidelines breach (unsolicited handle spam)',
    active_chat_count: 0,
    report_count: 3,
    block_count: 2,
  }
]

async function seed() {
  console.log('Seeding profiles to live Supabase database...')
  for (const profile of SEED_PROFILES) {
    const { error } = await client.from('profiles').upsert(profile)
    if (error) {
      console.error(`Error upserting ${profile.full_name}:`, error.message)
    } else {
      console.log(`[+] Seeded: ${profile.full_name} (${profile.gender}, approved: ${profile.is_approved}, deactivated: ${profile.is_deactivated})`)
    }
  }

  // Also insert a test announcement
  const { error: annErr } = await client.from('global_announcements').insert({
    content: 'Jadavpur Love Birds: Secure campus P2P network is live.',
    type: 'admin_broadcast',
  })
  if (annErr) {
    console.warn('Announcement notice:', annErr.message)
  } else {
    console.log('[+] Seeded initial global announcement.')
  }
}

seed()
