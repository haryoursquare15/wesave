CREATE OR REPLACE FUNCTION public.admin_get_onboarding_funnel(_days int DEFAULT NULL, _include_internal boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE r jsonb;
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  WITH u AS (
    SELECT au.id, au.email, au.created_at, au.email_confirmed_at, p.full_name
    FROM auth.users au LEFT JOIN public.profiles p ON p.id = au.id
    WHERE (_days IS NULL OR au.created_at >= now() - make_interval(days => _days))
      AND (_include_internal OR coalesce(p.internal_account, false) = false)
      AND NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = au.id AND ur.role <> 'user')
  ), s AS (
    SELECT u.*,
      u.email_confirmed_at IS NOT NULL AS verified,
      EXISTS (SELECT 1 FROM vfd_sandbox_clients c WHERE c.user_id = u.id) AS kyc_started,
      EXISTS (SELECT 1 FROM vfd_sandbox_clients c WHERE c.user_id = u.id AND c.vfd_account_number IS NOT NULL) AS account_opened,
      EXISTS (SELECT 1 FROM transaction_pins t WHERE t.user_id = u.id) AS pin_set,
      EXISTS (SELECT 1 FROM vfd_sandbox_transactions x WHERE x.user_id = u.id AND x.transaction_type = 'credit' AND x.status IN ('completed','success','successful')) AS funded,
      EXISTS (SELECT 1 FROM vfd_sandbox_transactions x WHERE x.user_id = u.id AND x.transaction_type <> 'credit' AND x.status IN ('completed','success','successful')) AS transacted
    FROM u
  ), st AS (
    SELECT s.*, CASE
      WHEN NOT verified THEN 'Email not verified'
      WHEN NOT kyc_started THEN 'KYC not started'
      WHEN NOT account_opened THEN 'Account not opened'
      WHEN NOT pin_set THEN 'PIN not set'
      WHEN NOT funded THEN 'Not funded'
      WHEN NOT transacted THEN 'No transaction yet'
      ELSE 'Fully active' END AS stuck_at
    FROM s
  )
  SELECT jsonb_build_object(
    'stages', jsonb_build_array(
      jsonb_build_object('key','signed_up','label','Signed up','count',(SELECT count(*) FROM st)),
      jsonb_build_object('key','verified','label','Email verified','count',(SELECT count(*) FROM st WHERE verified)),
      jsonb_build_object('key','kyc_started','label','KYC started','count',(SELECT count(*) FROM st WHERE verified AND kyc_started)),
      jsonb_build_object('key','account_opened','label','Account opened','count',(SELECT count(*) FROM st WHERE verified AND account_opened)),
      jsonb_build_object('key','pin_set','label','PIN set','count',(SELECT count(*) FROM st WHERE verified AND account_opened AND pin_set)),
      jsonb_build_object('key','funded','label','Funded wallet','count',(SELECT count(*) FROM st WHERE verified AND account_opened AND pin_set AND funded)),
      jsonb_build_object('key','transacted','label','First transaction','count',(SELECT count(*) FROM st WHERE stuck_at = 'Fully active'))
    ),
    'users', coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'name',full_name,'created_at',created_at,'stuck_at',stuck_at) ORDER BY created_at DESC) FROM st), '[]'::jsonb)
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_onboarding_funnel(int, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_onboarding_funnel(int, boolean) TO authenticated;