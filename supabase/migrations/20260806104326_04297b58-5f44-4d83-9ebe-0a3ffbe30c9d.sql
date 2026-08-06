
-- Helper: is the current executor a privileged/backend role (service role or definer-owned function)?
CREATE OR REPLACE FUNCTION public.is_backend_role()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT current_user IN ('service_role','postgres','supabase_admin','supabase_auth_admin')
$$;

-- ============ crowdfunding_campaigns ============
DROP POLICY IF EXISTS "Creators can update their campaigns" ON public.crowdfunding_campaigns;
CREATE POLICY "Creators can update their campaigns"
ON public.crowdfunding_campaigns FOR UPDATE TO authenticated
USING (creator_id = auth.uid())
WITH CHECK (creator_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_crowdfunding_campaigns_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.creator_id := OLD.creator_id;
  NEW.raised_amount := OLD.raised_amount;
  NEW.contributor_count := OLD.contributor_count;
  NEW.status := OLD.status;
  NEW.flw_subaccount_id := OLD.flw_subaccount_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_crowdfunding_campaigns_update ON public.crowdfunding_campaigns;
CREATE TRIGGER trg_guard_crowdfunding_campaigns_update
BEFORE UPDATE ON public.crowdfunding_campaigns
FOR EACH ROW EXECUTE FUNCTION public.guard_crowdfunding_campaigns_update();

-- ============ goal_contributions ============
DROP POLICY IF EXISTS "Campaign owners can update contributions" ON public.goal_contributions;
CREATE POLICY "Campaign owners can update contributions"
ON public.goal_contributions FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.goal_campaigns gc
               WHERE gc.id = goal_contributions.campaign_id
                 AND gc.campaign_owner_user_id = auth.uid()))
