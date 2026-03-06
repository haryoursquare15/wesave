
-- Fix the broken split_requests SELECT policy for participants
-- The old policy uses `id IN (SELECT is_split_participant(auth.uid()))` which is wrong

DROP POLICY IF EXISTS "Users can view split requests they created or participate in" ON public.split_requests;

CREATE POLICY "Users can view split requests they created or participate in"
ON public.split_requests
FOR SELECT
TO authenticated
USING (
  creator_user_id = auth.uid()
  OR is_split_participant(id, auth.uid())
);
