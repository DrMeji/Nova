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
