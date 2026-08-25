-- Push my current display name + avatar into every friend's ark_contacts row.
CREATE OR REPLACE FUNCTION public.broadcast_my_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  my_id text;
  my_name text;
  my_avatar text;
BEGIN
  SELECT ark_id, display_name, avatar_url
  INTO my_id, my_name, my_avatar
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;

  IF my_id IS NULL OR length(trim(my_id)) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.ark_contacts
  SET
    display_name = COALESCE(NULLIF(trim(my_name), ''), my_id),
    peer_avatar_url = my_avatar
  WHERE peer_ark_id = my_id;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.broadcast_my_profile() TO authenticated;
