-- 1) Remove anonymous access to campaign rows
DROP POLICY IF EXISTS "Anyone can view active campaigns" ON public.crowdfunding_campaigns;

CREATE POLICY "Authenticated users can view active campaigns"
  ON public.crowdfunding_campaigns
  FOR SELECT
  TO authenticated
  USING (status IN ('active', 'completed'));

-- Keep creator-owned visibility scoped to authenticated only
DROP POLICY IF EXISTS "Creators can view their own campaigns" ON public.crowdfunding_campaigns;
CREATE POLICY "Creators can view their own campaigns"
  ON public.crowdfunding_campaigns
  FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid());

-- 2) Hide the financial subaccount identifier from every client role.
--    Only backend services (service_role) need it.
REVOKE SELECT ON public.crowdfunding_campaigns FROM anon;
REVOKE SELECT ON public.crowdfunding_campaigns FROM authenticated;

GRANT SELECT (
  id, title, description, creator_id, target_amount, raised_amount,
  contributor_count, status, category, image_url, deadline,
  created_at, updated_at
) ON public.crowdfunding_campaigns TO authenticated;

GRANT INSERT, UPDATE ON public.crowdfunding_campaigns TO authenticated;
GRANT ALL ON public.crowdfunding_campaigns TO service_role;