
-- Security hardening: reduce anon exposure to SECURITY DEFINER functions and lock internal tables

-- 1. Enable RLS + deny-all on internal_cron_tokens (only service_role via bypass)
ALTER TABLE public.internal_cron_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deny_all_internal_cron_tokens" ON public.internal_cron_tokens;
CREATE POLICY "deny_all_internal_cron_tokens" ON public.internal_cron_tokens
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
REVOKE ALL ON public.internal_cron_tokens FROM anon, authenticated;

-- 2. Revoke EXECUTE from anon on all public SECURITY DEFINER functions,
--    except a whitelist that public/unauthenticated pages legitimately call.
DO $$
DECLARE
  r record;
  whitelist text[] := ARRAY[
    'get_public_vfd_sandbox_campaign_by_slug',
    'get_public_goal_campaign',
    'get_public_goal_campaigns',
    'get_public_goal_contributions',
    'get_public_profile',
    'get_public_profiles',
    'validate_invite_token',
    'gen_random_uuid',
    'gen_random_bytes'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT (p.proname = ANY(whitelist))
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',
      r.proname, r.args
    );
  END LOOP;
END $$;
