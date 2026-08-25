-- Allow looking up the developer account by typing DEV (as well as their 7-digit ARK ID).
DROP FUNCTION IF EXISTS public.lookup_ark_user(text);

CREATE OR REPLACE FUNCTION public.lookup_ark_user(p_ark_id text)
RETURNS TABLE (ark_id text, display_name text, avatar_url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.ark_id, p.display_name, p.avatar_url
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
