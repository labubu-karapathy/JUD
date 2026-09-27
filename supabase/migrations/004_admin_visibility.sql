-- Allow reading all profiles so Admin Dashboard can inspect pending approvals & deactivated accounts
DROP POLICY IF EXISTS "Profiles viewable except if blocked or deactivated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles viewable except if blocked" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select policy" ON public.profiles;

CREATE POLICY "Profiles select policy" ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (true);
