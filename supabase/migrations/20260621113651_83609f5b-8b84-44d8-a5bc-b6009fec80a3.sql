-- 1. vestara_get_balance: restrict to self or admin
CREATE OR REPLACE FUNCTION public.vestara_get_balance(_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result JSONB := '[]'::JSONB;
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL
     AND _caller <> _user_id
     AND NOT public.is_any_admin(_caller) THEN
    RETURN jsonb_build_object('error', 'Identity mismatch');
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

-- 2. decline_split_participation: caller must be the participant
CREATE OR REPLACE FUNCTION public.decline_split_participation(_split_request_id uuid, _user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _creator_id uuid;
  _purpose text;
  _decliner_name text;
  _number_of_people int;
  _current_count int;
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _caller <> _user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Identity mismatch');
  END IF;

  SELECT creator_user_id, purpose, number_of_people
  INTO _creator_id, _purpose, _number_of_people
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found or not active');
  END IF;

  SELECT COALESCE(full_name, username, 'Someone') INTO _decliner_name
  FROM profiles WHERE id = _user_id;

  DELETE FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a pending participant');
  END IF;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_user_id, 'split_participant_declined', 'split_request', _split_request_id::text,
    jsonb_build_object('purpose', _purpose, 'decliner', _decliner_name));

  SELECT COUNT(*) INTO _current_count
  FROM split_participants WHERE split_request_id = _split_request_id;

  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (_creator_id, 'Participant Declined',
    _decliner_name || ' declined the split "' || _purpose || '". You need to invite a replacement (' || _current_count || '/' || _number_of_people || ' participants).',
    'split_decline');

  RETURN jsonb_build_object('success', true, 'remaining_participants', _current_count, 'required', _number_of_people);
END;
$function$;

-- 3. remove_split_participant: caller must be the creator
CREATE OR REPLACE FUNCTION public.remove_split_participant(_split_request_id uuid, _creator_id uuid, _participant_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _purpose text;
  _removed_name text;
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _caller <> _creator_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Identity mismatch');
  END IF;

  SELECT purpose INTO _purpose
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active' AND creator_user_id = _creator_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found or you are not the creator');
  END IF;

  DELETE FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _participant_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant not found or already paid');
  END IF;

  SELECT COALESCE(full_name, username, 'Someone') INTO _removed_name
  FROM profiles WHERE id = _participant_user_id;

  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_creator_id, 'split_participant_removed', 'split_request', _split_request_id::text,
    jsonb_build_object('purpose', _purpose, 'removed_user', _participant_user_id, 'removed_name', _removed_name));

  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (_participant_user_id, 'Removed from Split',
    'You were removed from the split "' || _purpose || '" by the creator.',
    'split_decline');

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 4. send_split_invite: caller must be the inviter (creator)
CREATE OR REPLACE FUNCTION public.send_split_invite(_split_request_id uuid, _inviter_id uuid, _invitee_id uuid, _amount_due numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _purpose text;
  _total_amount numeric;
  _number_of_people int;
  _merchant_name text;
  _inviter_name text;
  _current_count int;
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NOT NULL AND _caller <> _inviter_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Identity mismatch');
  END IF;

  SELECT purpose, total_amount, number_of_people, merchant_account_name
  INTO _purpose, _total_amount, _number_of_people, _merchant_name
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active' AND creator_user_id = _inviter_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found or you are not the creator');
  END IF;

  IF EXISTS (SELECT 1 FROM split_participants WHERE split_request_id = _split_request_id AND user_id = _invitee_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a participant');
  END IF;

  SELECT COUNT(*) INTO _current_count FROM split_participants WHERE split_request_id = _split_request_id;
  IF _current_count >= _number_of_people THEN
    RETURN jsonb_build_object('success', false, 'error', 'All participant slots are filled');
  END IF;

  SELECT COALESCE(full_name, username, 'Someone') INTO _inviter_name
  FROM profiles WHERE id = _inviter_id;

  INSERT INTO split_participants (split_request_id, user_id, amount_due, status)
  VALUES (_split_request_id, _invitee_id, _amount_due, 'pending');

  INSERT INTO user_notifications (user_id, title, message, notification_type, group_id)
  VALUES (
    _invitee_id,
    '🧾 SplitPay Invite',
    _inviter_name || ' invited you to split a bill:' || chr(10) ||
    '📌 ' || _purpose || chr(10) ||
    '💰 Your share: ₦' || trim(to_char(_amount_due, 'FM999,999,999')) || chr(10) ||
    '🏦 Merchant: ' || _merchant_name || chr(10) ||
    '👥 ' || (_current_count + 1) || '/' || _number_of_people || ' participants' || chr(10) ||
    'Tap to view and respond → /split-pay/' || _split_request_id::text,
    'split_invite',
    NULL
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;