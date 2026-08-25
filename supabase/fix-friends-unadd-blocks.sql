-- Friendship + blocks: unfriend both sides, mutual messaging, block prevents add-back.

-- Bidirectional unfriend: remove my contact of peer AND their contact of me.
CREATE OR REPLACE FUNCTION public.unfriend_ark_peer(p_peer_ark_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id text;
  peer_raw text := upper(trim(p_peer_ark_id));
  peer_uid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT ark_id INTO my_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  IF my_id IS NULL OR length(trim(my_id)) = 0 THEN
    RAISE EXCEPTION 'Missing ARK ID';
  END IF;

  -- Drop my rows for this peer (DEV alias + digits).
  DELETE FROM public.ark_contacts
  WHERE owner_id = auth.uid()
    AND (
      peer_ark_id = p_peer_ark_id
      OR upper(trim(peer_ark_id)) = peer_raw
    );

  -- Resolve peer user id (supports DEV).
  SELECT p.id INTO peer_uid
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.ark_id = p_peer_ark_id
     OR upper(trim(p.ark_id)) = peer_raw
     OR (
       peer_raw = 'DEV'
       AND lower(u.email) = 'thomaskrishnan0107@gmail.com'
     )
  LIMIT 1;

  IF peer_uid IS NOT NULL THEN
    DELETE FROM public.ark_contacts
    WHERE owner_id = peer_uid
      AND (
        peer_ark_id = my_id
        OR upper(trim(peer_ark_id)) = upper(trim(my_id))
      );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unfriend_ark_peer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unfriend_ark_peer(text) TO authenticated;

-- True only when both users have each other in ark_contacts.
CREATE OR REPLACE FUNCTION public.are_mutual_ark_friends(p_peer_ark_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id text;
  peer_raw text := upper(trim(p_peer_ark_id));
  peer_uid uuid;
  i_have boolean := false;
  they_have boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT ark_id INTO my_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  IF my_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ark_contacts
    WHERE owner_id = auth.uid()
      AND (
        peer_ark_id = p_peer_ark_id
        OR upper(trim(peer_ark_id)) = peer_raw
      )
  ) INTO i_have;

  IF NOT i_have THEN
    RETURN false;
  END IF;

  SELECT p.id INTO peer_uid
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.ark_id = p_peer_ark_id
     OR upper(trim(p.ark_id)) = peer_raw
     OR (
       peer_raw = 'DEV'
       AND lower(u.email) = 'thomaskrishnan0107@gmail.com'
     )
  LIMIT 1;

  IF peer_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ark_contacts
    WHERE owner_id = peer_uid
      AND (
        peer_ark_id = my_id
        OR upper(trim(peer_ark_id)) = upper(trim(my_id))
      )
  ) INTO they_have;

  RETURN they_have;
END;
$$;

REVOKE ALL ON FUNCTION public.are_mutual_ark_friends(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.are_mutual_ark_friends(text) TO authenticated;

-- Blocks (owner blocked this ARK ID).
CREATE TABLE IF NOT EXISTS public.ark_blocks (
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_ark_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, blocked_ark_id)
);

ALTER TABLE public.ark_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ark_blocks_select" ON public.ark_blocks;
CREATE POLICY "ark_blocks_select" ON public.ark_blocks FOR SELECT
  TO authenticated USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "ark_blocks_insert" ON public.ark_blocks;
CREATE POLICY "ark_blocks_insert" ON public.ark_blocks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "ark_blocks_delete" ON public.ark_blocks;
CREATE POLICY "ark_blocks_delete" ON public.ark_blocks FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.block_ark_peer(p_peer_ark_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  INSERT INTO public.ark_blocks (owner_id, blocked_ark_id)
  VALUES (auth.uid(), trim(p_peer_ark_id))
  ON CONFLICT DO NOTHING;
  -- Also unfriend both ways.
  PERFORM public.unfriend_ark_peer(p_peer_ark_id);
END;
$$;

REVOKE ALL ON FUNCTION public.block_ark_peer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_ark_peer(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_ark_peer(p_peer_ark_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  DELETE FROM public.ark_blocks
  WHERE owner_id = auth.uid()
    AND (
      blocked_ark_id = p_peer_ark_id
      OR upper(trim(blocked_ark_id)) = upper(trim(p_peer_ark_id))
    );
END;
$$;

REVOKE ALL ON FUNCTION public.unblock_ark_peer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unblock_ark_peer(text) TO authenticated;

-- True if the target ARK user has blocked the caller (so caller cannot add them).
CREATE OR REPLACE FUNCTION public.is_blocked_from_adding(p_target_ark_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id text;
  target_raw text := upper(trim(p_target_ark_id));
  target_uid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT ark_id INTO my_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  IF my_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.id INTO target_uid
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.ark_id = p_target_ark_id
     OR upper(trim(p.ark_id)) = target_raw
     OR (
       target_raw = 'DEV'
       AND lower(u.email) = 'thomaskrishnan0107@gmail.com'
     )
  LIMIT 1;

  IF target_uid IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.ark_blocks
    WHERE owner_id = target_uid
      AND (
        blocked_ark_id = my_id
        OR upper(trim(blocked_ark_id)) = upper(trim(my_id))
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_blocked_from_adding(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_blocked_from_adding(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
