-- NOVA beta wipe + full ark → nova rename (idempotent; skips missing tables).
-- Paste ALL of this into Supabase SQL Editor and Run once.
-- Project: https://supabase.com/dashboard/project/mjheezjqwqbhkcmwredq/sql/new

-- ═══════════════════════════════════════════════════════════
-- 1) Wipe every account (beta clean slate)
-- ═══════════════════════════════════════════════════════════
DELETE FROM auth.users;

-- ═══════════════════════════════════════════════════════════
-- 2) Drop ALL policies that depend on my_ark_id() FIRST
--    Only touches tables that actually exist (via pg_policies).
-- ═══════════════════════════════════════════════════════════
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'ark_%'
        OR tablename LIKE 'nova_%'
        OR policyname LIKE 'ark_%'
        OR policyname LIKE 'nova_%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Now safe to drop the old helpers
DROP FUNCTION IF EXISTS public.my_ark_id() CASCADE;
DROP FUNCTION IF EXISTS public.lookup_ark_user(text) CASCADE;
DROP FUNCTION IF EXISTS public.schedule_own_account_deletion(integer) CASCADE;
DROP FUNCTION IF EXISTS public.cancel_own_account_deletion() CASCADE;

-- ═══════════════════════════════════════════════════════════
-- 3) profiles.ark_id → nova_id
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ark_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'nova_id'
  ) THEN
    ALTER TABLE public.profiles RENAME COLUMN ark_id TO nova_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ark_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'nova_id'
  ) THEN
    UPDATE public.profiles SET nova_id = COALESCE(nova_id, ark_id) WHERE nova_id IS NULL;
    ALTER TABLE public.profiles DROP COLUMN ark_id;
  END IF;
END $$;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS delete_scheduled_at;

-- ═══════════════════════════════════════════════════════════
-- 4) my_nova_id()
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.my_nova_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT nova_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_nova_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_nova_id() TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 5) Rename social tables + columns ark_* → nova_*
-- ═══════════════════════════════════════════════════════════
DO $$
BEGIN
  -- friend requests
  IF to_regclass('public.ark_friend_requests') IS NOT NULL AND to_regclass('public.nova_friend_requests') IS NULL THEN
    ALTER TABLE public.ark_friend_requests RENAME TO nova_friend_requests;
  END IF;
  IF to_regclass('public.nova_friend_requests') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_friend_requests' AND column_name='from_ark_id') THEN
      ALTER TABLE public.nova_friend_requests RENAME COLUMN from_ark_id TO from_nova_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_friend_requests' AND column_name='to_ark_id') THEN
      ALTER TABLE public.nova_friend_requests RENAME COLUMN to_ark_id TO to_nova_id;
    END IF;
  END IF;

  -- contacts
  IF to_regclass('public.ark_contacts') IS NOT NULL AND to_regclass('public.nova_contacts') IS NULL THEN
    ALTER TABLE public.ark_contacts RENAME TO nova_contacts;
  END IF;
  IF to_regclass('public.nova_contacts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_contacts' AND column_name='peer_ark_id') THEN
      ALTER TABLE public.nova_contacts RENAME COLUMN peer_ark_id TO peer_nova_id;
    END IF;
  END IF;

  -- blocks
  IF to_regclass('public.ark_blocks') IS NOT NULL AND to_regclass('public.nova_blocks') IS NULL THEN
    ALTER TABLE public.ark_blocks RENAME TO nova_blocks;
  END IF;
  IF to_regclass('public.nova_blocks') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_blocks' AND column_name='blocked_ark_id') THEN
      ALTER TABLE public.nova_blocks RENAME COLUMN blocked_ark_id TO blocked_nova_id;
    END IF;
  END IF;

  -- DMs
  IF to_regclass('public.ark_direct_messages') IS NOT NULL AND to_regclass('public.nova_direct_messages') IS NULL THEN
    ALTER TABLE public.ark_direct_messages RENAME TO nova_direct_messages;
  END IF;
  IF to_regclass('public.nova_direct_messages') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_direct_messages' AND column_name='sender_ark_id') THEN
      ALTER TABLE public.nova_direct_messages RENAME COLUMN sender_ark_id TO sender_nova_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_direct_messages' AND column_name='recipient_ark_id') THEN
      ALTER TABLE public.nova_direct_messages RENAME COLUMN recipient_ark_id TO recipient_nova_id;
    END IF;
  END IF;

  -- network posts
  IF to_regclass('public.ark_network_posts') IS NOT NULL AND to_regclass('public.nova_network_posts') IS NULL THEN
    ALTER TABLE public.ark_network_posts RENAME TO nova_network_posts;
  END IF;
  IF to_regclass('public.nova_network_posts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_network_posts' AND column_name='owner_ark_id') THEN
      ALTER TABLE public.nova_network_posts RENAME COLUMN owner_ark_id TO owner_nova_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_network_posts' AND column_name='allowed_ark_ids') THEN
      ALTER TABLE public.nova_network_posts RENAME COLUMN allowed_ark_ids TO allowed_nova_ids;
    END IF;
  END IF;

  -- call signals
  IF to_regclass('public.ark_call_signals') IS NOT NULL AND to_regclass('public.nova_call_signals') IS NULL THEN
    ALTER TABLE public.ark_call_signals RENAME TO nova_call_signals;
  END IF;
  IF to_regclass('public.nova_call_signals') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_call_signals' AND column_name='from_ark_id') THEN
      ALTER TABLE public.nova_call_signals RENAME COLUMN from_ark_id TO from_nova_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='nova_call_signals' AND column_name='to_ark_id') THEN
      ALTER TABLE public.nova_call_signals RENAME COLUMN to_ark_id TO to_nova_id;
    END IF;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 6) Recreate RLS policies under Nova names (using my_nova_id)
