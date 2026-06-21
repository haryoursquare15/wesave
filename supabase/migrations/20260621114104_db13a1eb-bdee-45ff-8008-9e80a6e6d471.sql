CREATE OR REPLACE FUNCTION public.vestara_get_balance(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result JSONB := '[]'::JSONB;
  _caller uuid := auth.uid();
  _is_privileged_admin boolean := false;
BEGIN
  IF _caller IS NOT NULL AND _caller <> _user_id THEN
    -- Only finance/compliance/super_admin may read another user's balances
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _caller
        AND role IN ('super_admin','finance_admin','compliance_admin')
    ) INTO _is_privileged_admin;

    IF NOT _is_privileged_admin THEN
      RETURN jsonb_build_object('error', 'Identity mismatch');
    END IF;

    -- Audit cross-user balance read
    INSERT INTO public.audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (
      _caller,
      'vestara_balance_viewed_by_admin',
      'vestara_accounts',
      _user_id::text,
      jsonb_build_object('viewed_user_id', _user_id, 'viewed_at', now())
    );
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'account_id', id,
    'account_type', account_type,
    'balance', balance,
    'label', label
  )) INTO _result
  FROM vestara_accounts
  WHERE user_id = _user_id;

  RETURN COALESCE(_result, '[]'::JSONB);
END;
$function$;