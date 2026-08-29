-- Enforce ARK's mutual-friend messaging rule at the database boundary.
-- The renderer check remains useful for UX, but cannot be the authorization
-- boundary because clients can call Supabase directly.

DROP POLICY IF EXISTS "ark_dm_insert" ON public.ark_direct_messages;
CREATE POLICY "ark_dm_insert" ON public.ark_direct_messages FOR INSERT
  TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND sender_ark_id = public.my_ark_id()
    AND public.are_mutual_ark_friends(recipient_ark_id)
  );
