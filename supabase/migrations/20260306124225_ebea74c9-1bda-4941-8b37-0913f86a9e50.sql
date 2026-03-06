
-- Function to handle participant decline: removes the participant row (frees the slot),
-- notifies the creator to invite a replacement
CREATE OR REPLACE FUNCTION public.decline_split_participation(
  _split_request_id uuid,
  _user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _creator_id uuid;
  _purpose text;
  _decliner_name text;
  _number_of_people int;
  _current_count int;
BEGIN
  -- Get split request info
  SELECT creator_user_id, purpose, number_of_people
  INTO _creator_id, _purpose, _number_of_people
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found or not active');
  END IF;

  -- Get decliner name
  SELECT COALESCE(full_name, username, 'Someone') INTO _decliner_name
  FROM profiles WHERE id = _user_id;

  -- Delete the participant row to free the slot
  DELETE FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not a pending participant');
  END IF;

  -- Audit the decline
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_user_id, 'split_participant_declined', 'split_request', _split_request_id::text,
    jsonb_build_object('purpose', _purpose, 'decliner', _decliner_name));

  -- Get remaining participant count
  SELECT COUNT(*) INTO _current_count
  FROM split_participants WHERE split_request_id = _split_request_id;

  -- Notify the creator to add a replacement
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (
    _creator_id,
    'Participant Declined',
    _decliner_name || ' declined the split "' || _purpose || '". You need to invite a replacement (' || _current_count || '/' || _number_of_people || ' participants).',
    'split_decline'
  );

  RETURN jsonb_build_object('success', true, 'remaining_participants', _current_count, 'required', _number_of_people);
END;
$$;
