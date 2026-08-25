-- Immediate self-serve account deletion (no waiting period).
-- Run once in Supabase SQL Editor for project mjheezjqwqbhkcmwredq.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  my_id text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT ark_id INTO my_id FROM public.profiles WHERE id = uid LIMIT 1;

  IF my_id IS NOT NULL THEN
    DELETE FROM public.ark_friend_requests
    WHERE from_ark_id = my_id OR to_ark_id = my_id;
    DELETE FROM public.ark_direct_messages
    WHERE sender_ark_id = my_id OR recipient_ark_id = my_id;
    DELETE FROM public.ark_call_signals
    WHERE from_ark_id = my_id OR to_ark_id = my_id;
    DELETE FROM public.ark_contacts
    WHERE peer_ark_id = my_id;
  END IF;

  -- Remaining owner-scoped rows cascade from auth.users / profiles.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
