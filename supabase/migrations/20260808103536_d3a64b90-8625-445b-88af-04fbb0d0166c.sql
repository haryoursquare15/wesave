-- 1) Revoke EXECUTE on internal SECURITY DEFINER functions from anon/authenticated
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN (
        'admin_grant_permission','admin_revoke_permission','check_rate_limit','cleanup_rate_limits',
        'consume_nonce','credit_goal_campaign_from_transfer','email_queue_dispatch','email_queue_wake',
        'guard_crowdfunding_campaigns_update','guard_goal_contributions_update','guard_profiles_update',
        'guard_split_requests_update','guard_vfd_sandbox_clients_update','handle_new_user',
        'notify_splitpay_receipt','notify_user_email','notify_user_push','process_contribution_atomic',
        'send_notification_email_trigger','vestara_aging_pending_savings','vestara_approve_savings',
        'vestara_campaign_contribute','vestara_campaign_withdraw','vestara_create_savings_pending',
        'vestara_detect_balance_drift','vestara_reject_savings','vestara_resolve_rate','vestara_split_refund',
        'vestara_sync_user_balance_cache','vestara_target_payout','vestara_update_timestamp',
        'vestara_validate_balance_on_entry','vestara_get_balance','get_vfd_clients_redacted',
        'get_public_vfd_sandbox_campaign','get_public_vfd_sandbox_campaigns'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) card_tokens: remove direct admin table read, replace with audited masked function
DROP POLICY IF EXISTS "Admins can view all card tokens" ON public.card_tokens;

CREATE OR REPLACE FUNCTION public.admin_list_card_tokens(_limit integer DEFAULT 200)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  card_last4 text,
  card_type text,
  card_status text,
  group_id uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, resource_type, metadata)
  VALUES (auth.uid(), 'admin_view_card_tokens', 'card_tokens', jsonb_build_object('limit', _limit));

  RETURN QUERY
  SELECT ct.id,
         ct.user_id,
         ct.card_last4,
         ct.card_type,
         ct.card_status,
         ct.group_id,
         ct.created_at
  FROM public.card_tokens ct
  ORDER BY ct.created_at DESC
  LIMIT COALESCE(_limit, 200);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_card_tokens(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_card_tokens(integer) TO authenticated, service_role;