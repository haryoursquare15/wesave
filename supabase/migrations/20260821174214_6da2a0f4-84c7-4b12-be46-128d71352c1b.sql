-- 1. crowdfunding_campaigns: hide internal payment subaccount id from app users
REVOKE SELECT ON public.crowdfunding_campaigns FROM authenticated;
REVOKE SELECT ON public.crowdfunding_campaigns FROM anon;
GRANT SELECT (id, title, description, creator_id, target_amount, raised_amount,
              contributor_count, status, category, image_url, deadline,
              created_at, updated_at)
  ON public.crowdfunding_campaigns TO authenticated;
GRANT ALL ON public.crowdfunding_campaigns TO service_role;

-- 2. goal_campaigns: contributors must not read beneficiary bank details
DROP POLICY IF EXISTS "Confirmed contributors can view goal campaigns" ON public.goal_campaigns;

-- 3. vfd_sandbox_campaigns: restrict full-row access to creator/admin
DROP POLICY IF EXISTS "Owner contributor or admin view full campaign" ON public.vfd_sandbox_campaigns;
CREATE POLICY "Owner or admin view full campaign"
  ON public.vfd_sandbox_campaigns
  FOR SELECT
  TO authenticated
  USING (creator_id = auth.uid() OR is_any_admin(auth.uid()));