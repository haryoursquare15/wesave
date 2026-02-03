-- Fix commence_thrift to use correct json type for log_audit_event
CREATE OR REPLACE FUNCTION public.commence_thrift(target_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group thrift_groups%ROWTYPE;
  _member_count integer;
  _member_ids uuid[];
  _shuffled_ids uuid[];
  _cycle_id uuid;
  _i integer;
  _j integer;
  _temp uuid;
BEGIN
  -- Lock and fetch the group
  SELECT * INTO _group
  FROM thrift_groups
  WHERE id = target_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;

  -- Check caller is admin
  IF _group.admin_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only admin can commence thrift');
  END IF;

  -- Check status
  IF _group.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Group is not in pending status');
  END IF;

  -- Get member count
  SELECT COUNT(*) INTO _member_count
  FROM group_memberships
  WHERE group_id = target_group_id AND status = 'active';

  -- CRITICAL: Enforce group must be full before commencing
  IF _member_count < _group.max_members THEN
    RETURN json_build_object(
      'success', false, 
      'error', format('Group must be full to commence. Current: %s/%s members', _member_count, _group.max_members)
    );
  END IF;

  -- Get all member IDs
  SELECT ARRAY_AGG(user_id) INTO _member_ids
  FROM group_memberships
  WHERE group_id = target_group_id AND status = 'active';

  -- Fisher-Yates shuffle for randomized payout order
  _shuffled_ids := _member_ids;
  FOR _i IN REVERSE array_length(_shuffled_ids, 1)..2 LOOP
    _j := floor(random() * _i + 1)::integer;
    _temp := _shuffled_ids[_i];
    _shuffled_ids[_i] := _shuffled_ids[_j];
    _shuffled_ids[_j] := _temp;
  END LOOP;

  -- Update payout positions on memberships
  FOR _i IN 1..array_length(_shuffled_ids, 1) LOOP
    UPDATE group_memberships
    SET payout_position = _i, has_received_payout = false, has_contributed_this_cycle = false
    WHERE group_id = target_group_id AND user_id = _shuffled_ids[_i];
  END LOOP;

  -- Create first contribution cycle
  INSERT INTO contribution_cycles (group_id, cycle_number, payout_recipient_id, status)
  VALUES (target_group_id, 1, _shuffled_ids[1], 'active')
  RETURNING id INTO _cycle_id;

  -- Update group status and payout order
  UPDATE thrift_groups
  SET 
    status = 'active',
    payout_order = _shuffled_ids,
    current_cycle = 1,
    current_payout_position = 1,
    updated_at = now()
  WHERE id = target_group_id;

  -- Log audit event with proper type casting
  PERFORM log_audit_event(
    auth.uid(),
    'thrift_commenced'::text,
    'thrift_groups'::text,
    target_group_id::text,
    json_build_object('member_count', _member_count, 'payout_order', _shuffled_ids)::jsonb
  );

  RETURN json_build_object(
    'success', true,
    'payout_order', _shuffled_ids,
    'cycle_id', _cycle_id
  );
END;
$$;