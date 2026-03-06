
-- RPC to let the split creator remove a pending participant
CREATE OR REPLACE FUNCTION public.remove_split_participant(
  _split_request_id uuid,
  _creator_id uuid,
  _participant_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _purpose text;
  _removed_name text;
BEGIN
  -- Verify caller is the creator
  SELECT purpose INTO _purpose
  FROM split_requests
  WHERE id = _split_request_id AND status = 'active' AND creator_user_id = _creator_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split request not found or you are not the creator');
  END IF;

  -- Only allow removing pending participants
  DELETE FROM split_participants
  WHERE split_request_id = _split_request_id AND user_id = _participant_user_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Participant not found or already paid');
  END IF;

  SELECT COALESCE(full_name, username, 'Someone') INTO _removed_name
  FROM profiles WHERE id = _participant_user_id;

  -- Notify the removed user
  INSERT INTO user_notifications (user_id, title, message, notification_type)
  VALUES (
    _participant_user_id,
    'Removed from SplitPay',
    'You were removed from the split "' || _purpose || '".',
    'split_decline'
  );

  -- Audit
  INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
  VALUES (_creator_id, 'split_participant_removed', 'split_request', _split_request_id::text,
    jsonb_build_object('removed_user', _removed_name, 'removed_user_id', _participant_user_id));

  RETURN jsonb_build_object('success', true);
END;
$$;