WITH CHECK (
  contribution_status IN ('pledged','confirmed')
  AND EXISTS (SELECT 1 FROM public.goal_campaigns gc
              WHERE gc.id = goal_contributions.campaign_id
                AND gc.campaign_owner_user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.guard_goal_contributions_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  -- Owners may only confirm a pledged contribution; nothing else is mutable.
  NEW.id := OLD.id;
  NEW.campaign_id := OLD.campaign_id;
  NEW.contributor_user_id := OLD.contributor_user_id;
  NEW.contributor_name := OLD.contributor_name;
  NEW.contribution_amount := OLD.contribution_amount;
  NEW.contribution_reference := OLD.contribution_reference;
  NEW.anonymous := OLD.anonymous;
  NEW.created_at := OLD.created_at;
  IF NEW.contribution_status IS DISTINCT FROM OLD.contribution_status
     AND NOT (OLD.contribution_status = 'pledged' AND NEW.contribution_status = 'confirmed') THEN
    NEW.contribution_status := OLD.contribution_status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_goal_contributions_update ON public.goal_contributions;
CREATE TRIGGER trg_guard_goal_contributions_update
BEFORE UPDATE ON public.goal_contributions
FOR EACH ROW EXECUTE FUNCTION public.guard_goal_contributions_update();

-- ============ profiles ============
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_profiles_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.id := OLD.id;
  NEW.email := OLD.email;
  NEW.kyc_status := OLD.kyc_status;
  NEW.account_status := OLD.account_status;
  NEW.credit_score := OLD.credit_score;
  NEW.membership_tier := OLD.membership_tier;
  NEW.completed_cycles := OLD.completed_cycles;
  NEW.risk_level := OLD.risk_level;
  NEW.frozen_at := OLD.frozen_at;
  NEW.frozen_by := OLD.frozen_by;
  NEW.freeze_reason := OLD.freeze_reason;
  NEW.last_security_review := OLD.last_security_review;
  NEW.referral_code := OLD.referral_code;
  NEW.referred_by := OLD.referred_by;
  NEW.flw_subaccount_id := OLD.flw_subaccount_id;
  NEW.flw_virtual_account_number := OLD.flw_virtual_account_number;
  NEW.flw_virtual_bank_name := OLD.flw_virtual_bank_name;
  NEW.flw_account_reference := OLD.flw_account_reference;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_profiles_update ON public.profiles;
CREATE TRIGGER trg_guard_profiles_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_update();

-- ============ split_requests ============
DROP POLICY IF EXISTS "Creator can update own split requests" ON public.split_requests;
CREATE POLICY "Creator can update own split requests"
ON public.split_requests FOR UPDATE TO authenticated
USING (creator_user_id = auth.uid())
WITH CHECK (creator_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_split_requests_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.creator_user_id := OLD.creator_user_id;
  NEW.total_amount := OLD.total_amount;
  NEW.number_of_people := OLD.number_of_people;
  NEW.amount_per_person := OLD.amount_per_person;
  NEW.platform_fee := OLD.platform_fee;
  NEW.merchant_account_name := OLD.merchant_account_name;
  NEW.merchant_bank_name := OLD.merchant_bank_name;
  NEW.merchant_account_number := OLD.merchant_account_number;
  NEW.settlement_status := OLD.settlement_status;
  NEW.settlement_reference := OLD.settlement_reference;
  NEW.settlement_flw_transfer_id := OLD.settlement_flw_transfer_id;
  NEW.settlement_initiated_at := OLD.settlement_initiated_at;
  NEW.settlement_completed_at := OLD.settlement_completed_at;
  NEW.settlement_failure_reason := OLD.settlement_failure_reason;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_split_requests_update ON public.split_requests;
CREATE TRIGGER trg_guard_split_requests_update
BEFORE UPDATE ON public.split_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_split_requests_update();

-- ============ thrift_groups ============
DROP POLICY IF EXISTS "Admins can update their groups" ON public.thrift_groups;
CREATE POLICY "Admins can update their groups"
ON public.thrift_groups FOR UPDATE TO authenticated
USING (public.is_group_admin(id))
WITH CHECK (public.is_group_admin(id));

CREATE OR REPLACE FUNCTION public.guard_thrift_groups_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.admin_id := OLD.admin_id;
  NEW.invite_code := OLD.invite_code;
  NEW.payout_order := OLD.payout_order;
  NEW.current_payout_position := OLD.current_payout_position;
  NEW.current_cycle := OLD.current_cycle;
  NEW.rating := OLD.rating;
  NEW.flw_subaccount_id := OLD.flw_subaccount_id;
  NEW.created_at := OLD.created_at;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (
       (OLD.status = 'pending'::group_status AND NEW.status IN ('active'::group_status,'paused'::group_status))
       OR (OLD.status = 'active'::group_status AND NEW.status = 'paused'::group_status)
       OR (OLD.status = 'paused'::group_status AND NEW.status = 'active'::group_status)
     ) THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_thrift_groups_update ON public.thrift_groups;
CREATE TRIGGER trg_guard_thrift_groups_update
BEFORE UPDATE ON public.thrift_groups
FOR EACH ROW EXECUTE FUNCTION public.guard_thrift_groups_update();

-- ============ vfd_sandbox_clients ============
DROP POLICY IF EXISTS "Users can update own VFD client" ON public.vfd_sandbox_clients;
CREATE POLICY "Users can update own VFD client"
ON public.vfd_sandbox_clients FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_vfd_sandbox_clients_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.user_id := OLD.user_id;
  NEW.vfd_client_id := OLD.vfd_client_id;
  NEW.vfd_account_number := OLD.vfd_account_number;
  NEW.bvn := OLD.bvn;
  NEW.nin := OLD.nin;
  NEW.date_of_birth := OLD.date_of_birth;
  NEW.tier := OLD.tier;
  NEW.kyc_method := OLD.kyc_method;
  NEW.consent_status := OLD.consent_status;
  NEW.account_status := OLD.account_status;
  NEW.balance := OLD.balance;
  NEW.source := OLD.source;
  NEW.metadata := OLD.metadata;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_vfd_sandbox_clients_update ON public.vfd_sandbox_clients;
CREATE TRIGGER trg_guard_vfd_sandbox_clients_update
BEFORE UPDATE ON public.vfd_sandbox_clients
FOR EACH ROW EXECUTE FUNCTION public.guard_vfd_sandbox_clients_update();
