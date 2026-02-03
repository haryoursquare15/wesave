-- Fix join_group_via_invite to validate expiry, max uses, and group capacity
-- This addresses the DEFINER_OR_RPC_BYPASS security finding (invite_join_bypass)

CREATE OR REPLACE FUNCTION public.join_group_via_invite(token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation RECORD;
  existing_membership RECORD;
  current_member_count BIGINT;
  new_position INTEGER;
  v_user_id UUID;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Authentication required');
  END IF;

  -- Get invitation with group info (atomic JOIN with FOR UPDATE to lock the row)
  SELECT gi.*, tg.max_members, tg.name as group_name
  INTO invitation
  FROM public.group_invitations gi
  JOIN public.thrift_groups tg ON gi.group_id = tg.id
  WHERE gi.invite_token = token
  FOR UPDATE OF gi;  -- Lock the invitation row to prevent race conditions
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid invitation');
  END IF;
  
  -- CRITICAL FIX 1: Validate expiry
  IF invitation.expires_at IS NOT NULL AND invitation.expires_at < now() THEN
    RETURN json_build_object('success', false, 'error', 'Invitation has expired');
  END IF;
  
  -- CRITICAL FIX 2: Validate max uses
  IF invitation.max_uses IS NOT NULL AND invitation.use_count >= invitation.max_uses THEN
    RETURN json_build_object('success', false, 'error', 'Invitation has reached maximum uses');
  END IF;
  
  -- Check if user is already a member
  SELECT * INTO existing_membership
  FROM public.group_memberships
  WHERE group_id = invitation.group_id AND user_id = v_user_id;
  
  IF FOUND THEN
    IF existing_membership.status = 'active' THEN
      RETURN json_build_object('success', true, 'message', 'Already a member', 'group_id', invitation.group_id);
    ELSIF existing_membership.status = 'removed' THEN
      -- Reactivate removed member
      UPDATE public.group_memberships
      SET status = 'active', joined_at = now()
      WHERE id = existing_membership.id;
      
      -- Increment use count
      UPDATE public.group_invitations 
      SET use_count = COALESCE(use_count, 0) + 1 
      WHERE id = invitation.id;
      
      RETURN json_build_object('success', true, 'group_id', invitation.group_id, 'message', 'Membership reactivated');
    END IF;
  END IF;
  
  -- CRITICAL FIX 3: Check group capacity with row lock (prevents race conditions)
  SELECT COUNT(*) INTO current_member_count
  FROM public.group_memberships
  WHERE group_id = invitation.group_id AND status = 'active';
  
  IF current_member_count >= invitation.max_members THEN
    RETURN json_build_object('success', false, 'error', 'Group is full');
  END IF;
  
  -- Calculate new payout position
  new_position := current_member_count + 1;
  
  -- Add as member (now safe because all checks passed)
  INSERT INTO public.group_memberships (group_id, user_id, payout_position, status, joined_at)
  VALUES (invitation.group_id, v_user_id, new_position, 'active', now());
  
  -- Increment use count
  UPDATE public.group_invitations 
  SET use_count = COALESCE(use_count, 0) + 1 
  WHERE id = invitation.id;
  
  -- Clean up pending invitee record if exists
  DELETE FROM public.pending_invitees 
  WHERE invite_token = token;
  
  -- Log the join event
  PERFORM public.log_audit_event(
    v_user_id,
    'group_membership',
    invitation.group_id::TEXT,
    'joined_via_invite',
    json_build_object('group_name', invitation.group_name, 'position', new_position)
  );
  
  RETURN json_build_object('success', true, 'group_id', invitation.group_id, 'group_name', invitation.group_name);
END;
$$;