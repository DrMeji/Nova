-- One-time ARK ID rotation: fresh 7-digit IDs for every account except DEV (stays DEV).
-- Clears pending friend requests so stale cross-ID rows do not linger.
-- DEV account keeps public ID DEV; display name reset to DEV for this release.

CREATE OR REPLACE FUNCTION public._gen_unique_ark_id(exclude_ids text[])
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  candidate text;
  tries int := 0;
BEGIN
  LOOP
    tries := tries + 1;
    IF tries > 200 THEN
      RAISE EXCEPTION 'could not allocate unique ark_id';
    END IF;
    candidate := (1000000 + floor(random() * 9000000)::int)::text;
    IF candidate = ANY (exclude_ids) THEN
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE ark_id = candidate) THEN
      CONTINUE;
    END IF;
    RETURN candidate;
  END LOOP;
END;
$$;

DO $$
DECLARE
  dev_uid uuid;
  rec record;
  old_id text;
  new_id text;
  id_map jsonb := '{}'::jsonb;
  used_ids text[] := ARRAY['DEV'];
BEGIN
  SELECT p.id INTO dev_uid
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = 'thomaskrishnan0107@gmail.com'
  LIMIT 1;

  IF dev_uid IS NOT NULL THEN
    SELECT ark_id INTO old_id FROM public.profiles WHERE id = dev_uid;
    IF old_id IS NOT NULL AND old_id <> 'DEV' THEN
      id_map := id_map || jsonb_build_object(old_id, 'DEV');
    END IF;
    UPDATE public.profiles
    SET ark_id = 'DEV',
        display_name = 'DEV',
        updated_at = now()
    WHERE id = dev_uid;
  END IF;

  -- Drop pending requests — users must re-add with fresh IDs after this release.
  BEGIN
    DELETE FROM public.ark_friend_requests WHERE status = 'pending';
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  FOR rec IN
    SELECT p.id, p.ark_id
    FROM public.profiles p
    WHERE p.ark_id IS NOT NULL
      AND upper(trim(p.ark_id)) <> 'DEV'
      AND (dev_uid IS NULL OR p.id <> dev_uid)
    ORDER BY p.created_at
  LOOP
    old_id := rec.ark_id;
    new_id := public._gen_unique_ark_id(used_ids);
    used_ids := array_append(used_ids, new_id);
    id_map := id_map || jsonb_build_object(old_id, new_id);
    UPDATE public.profiles
    SET ark_id = new_id,
        updated_at = now()
    WHERE id = rec.id;
  END LOOP;

  -- Remap peer references using the old→new map.
  IF jsonb_typeof(id_map) = 'object' AND id_map <> '{}'::jsonb THEN
    BEGIN
      UPDATE public.ark_contacts c
      SET peer_ark_id = (id_map ->> c.peer_ark_id)
      WHERE id_map ? c.peer_ark_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;

    BEGIN
      UPDATE public.ark_friend_requests fr
      SET from_ark_id = COALESCE(id_map ->> fr.from_ark_id, fr.from_ark_id),
          to_ark_id = COALESCE(id_map ->> fr.to_ark_id, fr.to_ark_id),
          updated_at = now()
      WHERE (id_map ? fr.from_ark_id) OR (id_map ? fr.to_ark_id);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    BEGIN
      UPDATE public.ark_direct_messages m
      SET sender_ark_id = COALESCE(id_map ->> m.sender_ark_id, m.sender_ark_id),
          recipient_ark_id = COALESCE(id_map ->> m.recipient_ark_id, m.recipient_ark_id)
      WHERE (id_map ? m.sender_ark_id) OR (id_map ? m.recipient_ark_id);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    BEGIN
      UPDATE public.ark_call_signals s
      SET from_ark_id = COALESCE(id_map ->> s.from_ark_id, s.from_ark_id),
          to_ark_id = COALESCE(id_map ->> s.to_ark_id, s.to_ark_id)
      WHERE (id_map ? s.from_ark_id) OR (id_map ? s.to_ark_id);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    BEGIN
      UPDATE public.ark_blocks b
      SET blocked_ark_id = COALESCE(id_map ->> b.blocked_ark_id, b.blocked_ark_id)
      WHERE id_map ? b.blocked_ark_id;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;

    BEGIN
      UPDATE public.ark_posts p
      SET owner_ark_id = COALESCE(id_map ->> p.owner_ark_id, p.owner_ark_id)
      WHERE id_map ? p.owner_ark_id;
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public._gen_unique_ark_id(text[]);

NOTIFY pgrst, 'reload schema';
