-- #11 RLS re-audit: tighten friend-request updates + re-assert least privilege.
-- Safe to re-run.

-- Only the recipient may accept/decline a pending request (not the sender).
DROP POLICY IF EXISTS "ark_fr_update" ON public.ark_friend_requests;
CREATE POLICY "ark_fr_update" ON public.ark_friend_requests FOR UPDATE
  TO authenticated
  USING (to_ark_id = public.my_ark_id())
  WITH CHECK (
    to_ark_id = public.my_ark_id()
    AND status IN ('accepted', 'declined')
  );

-- Profiles: owner-only read/write (re-assert).
DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles FOR SELECT
  TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "insert_own_profile" ON public.profiles;
CREATE POLICY "insert_own_profile" ON public.profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles FOR UPDATE
  TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Public ark_id lookup for friend add (read-only narrow columns via RPC preferred;
-- keep select-by-ark for authenticated peers if existing policy name differs).
DROP POLICY IF EXISTS "profiles_select_by_ark" ON public.profiles;
-- Intentionally omit broad public SELECT; friend lookup uses SECURITY DEFINER RPCs.

-- Network posts: authors update/delete own only (re-assert if table exists).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ark_network_posts'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "ark_posts_update_own" ON public.ark_network_posts';
    EXECUTE $p$
      CREATE POLICY "ark_posts_update_own" ON public.ark_network_posts FOR UPDATE
        TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid())
    $p$;
    EXECUTE 'DROP POLICY IF EXISTS "ark_posts_delete_own" ON public.ark_network_posts';
    EXECUTE $p$
      CREATE POLICY "ark_posts_delete_own" ON public.ark_network_posts FOR DELETE
        TO authenticated USING (owner_id = auth.uid())
    $p$;
  END IF;
END $$;
