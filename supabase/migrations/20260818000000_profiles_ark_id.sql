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
