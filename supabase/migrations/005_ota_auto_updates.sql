-- ==============================================================================
-- 005_ota_auto_updates.sql
-- Live Over-The-Air (OTA) Code & Patch Synchronization for Jadavpur Love Birds
-- Supports Admin Push & Peer-to-Peer Gossip Hot-Patching
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.app_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  build_hash TEXT UNIQUE NOT NULL,
  commit_message TEXT DEFAULT 'Live campus code update',
  patch_bundle JSONB NOT NULL,
  bundle_size INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.app_updates ENABLE ROW LEVEL SECURITY;

-- Allow public read access so student clients can pull patches
DROP POLICY IF EXISTS "Allow public read app_updates" ON public.app_updates;
CREATE POLICY "Allow public read app_updates"
  ON public.app_updates FOR SELECT
  USING (true);

-- Allow authenticated/admin inserts and updates
DROP POLICY IF EXISTS "Allow all insert app_updates" ON public.app_updates;
CREATE POLICY "Allow all insert app_updates"
  ON public.app_updates FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for fast version lookup
CREATE INDEX IF NOT EXISTS idx_app_updates_active ON public.app_updates(is_active, created_at DESC);
