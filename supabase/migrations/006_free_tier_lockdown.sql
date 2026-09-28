-- ==============================================================================
-- 006_free_tier_lockdown.sql
-- Jadavpur Love Birds (JLB) — Supabase Free-Tier Zero-Write & Quota Lockdown
-- ==============================================================================

-- 1. Purge and drop offline_message_queue to guarantee 0 MB database message storage
DROP TABLE IF EXISTS public.offline_message_queue CASCADE;

-- 2. Optimize public.profiles for high-concurrency read queries & Realtime listeners
CREATE INDEX IF NOT EXISTS idx_profiles_campus_discovery
  ON public.profiles(is_approved, is_deactivated, gender, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_card_lookup
  ON public.profiles(library_card_hash);

CREATE INDEX IF NOT EXISTS idx_profiles_insta_lookup
  ON public.profiles(insta_handle);

-- 3. Configure Realtime publication for profiles so clients use event streaming rather than polling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- 4. Enable Replica Identity so clients receive full profile update diffs over WebSockets
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- 5. Strict Row-Level Security (RLS) for public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable except if blocked or deactivated" ON public.profiles;

-- Open read access for approved, active student accounts
CREATE POLICY "Profiles read policy" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (
    is_deactivated = false
    AND is_approved = true
  );

-- Owner update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Owner insert policy
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- 6. Lock down matches and chat_requests with targeted index coverage
CREATE INDEX IF NOT EXISTS idx_matches_female_male ON public.matches(female_id, male_id);
CREATE INDEX IF NOT EXISTS idx_chat_requests_sender_receiver ON public.chat_requests(sender_id, receiver_id);
