-- Keep public ARK ID as DEV for the developer account, but do NOT overwrite
-- their display name (friends should see names like AutoFoot, not "DEV").
-- Run this in the Supabase SQL editor if the migration has not been applied yet.

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
    NULLIF(trim(p.display_name), '') AS display_name,
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

UPDATE public.ark_contacts c
SET
  display_name = COALESCE(NULLIF(trim(p.display_name), ''), c.peer_ark_id),
  peer_avatar_url = COALESCE(p.avatar_url, c.peer_avatar_url)
FROM public.profiles p
WHERE c.peer_ark_id = 'DEV'
  AND p.ark_id = 'DEV'
  AND (
    c.display_name IS NULL
    OR upper(trim(c.display_name)) = 'DEV'
    OR length(trim(c.display_name)) = 0
  );

NOTIFY pgrst, 'reload schema';
