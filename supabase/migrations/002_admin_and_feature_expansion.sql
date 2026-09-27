-- 1. Extend public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS grad_year INT,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approval_comment TEXT,
  ADD COLUMN IF NOT EXISTS is_deactivated BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT,
  ADD COLUMN IF NOT EXISTS active_chat_count INT DEFAULT 0;

-- 2. Chat Request Gate (Female-First DM approval)
CREATE TABLE IF NOT EXISTS public.chat_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT CHECK (status IN ('pending', 'accepted', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- 3. Global Announcements Table
CREATE TABLE IF NOT EXISTS public.global_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  type TEXT CHECK (type IN ('admin_broadcast', 'user_deactivation', 'system')) DEFAULT 'admin_broadcast',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Admin Credentials & Passkey Storage (WebAuthn credentials)
CREATE TABLE IF NOT EXISTS public.admin_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  device_label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Atomic Chat Counter Trigger
CREATE OR REPLACE FUNCTION public.handle_chat_count_delta()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET active_chat_count = active_chat_count + 1 WHERE id IN (NEW.female_id, NEW.male_id);
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET active_chat_count = GREATEST(0, active_chat_count - 1) WHERE id IN (OLD.female_id, OLD.male_id);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_chat_count_delta ON public.matches;
CREATE TRIGGER tr_chat_count_delta
AFTER INSERT OR DELETE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.handle_chat_count_delta();

-- 6. Row Level Security Updates
ALTER TABLE public.chat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_passkeys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of announcements" ON public.global_announcements
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow participants to view chat requests" ON public.chat_requests
  FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Allow users to insert chat requests" ON public.chat_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Allow receivers to update chat request status" ON public.chat_requests
  FOR UPDATE TO authenticated USING (auth.uid() = receiver_id);

-- Enforce Deactivation Invisibility
DROP POLICY IF EXISTS "Profiles viewable except if blocked" ON public.profiles;
CREATE POLICY "Profiles viewable except if blocked or deactivated" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    is_deactivated = false
    AND is_approved = true
    AND id NOT IN (SELECT blocked_id FROM public.blocks WHERE blocker_id = auth.uid())
    AND id NOT IN (SELECT blocker_id FROM public.blocks WHERE blocked_id = auth.uid())
  );
