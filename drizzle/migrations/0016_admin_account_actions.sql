CREATE OR REPLACE FUNCTION public.admin_account_action(_user_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin uuid := auth.uid();
  _reason_clean text := left(coalesce(nullif(trim(_reason), ''), ''), 500);
  _affected int := 0;
  _title text; _msg text;
BEGIN
  IF _admin IS NULL OR NOT public.is_any_admin(_admin) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _action IN ('freeze','unfreeze','suspend') AND NOT (public.has_permission(_admin,'users.freeze') OR public.has_role(_admin,'super_admin')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _action IN ('flag_risk','clear_risk') AND NOT (public.has_permission(_admin,'compliance.restrict') OR public.has_role(_admin,'super_admin')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _action = 'remove_from_groups' AND NOT (public.has_permission(_admin,'groups.resolve_disputes') OR public.has_role(_admin,'super_admin')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _user_id = _admin AND _action IN ('freeze','suspend') THEN
    RAISE EXCEPTION 'You cannot freeze your own account';
  END IF;

  IF _action = 'freeze' THEN
    UPDATE profiles SET account_status='frozen', frozen_at=now(), frozen_by=_admin, freeze_reason=nullif(_reason_clean,'') WHERE id=_user_id;
    GET DIAGNOSTICS _affected = ROW_COUNT;
    _title := 'Account on hold'; _msg := 'Your wallet has been placed on hold. You can still view your balance, but payments, transfers and withdrawals are paused. Contact support@vestara.ng for help.';
  ELSIF _action = 'suspend' THEN
    UPDATE profiles SET account_status='suspended', frozen_at=now(), frozen_by=_admin, freeze_reason=coalesce(nullif(_reason_clean,''),'Suspended by admin') WHERE id=_user_id;
    GET DIAGNOSTICS _affected = ROW_COUNT;
    _title := 'Account suspended'; _msg := 'Your account has been suspended and all money movement is paused. Contact support@vestara.ng for help.';
  ELSIF _action = 'unfreeze' THEN
    UPDATE profiles SET account_status='active', frozen_at=NULL, frozen_by=NULL, freeze_reason=NULL WHERE id=_user_id;
    GET DIAGNOSTICS _affected = ROW_COUNT;
    _title := 'Account restored'; _msg := 'Your account is active again. Payments, transfers and withdrawals are available.';
  ELSIF _action = 'flag_risk' THEN
    UPDATE profiles SET risk_level='high' WHERE id=_user_id;
    GET DIAGNOSTICS _affected = ROW_COUNT;
  ELSIF _action = 'clear_risk' THEN
    UPDATE profiles SET risk_level='low' WHERE id=_user_id;
    GET DIAGNOSTICS _affected = ROW_COUNT;
  ELSIF _action = 'remove_from_groups' THEN
    -- Only groups that have not started, so no contribution/payout is orphaned.
    UPDATE vfd_sandbox_group_members m SET status='exited'
      FROM vfd_sandbox_groups g
      WHERE g.id=m.group_id AND m.user_id=_user_id AND m.status='active' AND g.status='pending';
    GET DIAGNOSTICS _affected = ROW_COUNT;
    IF _affected > 0 THEN
      _title := 'Removed from groups'; _msg := 'An administrator removed you from thrift groups that had not started yet.';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unknown action';
  END IF;

  INSERT INTO audit_logs(user_id, action, resource_type, resource_id, details)
  VALUES (_admin, 'admin_'||_action, 'user', _user_id::text, jsonb_build_object('reason', _reason_clean, 'affected', _affected));

  IF _title IS NOT NULL THEN
    INSERT INTO vfd_sandbox_notifications(user_id, title, message, notification_type)
    VALUES (_user_id, _title, _msg, 'account_status');
  END IF;

  RETURN jsonb_build_object('ok', true, 'affected', _affected);
END $$;

REVOKE ALL ON FUNCTION public.admin_account_action(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_account_action(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_account_statuses()
RETURNS TABLE(id uuid, account_status text, risk_level text, frozen_at timestamptz, freeze_reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  RETURN QUERY SELECT p.id, p.account_status::text, p.risk_level::text, p.frozen_at, p.freeze_reason FROM profiles p;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_account_statuses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_account_statuses() TO authenticated;