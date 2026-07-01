-- Extend admin RPCs to include VFD sandbox data alongside legacy tables

CREATE OR REPLACE FUNCTION public.admin_get_enhanced_stats(_time_filter text DEFAULT '30d'::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  start_date timestamp with time zone;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;

  start_date := CASE _time_filter
    WHEN 'today' THEN CURRENT_DATE::timestamp with time zone
    WHEN '7d' THEN NOW() - INTERVAL '7 days'
    WHEN '30d' THEN NOW() - INTERVAL '30 days'
    ELSE NOW() - INTERVAL '30 days'
  END;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'verified_users', (SELECT COUNT(*) FROM public.profiles WHERE kyc_status = 'verified'),
    'unverified_users', (SELECT COUNT(*) FROM public.profiles WHERE kyc_status IS NULL OR kyc_status != 'verified'),
    'total_wallet_balance',
      COALESCE((SELECT SUM(available_balance) FROM public.wallets), 0)
      + COALESCE((SELECT SUM(available_balance) FROM public.vfd_user_balances), 0),
    'total_groups',
      (SELECT COUNT(*) FROM public.thrift_groups)
      + (SELECT COUNT(*) FROM public.vfd_sandbox_groups),
    'active_groups',
      (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'active')
      + (SELECT COUNT(*) FROM public.vfd_sandbox_groups WHERE status = 'active'),
    'completed_cycles',
      (SELECT COUNT(*) FROM public.contribution_cycles WHERE status = 'completed')
      + (SELECT COUNT(*) FROM public.vfd_sandbox_contribution_cycles WHERE status = 'completed'),
    'contributions_today',
      (SELECT COUNT(*) FROM public.cycle_contributions WHERE created_at >= CURRENT_DATE)
      + (SELECT COUNT(*) FROM public.vfd_sandbox_transactions
          WHERE created_at >= CURRENT_DATE
            AND (description ILIKE '%contribution%' OR description ILIKE '%thrift%' OR description ILIKE '%ajo%')),
    'total_funding_volume',
      COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'funding' AND status = 'completed' AND created_at >= start_date), 0)
      + COALESCE((SELECT SUM(amount) FROM public.vfd_sandbox_transactions
                   WHERE transaction_type = 'credit' AND status = 'completed' AND created_at >= start_date), 0),
    'total_payouts',
      COALESCE((SELECT SUM(net_amount) FROM public.payouts WHERE status = 'completed' AND created_at >= start_date), 0)
      + COALESCE((SELECT SUM(amount) FROM public.vfd_sandbox_transactions
                   WHERE transaction_type IN ('debit','transfer') AND status = 'completed' AND created_at >= start_date), 0),
    'platform_revenue', COALESCE((SELECT SUM(platform_fee) FROM public.payouts WHERE status = 'completed' AND created_at >= start_date), 0),
    'failed_transactions',
      (SELECT COUNT(*) FROM public.transactions WHERE status = 'failed' AND created_at >= start_date)
      + (SELECT COUNT(*) FROM public.vfd_sandbox_transactions WHERE status = 'failed' AND created_at >= start_date),
    'risk_alerts', (SELECT COUNT(*) FROM public.velocity_events WHERE flagged = true AND created_at >= start_date),
    'pending_requests', (SELECT COUNT(*) FROM public.admin_requests WHERE status = 'pending'),
    'open_tickets', (SELECT COUNT(*) FROM public.support_tickets WHERE status IN ('open', 'in_progress'))
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_groups',
      (SELECT COUNT(*) FROM public.thrift_groups)
      + (SELECT COUNT(*) FROM public.vfd_sandbox_groups),
    'active_groups',
      (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'active')
      + (SELECT COUNT(*) FROM public.vfd_sandbox_groups WHERE status = 'active'),
    'pending_groups',
      (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'pending')
      + (SELECT COUNT(*) FROM public.vfd_sandbox_groups WHERE status = 'pending'),
    'total_transactions',
      (SELECT COUNT(*) FROM public.transactions)
      + (SELECT COUNT(*) FROM public.vfd_sandbox_transactions),
    'total_volume',
      COALESCE((SELECT SUM(amount) FROM public.transactions WHERE status = 'completed'), 0)
      + COALESCE((SELECT SUM(amount) FROM public.vfd_sandbox_transactions WHERE status = 'completed'), 0)
  ) INTO result;

  RETURN result;
END;
$function$;

-- Groups list needs a source column, so drop first then recreate with new signature
DROP FUNCTION IF EXISTS public.admin_get_all_groups();

CREATE OR REPLACE FUNCTION public.admin_get_all_groups()
RETURNS TABLE(
  id uuid,
  name text,
  admin_id uuid,
  admin_name text,
  status text,
  member_count bigint,
  contribution_amount numeric,
  period text,
  created_at timestamp with time zone,
  source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;

  RETURN QUERY
  SELECT
    g.id,
    g.name,
    g.admin_id,
    p.full_name AS admin_name,
    g.status::text AS status,
    (SELECT COUNT(*) FROM public.group_memberships gm
      WHERE gm.group_id = g.id AND gm.status = 'active') AS member_count,
    g.contribution_amount,
    g.period::text AS period,
    g.created_at,
    'legacy'::text AS source
  FROM public.thrift_groups g
  LEFT JOIN public.profiles p ON p.id = g.admin_id
  UNION ALL
  SELECT
    sg.id,
    sg.name,
    sg.admin_id,
    p.full_name AS admin_name,
    sg.status,
    (SELECT COUNT(*) FROM public.vfd_sandbox_group_members sgm
      WHERE sgm.group_id = sg.id AND sgm.status = 'active') AS member_count,
    sg.contribution_amount,
    sg.period,
    sg.created_at,
    'sandbox'::text AS source
  FROM public.vfd_sandbox_groups sg
  LEFT JOIN public.profiles p ON p.id = sg.admin_id
  ORDER BY created_at DESC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_groups() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_enhanced_stats(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_stats() TO authenticated, service_role;