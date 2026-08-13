-- 1. Goal campaigns: block owners from editing financial/derived fields
CREATE OR REPLACE FUNCTION public.guard_goal_campaigns_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.id := OLD.id;
  NEW.campaign_owner_user_id := OLD.campaign_owner_user_id;
  NEW.amount_raised := OLD.amount_raised;
  NEW.contributor_count := OLD.contributor_count;
  NEW.campaign_status := OLD.campaign_status;
  NEW.goal_amount := OLD.goal_amount;
  NEW.campaign_slug := OLD.campaign_slug;
  NEW.beneficiary_account_name := OLD.beneficiary_account_name;
  NEW.beneficiary_bank_name := OLD.beneficiary_bank_name;
  NEW.beneficiary_account_number := OLD.beneficiary_account_number;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_guard_goal_campaigns_update ON public.goal_campaigns;
CREATE TRIGGER trg_guard_goal_campaigns_update
  BEFORE UPDATE ON public.goal_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_goal_campaigns_update();

-- Re-assert ownership on write
DROP POLICY IF EXISTS "Owners can update own campaigns" ON public.goal_campaigns;
CREATE POLICY "Owners can update own campaigns"
  ON public.goal_campaigns FOR UPDATE
  TO authenticated
  USING (campaign_owner_user_id = auth.uid())
  WITH CHECK (campaign_owner_user_id = auth.uid());

-- 2. Ensure guard triggers exist for profiles and crowdfunding campaigns
DROP TRIGGER IF EXISTS trg_guard_profiles_update ON public.profiles;
CREATE TRIGGER trg_guard_profiles_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_update();

DROP TRIGGER IF EXISTS trg_guard_crowdfunding_campaigns_update ON public.crowdfunding_campaigns;
CREATE TRIGGER trg_guard_crowdfunding_campaigns_update
  BEFORE UPDATE ON public.crowdfunding_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_crowdfunding_campaigns_update();

-- 3. user_devices: prevent row reassignment
DROP POLICY IF EXISTS "Users can manage own devices" ON public.user_devices;
CREATE POLICY "Users can manage own devices"
  ON public.user_devices FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. user_notifications: prevent row reassignment
DROP POLICY IF EXISTS "Users can update own notifications" ON public.user_notifications;
CREATE POLICY "Users can update own notifications"
  ON public.user_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);