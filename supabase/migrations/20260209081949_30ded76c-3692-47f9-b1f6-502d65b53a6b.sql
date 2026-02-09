-- Fix admin_get_all_users to use is_any_admin for super_admin support
CREATE OR REPLACE FUNCTION public.admin_get_all_users()
RETURNS TABLE(
  id uuid,
  email text,
  full_name text,
  username text,
  membership_tier public.membership_tier,
  credit_score integer,
  created_at timestamp with time zone,
  role public.app_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.full_name,
    p.username,
    p.membership_tier,
    p.credit_score,
    p.created_at,
    ur.role
  FROM public.profiles p
  LEFT JOIN public.user_roles ur ON ur.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

-- Fix admin_get_all_groups to use is_any_admin for super_admin support
CREATE OR REPLACE FUNCTION public.admin_get_all_groups()
RETURNS TABLE(
  id uuid,
  name text,
  admin_id uuid,
  admin_name text,
  status public.group_status,
  member_count bigint,
  contribution_amount numeric,
  period public.contribution_period,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.admin_id,
    p.full_name as admin_name,
    g.status,
    (SELECT COUNT(*) FROM public.group_memberships gm WHERE gm.group_id = g.id AND gm.status = 'active') as member_count,
    g.contribution_amount,
    g.period,
    g.created_at
  FROM public.thrift_groups g
  LEFT JOIN public.profiles p ON p.id = g.admin_id
  ORDER BY g.created_at DESC;
END;
$$;

-- Fix admin_get_stats to use is_any_admin
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_groups', (SELECT COUNT(*) FROM public.thrift_groups),
    'active_groups', (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'active'),
    'pending_groups', (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'pending'),
    'total_transactions', (SELECT COUNT(*) FROM public.transactions),
    'total_volume', COALESCE((SELECT SUM(amount) FROM public.transactions WHERE status = 'completed'), 0)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Fix admin_get_enhanced_stats to use is_any_admin
CREATE OR REPLACE FUNCTION public.admin_get_enhanced_stats(_time_filter text DEFAULT '30d')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  start_date timestamp with time zone;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: Admin only';
  END IF;
  
  -- Calculate start date based on filter
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
    'total_wallet_balance', COALESCE((SELECT SUM(available_balance) FROM public.wallets), 0),
    'total_groups', (SELECT COUNT(*) FROM public.thrift_groups),
    'active_groups', (SELECT COUNT(*) FROM public.thrift_groups WHERE status = 'active'),
    'completed_cycles', (SELECT COUNT(*) FROM public.contribution_cycles WHERE status = 'completed'),
    'contributions_today', (SELECT COUNT(*) FROM public.cycle_contributions WHERE created_at >= CURRENT_DATE),
    'total_funding_volume', COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'funding' AND status = 'completed' AND created_at >= start_date), 0),
    'total_payouts', COALESCE((SELECT SUM(net_amount) FROM public.payouts WHERE status = 'completed' AND created_at >= start_date), 0),
    'platform_revenue', COALESCE((SELECT SUM(platform_fee) FROM public.payouts WHERE status = 'completed' AND created_at >= start_date), 0),
    'failed_transactions', (SELECT COUNT(*) FROM public.transactions WHERE status = 'failed' AND created_at >= start_date),
    'risk_alerts', (SELECT COUNT(*) FROM public.velocity_events WHERE flagged = true AND created_at >= start_date),
    'pending_requests', (SELECT COUNT(*) FROM public.admin_requests WHERE status = 'pending'),
    'open_tickets', (SELECT COUNT(*) FROM public.support_tickets WHERE status IN ('open', 'in_progress'))
  ) INTO result;
  
  RETURN result;
END;
$$;