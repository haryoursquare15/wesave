CREATE OR REPLACE FUNCTION public.guard_profiles_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  NEW.internal_account := OLD.internal_account;
  NEW.bank_details_changed_at := OLD.bank_details_changed_at;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_crowdfunding_campaigns_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_backend_role() OR public.is_any_admin(auth.uid()) THEN RETURN NEW; END IF;
  NEW.id := OLD.id;
  NEW.creator_id := OLD.creator_id;
  NEW.raised_amount := OLD.raised_amount;
  NEW.contributor_count := OLD.contributor_count;
  NEW.status := OLD.status;
  NEW.flw_subaccount_id := OLD.flw_subaccount_id;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END $function$;
