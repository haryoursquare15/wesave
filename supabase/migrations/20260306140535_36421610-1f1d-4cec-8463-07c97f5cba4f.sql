
-- Fix: Allow split participants to view all transactions for their split
DROP POLICY IF EXISTS "Users can view their own split transactions" ON public.split_transactions;

CREATE POLICY "Users can view split transactions for their splits"
ON public.split_transactions
FOR SELECT
USING (
  user_id = auth.uid()
  OR split_request_id IN (
    SELECT sp.split_request_id FROM split_participants sp WHERE sp.user_id = auth.uid()
  )
  OR is_any_admin(auth.uid())
);

-- Drop the separate admin policy since it's now included above
DROP POLICY IF EXISTS "Admins can view all split transactions" ON public.split_transactions;
