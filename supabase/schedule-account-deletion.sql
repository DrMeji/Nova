-- Same as migrations/20260828130000_schedule_account_deletion.sql
-- Run in Supabase SQL Editor if migrations are not applied automatically.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS delete_scheduled_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.schedule_own_account_deletion(p_hours integer DEFAULT 24)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  when_at timestamptz;
  hrs integer := GREATEST(1, LEAST(COALESCE(p_hours, 24), 168));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  when_at := now() + make_interval(hours => hrs);
  UPDATE public.profiles
  SET delete_scheduled_at = when_at, updated_at = now()
  WHERE id = uid;
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, delete_scheduled_at)
    VALUES (uid, when_at)
    ON CONFLICT (id) DO UPDATE
      SET delete_scheduled_at = EXCLUDED.delete_scheduled_at,
          updated_at = now();
  END IF;
  RETURN when_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_own_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.profiles
  SET delete_scheduled_at = NULL, updated_at = now()
  WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_own_account_deletion(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_own_account_deletion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schedule_own_account_deletion(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_own_account_deletion() TO authenticated;
NOTIFY pgrst, 'reload schema';
