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
