-- transactions: only trusted backend (service role) may insert
DROP POLICY IF EXISTS "Users can create own transactions" ON public.transactions;

-- split_transactions: only trusted backend may insert
DROP POLICY IF EXISTS "System can insert split transactions" ON public.split_transactions;

-- crowdfunding_contributions: only trusted backend may insert
DROP POLICY IF EXISTS "Users can make contributions" ON public.crowdfunding_contributions;

-- goal_contributions: allow self-pledges only, never self-confirmed
DROP POLICY IF EXISTS "Users can create contributions" ON public.goal_contributions;
CREATE POLICY "Users can create own pledges"
ON public.goal_contributions
FOR INSERT
TO authenticated
WITH CHECK (
  contributor_user_id = auth.uid()
  AND contribution_status = 'pledged'
);