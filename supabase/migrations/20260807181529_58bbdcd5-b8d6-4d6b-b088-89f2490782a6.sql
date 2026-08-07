-- Mandate payer PII (bank account, NIBSS account, phone, email, address, raw
-- payload) must never be visible to co-members. RLS is row-level only, so the
-- co-member SELECT policy exposed every column. Enforce column-level privileges:
-- revoke blanket SELECT and re-grant only the non-sensitive participation columns.

-- 1) Signed-out visitors have no policy on these tables; remove the grant too.
REVOKE SELECT ON public.vfd_sandbox_group_members FROM anon;
REVOKE SELECT ON public.vfd_sandbox_target_members FROM anon;

-- 2) Replace table-wide SELECT for authenticated with a safe column allow-list.
REVOKE SELECT ON public.vfd_sandbox_group_members FROM authenticated;
GRANT SELECT (
  id, group_id, user_id, payout_position, has_contributed_current,
  has_received_payout, joined_at, has_used_swap, terms_accepted_at, status,
  wants_continue, continue_confirmed_at, mandate_status, mandate_reference,
  mandate_authorized_at, mandate_fee_charged_at, mandate_fee_amount,
  contribution_method, mandate_start_date, mandate_end_date, mandate_frequency,
  mandate_created_at, mandate_expires_at, payout_order
) ON public.vfd_sandbox_group_members TO authenticated;

REVOKE SELECT ON public.vfd_sandbox_target_members FROM authenticated;
GRANT SELECT (
  id, target_id, user_id, contributed_amount, joined_at, contribution_method,
  mandate_status, mandate_reference, mandate_start_date, mandate_end_date,
  mandate_frequency, mandate_created_at, mandate_authorized_at,
  mandate_expires_at, mandate_fee_charged_at, mandate_fee_amount
) ON public.vfd_sandbox_target_members TO authenticated;

-- 3) Edge functions / admin tooling keep full access.
GRANT ALL ON public.vfd_sandbox_group_members TO service_role;
GRANT ALL ON public.vfd_sandbox_target_members TO service_role;

-- 4) Owners (and admins) can still read their OWN mandate details.
CREATE OR REPLACE FUNCTION public.get_own_group_mandate(_group_id uuid)
RETURNS TABLE (
  mandate_status text, mandate_reference text, mandate_code text,
  mandate_nibss_account text, mandate_nibss_message text,
  mandate_payer_bank_code text, mandate_payer_account_number text,
  mandate_payer_phone text, mandate_payer_email text, mandate_payer_address text,
  mandate_start_date date, mandate_end_date date, mandate_frequency text,
  mandate_authorized_at timestamptz, mandate_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.mandate_status, m.mandate_reference, m.mandate_code,
         m.mandate_nibss_account, m.mandate_nibss_message,
         m.mandate_payer_bank_code, m.mandate_payer_account_number,
         m.mandate_payer_phone, m.mandate_payer_email, m.mandate_payer_address,
         m.mandate_start_date, m.mandate_end_date, m.mandate_frequency,
         m.mandate_authorized_at, m.mandate_expires_at
  FROM public.vfd_sandbox_group_members m
  WHERE m.group_id = _group_id
    AND auth.uid() IS NOT NULL
    AND (m.user_id = auth.uid() OR public.is_any_admin(auth.uid()))
    AND (m.user_id = auth.uid() OR true)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_own_target_mandate(_target_id uuid)
RETURNS TABLE (
  mandate_status text, mandate_reference text, mandate_code text,
  mandate_nibss_account text, mandate_nibss_message text,
  mandate_payer_bank_code text, mandate_payer_account_number text,
  mandate_payer_phone text, mandate_payer_email text, mandate_payer_address text,
  mandate_start_date date, mandate_end_date date, mandate_frequency text,
  mandate_authorized_at timestamptz, mandate_expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.mandate_status, m.mandate_reference, m.mandate_code,
         m.mandate_nibss_account, m.mandate_nibss_message,
         m.mandate_payer_bank_code, m.mandate_payer_account_number,
         m.mandate_payer_phone, m.mandate_payer_email, m.mandate_payer_address,
         m.mandate_start_date, m.mandate_end_date, m.mandate_frequency,
         m.mandate_authorized_at, m.mandate_expires_at
  FROM public.vfd_sandbox_target_members m
  WHERE m.target_id = _target_id
    AND auth.uid() IS NOT NULL
    AND m.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_own_group_mandate(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_own_target_mandate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_group_mandate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_target_mandate(uuid) TO authenticated;