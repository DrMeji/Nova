-- Idempotent RLS audit for core social tables.
-- Safe to re-run after applying earlier migrations. Does not change product behavior
-- beyond ensuring DM insert still requires mutual friendship.

-- DMs: only mutual friends can insert (defense in depth if harden migration was skipped).
DROP POLICY IF EXISTS "ark_dm_insert" ON public.ark_direct_messages;
CREATE POLICY "ark_dm_insert" ON public.ark_direct_messages FOR INSERT
  TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND sender_ark_id = public.my_ark_id()
    AND public.are_mutual_ark_friends(recipient_ark_id)
  );

-- Call signals: only signal yourself as sender (already the case; re-assert).
DROP POLICY IF EXISTS "ark_call_insert" ON public.ark_call_signals;
CREATE POLICY "ark_call_insert" ON public.ark_call_signals FOR INSERT
  TO authenticated WITH CHECK (from_ark_id = public.my_ark_id());

-- Network posts: owners only mutate their rows (re-assert).
DROP POLICY IF EXISTS "ark_posts_update" ON public.ark_network_posts;
CREATE POLICY "ark_posts_update" ON public.ark_network_posts FOR UPDATE
  TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "ark_posts_delete" ON public.ark_network_posts;
CREATE POLICY "ark_posts_delete" ON public.ark_network_posts FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);
