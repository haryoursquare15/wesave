
CREATE OR REPLACE FUNCTION public.send_split_payment_reminder(_split_request_id uuid, _target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _purpose text;
  _amount_due numeric;
  _creator_name text;
  _split_creator_id uuid;
BEGIN
  -- Verify caller is the creator
  SELECT creator_user_id, purpose INTO _split_creator_id, _purpose
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found');
  END IF;

  IF _split_creator_id != auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the creator can send reminders');
  END IF;

  -- Get participant amount
  SELECT amount_due INTO _amount_due
  FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _target_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a pending participant');
  END IF;

  -- Get creator name
  SELECT COALESCE(full_name, username, 'Someone') INTO _creator_name
  FROM profiles WHERE id = auth.uid();

  -- Send notification
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (
    _target_user_id,
    '⏰ Payment Reminder',
    _creator_name || ' is waiting for your payment:' || chr(10) ||
    '📌 ' || _purpose || chr(10) ||
    '💰 Your share: ₦' || trim(to_char(_amount_due, 'FM999,999,999')) || chr(10) ||
    'Tap to view and respond → /split-pay/' || _split_request_id::text,
    'split_invite'
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
