-- Force developer account public ARK ID to the literal DEV (not digits).
-- Friends / DMs / lookups should show DEV for this account only.

DO $$
DECLARE
  uid uuid;
  old_id text;
BEGIN
  SELECT p.id, p.ark_id
  INTO uid, old_id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = 'thomaskrishnan0107@gmail.com'
  LIMIT 1;

  IF uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET ark_id = 'DEV',
      updated_at = now()
  WHERE id = uid;

  IF old_id IS NOT NULL AND old_id <> 'DEV' THEN
    UPDATE public.ark_contacts
    SET peer_ark_id = 'DEV',
        display_name = 'DEV'
    WHERE peer_ark_id = old_id;

    -- Best-effort remap of pending friend-request rows.
    BEGIN
      UPDATE public.ark_friend_requests
      SET from_ark_id = 'DEV'
      WHERE from_ark_id = old_id;
      UPDATE public.ark_friend_requests
      SET to_ark_id = 'DEV'
      WHERE to_ark_id = old_id;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.lookup_ark_user(text);

CREATE OR REPLACE FUNCTION public.lookup_ark_user(p_ark_id text)
RETURNS TABLE (ark_id text, display_name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = p.id AND lower(u.email) = 'thomaskrishnan0107@gmail.com'
      ) THEN 'DEV'
      ELSE p.ark_id
    END AS ark_id,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM auth.users u
        WHERE u.id = p.id AND lower(u.email) = 'thomaskrishnan0107@gmail.com'
      ) THEN 'DEV'
      ELSE p.display_name
    END AS display_name,
    p.avatar_url
  FROM public.profiles p
  WHERE (
    p.ark_id = p_ark_id
    OR (
      upper(trim(p_ark_id)) = 'DEV'
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = p.id
          AND lower(u.email) = 'thomaskrishnan0107@gmail.com'
      )
    )
  )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.lookup_ark_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_ark_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_ark_user(text) TO anon;

NOTIFY pgrst, 'reload schema';
