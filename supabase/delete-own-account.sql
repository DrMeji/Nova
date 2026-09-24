-- Immediate self-serve account deletion (no waiting period).
-- Run AFTER the beta wipe / nova_id migration.

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

  SELECT nova_id INTO my_id FROM public.profiles WHERE id = uid LIMIT 1;

  IF my_id IS NOT NULL THEN
    BEGIN
      DELETE FROM public.nova_friend_requests
      WHERE from_nova_id = my_id OR to_nova_id = my_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM public.nova_direct_messages
      WHERE sender_nova_id = my_id OR recipient_nova_id = my_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM public.nova_contacts WHERE peer_nova_id = my_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM public.nova_blocks WHERE blocked_nova_id = my_id OR owner_id = uid;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

    BEGIN
      DELETE FROM public.nova_call_signals
      WHERE from_nova_id = my_id OR to_nova_id = my_id;
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END IF;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;

NOTIFY pgrst, 'reload schema';
