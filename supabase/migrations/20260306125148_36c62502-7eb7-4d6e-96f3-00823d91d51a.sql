
-- Create an RPC to handle split invitations atomically
-- This runs as SECURITY DEFINER so it can insert into user_notifications
CREATE OR REPLACE FUNCTION public.send_split_invite(
  _split_request_id uuid,
  _inviter_id uuid,
  _invitee_id uuid,
  _amount_due numeric
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _purpose text;
  _total_amount numeric;
  _number_of_people int;
  _merchant_name text;
  _inviter_name text;
  _current_count int;
BEGIN
  -- Get split request info
  SELECT purpose, total_amount, number_of_people, merchant_account_name
  INTO _purpose, _total_amount, _number_of_people, _merchant_name
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active' AND creator_user_id = _inviter_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found or you are not the creator');
  END IF;

  -- Check if already a participant
  IF EXISTS (SELECT 1 FROM split_participants WHERE split_request_id = _split_request_id AND user_id = _invitee_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already a participant');
  END IF;

  -- Check slot availability
  SELECT COUNT(*) INTO _current_count FROM split_participants WHERE split_request_id = _split_request_id;
  IF _current_count >= _number_of_people THEN
    RETURN jsonb_build_object('success', false, 'error', 'All participant slots are filled');
  END IF;

  -- Get inviter name
  SELECT COALESCE(full_name, username, 'Someone') INTO _inviter_name
  FROM profiles WHERE id = _inviter_id;

  -- Insert participant
  INSERT INTO split_participants (split_request_id, user_id, amount_due, status)
  VALUES (_split_request_id, _invitee_id, _amount_due, 'pending');

  -- Insert rich notification with split summary
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
$$;