-- ═══════════════════════════════════════════════════════════

-- Friend requests
DO $$ BEGIN
  IF to_regclass('public.nova_friend_requests') IS NOT NULL THEN
    ALTER TABLE public.nova_friend_requests ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nova_fr_select" ON public.nova_friend_requests;
    DROP POLICY IF EXISTS "nova_fr_insert" ON public.nova_friend_requests;
    DROP POLICY IF EXISTS "nova_fr_update" ON public.nova_friend_requests;
    CREATE POLICY "nova_fr_select" ON public.nova_friend_requests FOR SELECT
      TO authenticated USING (from_nova_id = public.my_nova_id() OR to_nova_id = public.my_nova_id());
    CREATE POLICY "nova_fr_insert" ON public.nova_friend_requests FOR INSERT
      TO authenticated WITH CHECK (from_nova_id = public.my_nova_id());
    CREATE POLICY "nova_fr_update" ON public.nova_friend_requests FOR UPDATE
      TO authenticated
      USING (to_nova_id = public.my_nova_id())
      WITH CHECK (to_nova_id = public.my_nova_id());
  END IF;
END $$;

-- Contacts
DO $$ BEGIN
  IF to_regclass('public.nova_contacts') IS NOT NULL THEN
    ALTER TABLE public.nova_contacts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nova_contacts_select" ON public.nova_contacts;
    DROP POLICY IF EXISTS "nova_contacts_insert" ON public.nova_contacts;
    DROP POLICY IF EXISTS "nova_contacts_delete" ON public.nova_contacts;
    CREATE POLICY "nova_contacts_select" ON public.nova_contacts FOR SELECT
      TO authenticated USING (auth.uid() = owner_id);
    CREATE POLICY "nova_contacts_insert" ON public.nova_contacts FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = owner_id);
    CREATE POLICY "nova_contacts_delete" ON public.nova_contacts FOR DELETE
      TO authenticated USING (auth.uid() = owner_id);
  END IF;
END $$;

