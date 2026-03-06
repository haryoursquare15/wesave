
-- Fix: Allow all participants in a split to see all other participants in the same split
DROP POLICY IF EXISTS "Users can view participants of their splits" ON public.split_participants;

CREATE POLICY "Users can view participants of their splits"
ON public.split_participants
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_split_request_creator(split_request_id)
  OR split_request_id IN (
    SELECT sp2.split_request_id FROM split_participants sp2 WHERE sp2.user_id = auth.uid()
  )
);
