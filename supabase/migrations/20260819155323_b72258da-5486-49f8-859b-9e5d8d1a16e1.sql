-- Column-level protection for mandate payer PII on member tables
REVOKE SELECT ON public.vfd_sandbox_group_members FROM authenticated, anon;
REVOKE SELECT ON public.vfd_sandbox_target_members FROM authenticated, anon;

GRANT SELECT (
  id, group_id, user_id, payout_position, has_contributed_current, has_received_payout,
  joined_at, has_used_swap, terms_accepted_at, status, wants_continue, continue_confirmed_at,
  mandate_status, mandate_reference, mandate_authorized_at, mandate_fee_charged_at,
  mandate_fee_amount, contribution_method, mandate_code, mandate_nibss_account,
  mandate_nibss_message, mandate_start_date, mandate_end_date, mandate_frequency,
  mandate_created_at, mandate_expires_at, payout_order
) ON public.vfd_sandbox_group_members TO authenticated;

GRANT SELECT (
  id, target_id, user_id, contributed_amount, joined_at, contribution_method,
  mandate_status, mandate_reference, mandate_code, mandate_nibss_account,
  mandate_nibss_message, mandate_start_date, mandate_end_date, mandate_frequency,
  mandate_created_at, mandate_authorized_at, mandate_expires_at, mandate_fee_charged_at,
  mandate_fee_amount
) ON public.vfd_sandbox_target_members TO authenticated;

GRANT ALL ON public.vfd_sandbox_group_members TO service_role;
GRANT ALL ON public.vfd_sandbox_target_members TO service_role;