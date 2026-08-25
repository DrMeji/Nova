-- ARK full bootstrap (safe to re-run). Project: mjheezjqwqbhkcmwredq

-- ===== supabase\migrations\20260810153956_ark_core_schema.sql =====
/*
# ARK Core Schema — Profiles, Projects, Provider Connections, Model Catalog, Settings

Creates the foundational database tables for the ARK AI Creation Studio web application.

1. New Tables
- `profiles` — user profile data (display name, avatar) linked to auth.users
- `projects` — user-created projects with name, type, description, status, and build state
- `provider_connections` — metadata about which AI providers a user has connected (NOT raw API keys)
- `model_catalog` — shared catalog of available AI models (local + cloud) with capabilities
- `user_settings` — per-user application settings (appearance, AI mode, privacy toggles)
- `chat_messages` — AI chat conversation history per project

2. Security
- RLS enabled on all tables
- profiles: owner-scoped (user can read/update only their own profile)
- projects, provider_connections, user_settings, chat_messages: owner-scoped CRUD
- model_catalog: readable by all authenticated users (shared catalog), no writes from frontend

3. Notes
- All owner columns default to auth.uid() so frontend inserts omitting user_id succeed
- provider_connections stores connection status/metadata only — never raw API keys
- model_catalog is seeded with known legitimate provider models
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  project_type text NOT NULL DEFAULT 'web',
  status text NOT NULL DEFAULT 'idle',
  build_status text NOT NULL DEFAULT 'idle',
  last_prompt text,
  agent_state jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_projects" ON projects;
CREATE POLICY "select_own_projects" ON projects FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_projects" ON projects;
CREATE POLICY "insert_own_projects" ON projects FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_projects" ON projects;
CREATE POLICY "update_own_projects" ON projects FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_projects" ON projects;
CREATE POLICY "delete_own_projects" ON projects FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Provider connections table (metadata only, no raw keys)
CREATE TABLE IF NOT EXISTS provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id text NOT NULL,
  provider_name text NOT NULL,
  status text NOT NULL DEFAULT 'available',
  connected_at timestamptz,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider_id)
);

ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_connections" ON provider_connections;
CREATE POLICY "select_own_connections" ON provider_connections FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_connections" ON provider_connections;
CREATE POLICY "insert_own_connections" ON provider_connections FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_connections" ON provider_connections;
CREATE POLICY "update_own_connections" ON provider_connections FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_connections" ON provider_connections;
CREATE POLICY "delete_own_connections" ON provider_connections FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Model catalog (shared, read-only for users)
CREATE TABLE IF NOT EXISTS model_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,
  name text NOT NULL,
  provider text NOT NULL,
  source text NOT NULL,
  context_length integer,
  coding boolean NOT NULL DEFAULT false,
  vision boolean NOT NULL DEFAULT false,
  reasoning boolean NOT NULL DEFAULT false,
  tool_calling boolean NOT NULL DEFAULT false,
  local_supported boolean NOT NULL DEFAULT false,
  license text,
  model_size text,
  quantization text,
  category text NOT NULL DEFAULT 'general',
  status text NOT NULL DEFAULT 'available',
  is_recommended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE model_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_model_catalog" ON model_catalog;
CREATE POLICY "read_model_catalog" ON model_catalog FOR SELECT
  TO authenticated USING (true);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text NOT NULL DEFAULT 'dark',
  ai_mode text NOT NULL DEFAULT 'automatic',
  keep_files_local boolean NOT NULL DEFAULT true,
  allow_cloud_sync boolean NOT NULL DEFAULT false,
  send_diagnostics boolean NOT NULL DEFAULT false,
  preferred_language text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_settings" ON user_settings;
CREATE POLICY "select_own_settings" ON user_settings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_settings" ON user_settings;
CREATE POLICY "insert_own_settings" ON user_settings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_settings" ON user_settings;
CREATE POLICY "update_own_settings" ON user_settings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_settings" ON user_settings;
CREATE POLICY "delete_own_settings" ON user_settings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  provider_used text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_messages" ON chat_messages;
CREATE POLICY "select_own_messages" ON chat_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_messages" ON chat_messages;
CREATE POLICY "insert_own_messages" ON chat_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_messages" ON chat_messages;
CREATE POLICY "delete_own_messages" ON chat_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_provider_connections_user_id ON provider_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_project_id ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== supabase\migrations\20260818000000_profiles_ark_id.sql =====
-- Unique 7-digit ARK ID on each profile so people can add each other
-- without sharing email. Lookup RPC returns name only — never email.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ark_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_ark_id_unique
  ON profiles (ark_id)
  WHERE ark_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.lookup_ark_user(p_ark_id text)
RETURNS TABLE (ark_id text, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.ark_id, p.display_name
  FROM public.profiles p
  WHERE p.ark_id = p_ark_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_ark_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_ark_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_ark_user(text) TO anon;


-- ===== supabase\migrations\20260818010000_ark_social.sql =====
-- ARK social: add by 7-digit ID, post work, message, and call signaling.

CREATE OR REPLACE FUNCTION public.my_ark_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ark_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_ark_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_ark_id() TO authenticated;

CREATE TABLE IF NOT EXISTS public.ark_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  peer_ark_id text NOT NULL,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, peer_ark_id)
);

ALTER TABLE public.ark_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ark_contacts_select" ON public.ark_contacts;
CREATE POLICY "ark_contacts_select" ON public.ark_contacts FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);
DROP POLICY IF EXISTS "ark_contacts_insert" ON public.ark_contacts;
CREATE POLICY "ark_contacts_insert" ON public.ark_contacts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "ark_contacts_delete" ON public.ark_contacts;
CREATE POLICY "ark_contacts_delete" ON public.ark_contacts FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.ark_network_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_ark_id text NOT NULL,
  owner_name text,
  title text NOT NULL,
  summary text,
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  github_url text,
  allowed_ark_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ark_network_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ark_posts_select" ON public.ark_network_posts;
CREATE POLICY "ark_posts_select" ON public.ark_network_posts FOR SELECT
  TO authenticated USING (
    visibility = 'public'
    OR owner_id = auth.uid()
    OR public.my_ark_id() = ANY (allowed_ark_ids)
  );
DROP POLICY IF EXISTS "ark_posts_insert" ON public.ark_network_posts;
CREATE POLICY "ark_posts_insert" ON public.ark_network_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id AND owner_ark_id = public.my_ark_id());
DROP POLICY IF EXISTS "ark_posts_update" ON public.ark_network_posts;
CREATE POLICY "ark_posts_update" ON public.ark_network_posts FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
DROP POLICY IF EXISTS "ark_posts_delete" ON public.ark_network_posts;
CREATE POLICY "ark_posts_delete" ON public.ark_network_posts FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.ark_direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_ark_id text NOT NULL,
  recipient_ark_id text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ark_dm_thread_idx
  ON public.ark_direct_messages (sender_ark_id, recipient_ark_id, created_at);

ALTER TABLE public.ark_direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ark_dm_select" ON public.ark_direct_messages;
CREATE POLICY "ark_dm_select" ON public.ark_direct_messages FOR SELECT
  TO authenticated USING (
    sender_ark_id = public.my_ark_id() OR recipient_ark_id = public.my_ark_id()
  );
DROP POLICY IF EXISTS "ark_dm_insert" ON public.ark_direct_messages;
CREATE POLICY "ark_dm_insert" ON public.ark_direct_messages FOR INSERT
  TO authenticated WITH CHECK (sender_ark_id = public.my_ark_id());

CREATE TABLE IF NOT EXISTS public.ark_call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_ark_id text NOT NULL,
  to_ark_id text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ark_call_to_idx
  ON public.ark_call_signals (to_ark_id, created_at DESC);

ALTER TABLE public.ark_call_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ark_call_select" ON public.ark_call_signals;
CREATE POLICY "ark_call_select" ON public.ark_call_signals FOR SELECT
  TO authenticated USING (
    from_ark_id = public.my_ark_id() OR to_ark_id = public.my_ark_id()
  );
DROP POLICY IF EXISTS "ark_call_insert" ON public.ark_call_signals;
CREATE POLICY "ark_call_insert" ON public.ark_call_signals FOR INSERT
  TO authenticated WITH CHECK (from_ark_id = public.my_ark_id());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ark_direct_messages;
EXCEPTION WHEN duplicate_object THEN
  NULL;
WHEN undefined_object THEN
  NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ark_call_signals;
EXCEPTION WHEN duplicate_object THEN
  NULL;
WHEN undefined_object THEN
  NULL;
END $$;


-- ===== supabase\migrations\20260824100000_ark_friend_requests.sql =====
-- Cross-device friend requests + stronger call signaling.

CREATE TABLE IF NOT EXISTS public.ark_friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_ark_id text NOT NULL,
  to_ark_id text NOT NULL,
  from_name text,
  from_avatar_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ark_fr_pending_pair_idx
  ON public.ark_friend_requests (from_ark_id, to_ark_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS ark_fr_to_idx
  ON public.ark_friend_requests (to_ark_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS ark_fr_from_idx
  ON public.ark_friend_requests (from_ark_id, status, created_at DESC);

ALTER TABLE public.ark_friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ark_fr_select" ON public.ark_friend_requests;
CREATE POLICY "ark_fr_select" ON public.ark_friend_requests FOR SELECT
  TO authenticated USING (
    from_ark_id = public.my_ark_id() OR to_ark_id = public.my_ark_id()
  );

DROP POLICY IF EXISTS "ark_fr_insert" ON public.ark_friend_requests;
CREATE POLICY "ark_fr_insert" ON public.ark_friend_requests FOR INSERT
  TO authenticated WITH CHECK (from_ark_id = public.my_ark_id());

DROP POLICY IF EXISTS "ark_fr_update" ON public.ark_friend_requests;
CREATE POLICY "ark_fr_update" ON public.ark_friend_requests FOR UPDATE
  TO authenticated USING (
    to_ark_id = public.my_ark_id() OR from_ark_id = public.my_ark_id()
  ) WITH CHECK (
    to_ark_id = public.my_ark_id() OR from_ark_id = public.my_ark_id()
  );

CREATE OR REPLACE FUNCTION public.accept_ark_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.ark_friend_requests%ROWTYPE;
  from_user_id uuid;
  to_user_id uuid;
  from_name text;
  to_name text;
BEGIN
  SELECT * INTO req FROM public.ark_friend_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' THEN
    RETURN;
  END IF;
  IF req.to_ark_id <> public.my_ark_id() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.ark_friend_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id;

  SELECT id, COALESCE(display_name, ark_id) INTO from_user_id, from_name
  FROM public.profiles WHERE ark_id = req.from_ark_id LIMIT 1;
  SELECT id, COALESCE(display_name, ark_id) INTO to_user_id, to_name
  FROM public.profiles WHERE ark_id = req.to_ark_id LIMIT 1;

  IF to_user_id IS NOT NULL AND from_user_id IS NOT NULL THEN
    INSERT INTO public.ark_contacts (owner_id, peer_ark_id, display_name)
    VALUES (to_user_id, req.from_ark_id, COALESCE(req.from_name, req.from_ark_id))
    ON CONFLICT (owner_id, peer_ark_id) DO UPDATE SET display_name = EXCLUDED.display_name;

    INSERT INTO public.ark_contacts (owner_id, peer_ark_id, display_name)
    VALUES (from_user_id, req.to_ark_id, COALESCE(to_name, req.to_ark_id))
    ON CONFLICT (owner_id, peer_ark_id) DO UPDATE SET display_name = EXCLUDED.display_name;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_ark_friend_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_ark_friend_request(uuid) TO authenticated;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ark_friend_requests;
EXCEPTION WHEN duplicate_object THEN
  NULL;
WHEN undefined_object THEN
  NULL;
END $$;

-- WebRTC negotiation signals (offer/answer/ice/accept) persist for offline catch-up.
CREATE INDEX IF NOT EXISTS ark_call_pair_recent_idx
  ON public.ark_call_signals (to_ark_id, from_ark_id, created_at DESC);


-- ===== supabase\migrations\20260824120000_avatar_lookup.sql =====
-- Expose avatar_url via ARK ID lookup (name + photo only â€” never email).

DROP FUNCTION IF EXISTS public.lookup_ark_user(text);

CREATE OR REPLACE FUNCTION public.lookup_ark_user(p_ark_id text)
RETURNS TABLE (ark_id text, display_name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.ark_id, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.ark_id = p_ark_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_ark_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_ark_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_ark_user(text) TO anon;

ALTER TABLE public.ark_contacts
  ADD COLUMN IF NOT EXISTS peer_avatar_url text;

CREATE OR REPLACE FUNCTION public.accept_ark_friend_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.ark_friend_requests%ROWTYPE;
  from_user_id uuid;
  to_user_id uuid;
  from_name text;
  to_name text;
BEGIN
  SELECT * INTO req FROM public.ark_friend_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR req.status <> 'pending' THEN
    RETURN;
  END IF;
  IF req.to_ark_id <> public.my_ark_id() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.ark_friend_requests
  SET status = 'accepted', updated_at = now()
  WHERE id = p_request_id;

  SELECT id, COALESCE(display_name, ark_id) INTO from_user_id, from_name
  FROM public.profiles WHERE ark_id = req.from_ark_id LIMIT 1;
  SELECT id, COALESCE(display_name, ark_id) INTO to_user_id, to_name
  FROM public.profiles WHERE ark_id = req.to_ark_id LIMIT 1;

  IF to_user_id IS NOT NULL AND from_user_id IS NOT NULL THEN
    INSERT INTO public.ark_contacts (owner_id, peer_ark_id, display_name, peer_avatar_url)
    VALUES (to_user_id, req.from_ark_id, COALESCE(req.from_name, req.from_ark_id), req.from_avatar_url)
    ON CONFLICT (owner_id, peer_ark_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          peer_avatar_url = COALESCE(EXCLUDED.peer_avatar_url, public.ark_contacts.peer_avatar_url);

    INSERT INTO public.ark_contacts (owner_id, peer_ark_id, display_name, peer_avatar_url)
    VALUES (
      from_user_id,
      req.to_ark_id,
      COALESCE(to_name, req.to_ark_id),
      (SELECT avatar_url FROM public.profiles WHERE id = to_user_id LIMIT 1)
    )
    ON CONFLICT (owner_id, peer_ark_id) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          peer_avatar_url = COALESCE(EXCLUDED.peer_avatar_url, public.ark_contacts.peer_avatar_url);
  END IF;
END;
$$;



NOTIFY pgrst, 'reload schema';
