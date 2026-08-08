
-- 1. Unschedule legacy cron jobs
SELECT cron.unschedule('auto-contribution-30min');
SELECT cron.unschedule('reconcile-pending-card-charges');
SELECT cron.unschedule('contribution-reminder-hourly');
SELECT cron.unschedule('group-join-reminder-daily');
SELECT cron.unschedule('target-ajo-auto-contribution-hourly');
SELECT cron.unschedule('recurring-test-charge-2min');

-- 2. Neutralise membership helpers still referenced by surviving RLS policies
CREATE OR REPLACE FUNCTION public.is_group_admin(_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_target_ajo_admin(p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.is_target_ajo_member(p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.can_self_join_group(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT false $$;

-- 3. Rewrite admin stats without legacy tables
CREATE OR REPLACE FUNCTION public.admin_get_stats()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE result json;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Access denied: Admin only'; END IF;
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'total_groups', (SELECT COUNT(*) FROM public.vfd_sandbox_groups),
    'active_groups', (SELECT COUNT(*) FROM public.vfd_sandbox_groups WHERE status = 'active'),
    'pending_groups', (SELECT COUNT(*) FROM public.vfd_sandbox_groups WHERE status = 'pending'),
    'total_transactions', (SELECT COUNT(*) FROM public.transactions) + (SELECT COUNT(*) FROM public.vfd_sandbox_transactions),
    'total_volume', COALESCE((SELECT SUM(amount) FROM public.transactions WHERE status = 'completed'), 0)
      + COALESCE((SELECT SUM(amount) FROM public.vfd_sandbox_transactions WHERE status = 'completed'), 0)
  ) INTO result;
  RETURN result;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_get_enhanced_stats(_time_filter text DEFAULT '30d'::text)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE result json; start_date timestamptz;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Access denied: Admin only'; END IF;
  start_date := CASE _time_filter
    WHEN 'today' THEN CURRENT_DATE::timestamptz
    WHEN '7d' THEN NOW() - INTERVAL '7 days'
    WHEN '30d' THEN NOW() - INTERVAL '30 days'
    ELSE NOW() - INTERVAL '30 days' END;
  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'verified_users', (SELECT COUNT(*) FROM public.profiles WHERE kyc_status = 'verified'),
    'unverified_users', (SELECT COUNT(*) FROM public.profiles WHERE kyc_status IS NULL OR kyc_status <> 'verified'),
    'total_wallet_balance', COALESCE((SELECT SUM(available_balance) FROM public.wallets), 0)
      + COALESCE((SELECT SUM(available_balance) FROM public.vfd_user_balances), 0),
    'total_groups', (SELECT COUNT(*) FROM public.vfd_sandbox_groups),
    'active_groups', (SELECT COUNT(*) FROM public.vfd_sandbox_groups WHERE status = 'active'),
    'completed_cycles', (SELECT COUNT(*) FROM public.vfd_sandbox_contribution_cycles WHERE status = 'completed'),
    'contributions_today', (SELECT COUNT(*) FROM public.vfd_sandbox_transactions
        WHERE created_at >= CURRENT_DATE
          AND (description ILIKE '%contribution%' OR description ILIKE '%thrift%' OR description ILIKE '%ajo%')),
    'total_funding_volume',
      COALESCE((SELECT SUM(amount) FROM public.transactions WHERE type = 'funding' AND status = 'completed' AND created_at >= start_date), 0)
      + COALESCE((SELECT SUM(amount) FROM public.vfd_sandbox_transactions WHERE transaction_type = 'credit' AND status = 'completed' AND created_at >= start_date), 0),
    'total_payouts', COALESCE((SELECT SUM(amount) FROM public.vfd_sandbox_transactions
        WHERE transaction_type IN ('debit','transfer') AND status = 'completed' AND created_at >= start_date), 0),
    'platform_revenue', COALESCE((SELECT SUM(amount) FROM public.platform_ledger WHERE created_at >= start_date), 0),
    'failed_transactions', (SELECT COUNT(*) FROM public.transactions WHERE status = 'failed' AND created_at >= start_date)
      + (SELECT COUNT(*) FROM public.vfd_sandbox_transactions WHERE status = 'failed' AND created_at >= start_date),
    'risk_alerts', (SELECT COUNT(*) FROM public.velocity_events WHERE flagged = true AND created_at >= start_date),
    'pending_requests', (SELECT COUNT(*) FROM public.admin_requests WHERE status = 'pending'),
    'open_tickets', (SELECT COUNT(*) FROM public.support_tickets WHERE status IN ('open','in_progress'))
  ) INTO result;
  RETURN result;
END; $function$;

-- 4. Drop legacy-only functions (all overloads)
DO $$
DECLARE r record; names text[] := ARRAY[
  'add_member_to_group','admin_get_all_groups','check_group_limit','commence_thrift',
  'confirm_continue_group','create_thrift_group','enforce_group_membership_limit',
  'exit_completed_group','get_group_active_member_count','get_payout_order','handle_new_group',
  'join_group_via_invite','notify_invite_received','process_contribution_ledger_atomic',
  'process_payout_atomic','process_payout_internal','process_target_ajo_contribution',
  'request_position_swap','respond_to_invite','respond_to_swap_request','restart_completed_group',
  'send_member_invite','validate_invite_token','guard_thrift_groups_update'];
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname = ANY(names)
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END $$;

-- 5. Drop the empty legacy tables (ledger_entries and wallets intentionally retained)
DROP TABLE IF EXISTS public.target_ajo_withdrawal_votes CASCADE;
DROP TABLE IF EXISTS public.target_ajo_withdrawal_requests CASCADE;
DROP TABLE IF EXISTS public.target_ajo_contributions CASCADE;
DROP TABLE IF EXISTS public.target_ajo_memberships CASCADE;
DROP TABLE IF EXISTS public.target_ajo_groups CASCADE;
DROP TABLE IF EXISTS public.position_swap_requests CASCADE;
DROP TABLE IF EXISTS public.payouts CASCADE;
DROP TABLE IF EXISTS public.cycle_contributions CASCADE;
DROP TABLE IF EXISTS public.contribution_cycles CASCADE;
DROP TABLE IF EXISTS public.group_memberships CASCADE;
DROP TABLE IF EXISTS public.thrift_groups CASCADE;
