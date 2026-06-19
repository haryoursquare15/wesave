CREATE POLICY "Confirmed contributors can view goal campaigns"
ON public.goal_campaigns
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.goal_contributions gc
    WHERE gc.campaign_id = goal_campaigns.id
      AND gc.contributor_user_id = auth.uid()
      AND gc.contribution_status = 'confirmed'
  )
);

DROP POLICY IF EXISTS "View invitation only with matching token" ON public.group_invitations;