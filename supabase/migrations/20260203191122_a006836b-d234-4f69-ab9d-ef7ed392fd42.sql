-- 1. Add contribution schedule fields to thrift_groups
ALTER TABLE public.thrift_groups
ADD COLUMN IF NOT EXISTS contribution_day_of_month integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS contribution_day_of_week integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS contribution_hour integer DEFAULT 9;

-- Add check constraints
ALTER TABLE public.thrift_groups
ADD CONSTRAINT check_day_of_month CHECK (contribution_day_of_month IS NULL OR (contribution_day_of_month >= 1 AND contribution_day_of_month <= 31)),
ADD CONSTRAINT check_day_of_week CHECK (contribution_day_of_week IS NULL OR (contribution_day_of_week >= 0 AND contribution_day_of_week <= 6)),
ADD CONSTRAINT check_hour CHECK (contribution_hour >= 0 AND contribution_hour <= 23);

-- 2. Add swap tracking to group_memberships
ALTER TABLE public.group_memberships
ADD COLUMN IF NOT EXISTS has_used_swap boolean DEFAULT false;

-- 3. Create position swap requests table
CREATE TABLE IF NOT EXISTS public.position_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  target_id uuid NOT NULL,
  requester_position integer NOT NULL,
  target_position integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  responded_at timestamp with time zone,
  UNIQUE(group_id, requester_id, status) -- Only one pending request per requester per group
);

-- 4. Create contribution audit table for detailed tracking
CREATE TABLE IF NOT EXISTS public.contribution_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  contribution_type text NOT NULL DEFAULT 'auto' CHECK (contribution_type IN ('auto', 'manual')),
  status text NOT NULL DEFAULT 'completed',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 5. Enable RLS on new tables
ALTER TABLE public.position_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_audit ENABLE ROW LEVEL SECURITY;

-- 6. RLS policies for position_swap_requests
CREATE POLICY "Members can view swap requests in their groups"
ON public.position_swap_requests FOR SELECT
USING (
  is_group_member(group_id) OR 
  requester_id = auth.uid() OR 
  target_id = auth.uid()
);

CREATE POLICY "Members can create swap requests"
ON public.position_swap_requests FOR INSERT
WITH CHECK (
  requester_id = auth.uid() AND
  is_group_member(group_id)
);

CREATE POLICY "Target can respond to swap requests"
ON public.position_swap_requests FOR UPDATE
USING (
  target_id = auth.uid() AND
  status = 'pending'
);

CREATE POLICY "Requester can cancel own pending requests"
ON public.position_swap_requests FOR DELETE
USING (
  requester_id = auth.uid() AND
  status = 'pending'
);

-- 7. RLS policies for contribution_audit
CREATE POLICY "Members can view contribution audit in their groups"
ON public.contribution_audit FOR SELECT
USING (
  is_group_member(group_id) OR 
  is_group_admin(group_id) OR
  user_id = auth.uid()
);

-- 8. Update commence_thrift to check group is full
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

  -- Log audit event
  PERFORM log_audit_event(
    auth.uid(),
    'thrift_commenced',
    'thrift_groups',
    target_group_id::text,
    json_build_object('member_count', _member_count, 'payout_order', _shuffled_ids)
  );

  RETURN json_build_object(
    'success', true,
    'payout_order', _shuffled_ids,
    'cycle_id', _cycle_id
  );
END;
$$;

