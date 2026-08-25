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

