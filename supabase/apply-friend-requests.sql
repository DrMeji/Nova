-- ARK social friend-requests schema (apply in Supabase SQL Editor if missing).
-- Project: mjheezjqwqbhkcmwredq
-- Fixes: "Could not find the table 'public.ark_friend_requests' in the schema cache"

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

NOTIFY pgrst, 'reload schema';