-- 9. Create function to handle position swap
CREATE OR REPLACE FUNCTION public.respond_to_swap_request(
  _request_id uuid,
  _accept boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request position_swap_requests%ROWTYPE;
  _requester_membership group_memberships%ROWTYPE;
  _target_membership group_memberships%ROWTYPE;
BEGIN
  -- Lock and fetch the request
  SELECT * INTO _request
  FROM position_swap_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Request not found');
  END IF;

  -- Check caller is target
  IF _request.target_id != auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Only target can respond to swap request');
  END IF;

  -- Check request is pending
  IF _request.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Request is no longer pending');
  END IF;

  IF _accept THEN
    -- Lock memberships
    SELECT * INTO _requester_membership
    FROM group_memberships
    WHERE group_id = _request.group_id AND user_id = _request.requester_id
    FOR UPDATE;

    SELECT * INTO _target_membership
    FROM group_memberships
    WHERE group_id = _request.group_id AND user_id = _request.target_id
    FOR UPDATE;

    -- Check neither has received payout yet
    IF _requester_membership.has_received_payout OR _target_membership.has_received_payout THEN
      UPDATE position_swap_requests
      SET status = 'rejected', responded_at = now()
      WHERE id = _request_id;
      
      RETURN json_build_object('success', false, 'error', 'Cannot swap after receiving payout');
    END IF;

    -- Swap positions
    UPDATE group_memberships
    SET payout_position = _request.target_position
    WHERE group_id = _request.group_id AND user_id = _request.requester_id;

    UPDATE group_memberships
    SET payout_position = _request.requester_position
    WHERE group_id = _request.group_id AND user_id = _request.target_id;

    -- Mark both as having used their swap
    UPDATE group_memberships
    SET has_used_swap = true
    WHERE group_id = _request.group_id AND user_id IN (_request.requester_id, _request.target_id);

    -- Update request status
    UPDATE position_swap_requests
    SET status = 'accepted', responded_at = now()
    WHERE id = _request_id;

    -- Log audit
    PERFORM log_audit_event(
      auth.uid(),
      'position_swap_accepted',
      'position_swap_requests',
      _request_id::text,
      json_build_object(
        'requester_id', _request.requester_id,
        'target_id', _request.target_id,
        'from_positions', json_build_object('requester', _request.requester_position, 'target', _request.target_position),
        'to_positions', json_build_object('requester', _request.target_position, 'target', _request.requester_position)
      )
    );

    RETURN json_build_object('success', true, 'message', 'Positions swapped successfully');
  ELSE
    -- Reject the request
    UPDATE position_swap_requests
    SET status = 'rejected', responded_at = now()
    WHERE id = _request_id;

    RETURN json_build_object('success', true, 'message', 'Swap request rejected');
  END IF;
END;
$$;

-- 10. Create function to request position swap
CREATE OR REPLACE FUNCTION public.request_position_swap(
  _group_id uuid,
  _target_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _group thrift_groups%ROWTYPE;
  _requester_membership group_memberships%ROWTYPE;
  _target_membership group_memberships%ROWTYPE;
  _request_id uuid;
BEGIN
  -- Fetch group
  SELECT * INTO _group FROM thrift_groups WHERE id = _group_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;

  -- Group must be active
  IF _group.status != 'active' THEN
    RETURN json_build_object('success', false, 'error', 'Group is not active');
  END IF;

  -- Cannot swap with self
  IF _target_user_id = auth.uid() THEN
    RETURN json_build_object('success', false, 'error', 'Cannot swap with yourself');
  END IF;

  -- Check requester membership and swap eligibility
  SELECT * INTO _requester_membership
  FROM group_memberships
  WHERE group_id = _group_id AND user_id = auth.uid() AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'You are not a member of this group');
  END IF;

  IF _requester_membership.has_used_swap THEN
    RETURN json_build_object('success', false, 'error', 'You have already used your one-time swap');
  END IF;

  IF _requester_membership.has_received_payout THEN
    RETURN json_build_object('success', false, 'error', 'Cannot swap after receiving payout');
  END IF;

  -- Check target membership
  SELECT * INTO _target_membership
  FROM group_memberships
  WHERE group_id = _group_id AND user_id = _target_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Target user is not a member of this group');
  END IF;

  IF _target_membership.has_received_payout THEN
    RETURN json_build_object('success', false, 'error', 'Target has already received payout');
  END IF;

  -- Check no pending request exists
  IF EXISTS (
    SELECT 1 FROM position_swap_requests
    WHERE group_id = _group_id AND requester_id = auth.uid() AND status = 'pending'
  ) THEN
    RETURN json_build_object('success', false, 'error', 'You already have a pending swap request');
  END IF;

  -- Create swap request
  INSERT INTO position_swap_requests (
    group_id, requester_id, target_id, 
    requester_position, target_position
  ) VALUES (
    _group_id, auth.uid(), _target_user_id,
    _requester_membership.payout_position, _target_membership.payout_position
  )
  RETURNING id INTO _request_id;

  RETURN json_build_object(
    'success', true, 
    'request_id', _request_id,
    'message', 'Swap request sent'
  );
END;
$$;

-- 11. Enable realtime for swap requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.position_swap_requests;