-- Blocks
DO $$ BEGIN
  IF to_regclass('public.nova_blocks') IS NOT NULL THEN
    ALTER TABLE public.nova_blocks ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nova_blocks_select" ON public.nova_blocks;
    DROP POLICY IF EXISTS "nova_blocks_insert" ON public.nova_blocks;
    DROP POLICY IF EXISTS "nova_blocks_delete" ON public.nova_blocks;
    CREATE POLICY "nova_blocks_select" ON public.nova_blocks FOR SELECT
      TO authenticated USING (auth.uid() = owner_id);
    CREATE POLICY "nova_blocks_insert" ON public.nova_blocks FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = owner_id);
    CREATE POLICY "nova_blocks_delete" ON public.nova_blocks FOR DELETE
      TO authenticated USING (auth.uid() = owner_id);
  END IF;
END $$;

-- Direct messages
DO $$ BEGIN
  IF to_regclass('public.nova_direct_messages') IS NOT NULL THEN
    ALTER TABLE public.nova_direct_messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nova_dm_select" ON public.nova_direct_messages;
    DROP POLICY IF EXISTS "nova_dm_insert" ON public.nova_direct_messages;
    CREATE POLICY "nova_dm_select" ON public.nova_direct_messages FOR SELECT
      TO authenticated USING (sender_nova_id = public.my_nova_id() OR recipient_nova_id = public.my_nova_id());
    CREATE POLICY "nova_dm_insert" ON public.nova_direct_messages FOR INSERT
      TO authenticated WITH CHECK (sender_nova_id = public.my_nova_id());
  END IF;
END $$;

-- Network posts
DO $$ BEGIN
  IF to_regclass('public.nova_network_posts') IS NOT NULL THEN
    ALTER TABLE public.nova_network_posts ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nova_posts_select" ON public.nova_network_posts;
    DROP POLICY IF EXISTS "nova_posts_insert" ON public.nova_network_posts;
    DROP POLICY IF EXISTS "nova_posts_update" ON public.nova_network_posts;
    DROP POLICY IF EXISTS "nova_posts_delete" ON public.nova_network_posts;
    CREATE POLICY "nova_posts_select" ON public.nova_network_posts FOR SELECT
      TO authenticated USING (
        visibility = 'public'
        OR owner_id = auth.uid()
        OR public.my_nova_id() = ANY (allowed_nova_ids)
      );
    CREATE POLICY "nova_posts_insert" ON public.nova_network_posts FOR INSERT
      TO authenticated WITH CHECK (auth.uid() = owner_id AND owner_nova_id = public.my_nova_id());
    CREATE POLICY "nova_posts_update" ON public.nova_network_posts FOR UPDATE
      TO authenticated USING (auth.uid() = owner_id);
    CREATE POLICY "nova_posts_delete" ON public.nova_network_posts FOR DELETE
      TO authenticated USING (auth.uid() = owner_id);
  END IF;
END $$;

-- Call signals
DO $$ BEGIN
  IF to_regclass('public.nova_call_signals') IS NOT NULL THEN
    ALTER TABLE public.nova_call_signals ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "nova_call_select" ON public.nova_call_signals;
    DROP POLICY IF EXISTS "nova_call_insert" ON public.nova_call_signals;
    CREATE POLICY "nova_call_select" ON public.nova_call_signals FOR SELECT
      TO authenticated USING (from_nova_id = public.my_nova_id() OR to_nova_id = public.my_nova_id());
    CREATE POLICY "nova_call_insert" ON public.nova_call_signals FOR INSERT
      TO authenticated WITH CHECK (from_nova_id = public.my_nova_id());
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 7) lookup_nova_user
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.lookup_nova_user(p_nova_id text)
RETURNS TABLE (nova_id text, display_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.nova_id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.nova_id = p_nova_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_nova_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_nova_user(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Done. Auth → Users should be empty. Sign up fresh in Nova next.
