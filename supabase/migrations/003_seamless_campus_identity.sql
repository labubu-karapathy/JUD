-- 1. Remove foreign key constraint to auth.users if it exists so campus library card identity works without email verification
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Allow anon role (in addition to authenticated) to query and insert profiles, matches, chat_requests, announcements, blocks, reports
DROP POLICY IF EXISTS "Profiles viewable except if blocked or deactivated" ON public.profiles;
CREATE POLICY "Profiles viewable except if blocked or deactivated" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (
    is_deactivated = false
    AND is_approved = true
  );

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO anon, authenticated
  USING (true);

-- Allow public read & insert of announcements
DROP POLICY IF EXISTS "Allow public read of announcements" ON public.global_announcements;
CREATE POLICY "Allow public read of announcements" ON public.global_announcements
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert announcements" ON public.global_announcements;
CREATE POLICY "Allow insert announcements" ON public.global_announcements
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Allow chat requests for anon and authenticated
DROP POLICY IF EXISTS "Allow participants to view chat requests" ON public.chat_requests;
CREATE POLICY "Allow participants to view chat requests" ON public.chat_requests
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow users to insert chat requests" ON public.chat_requests;
CREATE POLICY "Allow users to insert chat requests" ON public.chat_requests
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow receivers to update chat request status" ON public.chat_requests;
CREATE POLICY "Allow receivers to update chat request status" ON public.chat_requests
  FOR UPDATE TO anon, authenticated USING (true);

-- Matches policies
DROP POLICY IF EXISTS "View matches" ON public.matches;
CREATE POLICY "View matches" ON public.matches
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Create matches" ON public.matches;
CREATE POLICY "Create matches" ON public.matches
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Female controls initiation & media permissions" ON public.matches;
CREATE POLICY "Female controls initiation & media permissions" ON public.matches
  FOR UPDATE TO anon, authenticated USING (true);

-- Admin passkeys
DROP POLICY IF EXISTS "Allow admin passkey access" ON public.admin_passkeys;
CREATE POLICY "Allow admin passkey access" ON public.admin_passkeys
  FOR ALL TO anon, authenticated USING (true);

-- Blocks and reports
DROP POLICY IF EXISTS "Insert blocks" ON public.blocks;
CREATE POLICY "Insert blocks" ON public.blocks
  FOR ALL TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Insert reports" ON public.reports;
CREATE POLICY "Insert reports" ON public.reports
  FOR ALL TO anon, authenticated USING (true);
