
DROP POLICY IF EXISTS "Support staff can add comments" ON public.support_ticket_comments;
CREATE POLICY "Users or admins add comments to own tickets"
ON public.support_ticket_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (
    public.is_any_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated can read campaign updates" ON public.vfd_sandbox_campaign_updates;
CREATE POLICY "Creator contributor or admin read campaign updates"
ON public.vfd_sandbox_campaign_updates FOR SELECT TO authenticated
USING (
  public.is_any_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.vfd_sandbox_campaigns c
    WHERE c.id = vfd_sandbox_campaign_updates.campaign_id AND c.creator_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.vfd_sandbox_campaign_contributions cc
    WHERE cc.campaign_id = vfd_sandbox_campaign_updates.campaign_id AND cc.contributor_id = auth.uid()
  )
);
