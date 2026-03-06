
-- Re-create respond_to_invite to force PostgREST schema cache refresh
CREATE OR REPLACE FUNCTION public.respond_to_invite(invite_id uuid, accept boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_record RECORD;
  current_member_count BIGINT;
  group_max_members INTEGER;
  new_position INTEGER;
BEGIN
  -- Get invite
  SELECT mi.*, tg.max_members INTO invite_record
  FROM public.member_invites mi
  JOIN public.thrift_groups tg ON tg.id = mi.group_id
  WHERE mi.id = invite_id AND mi.invitee_id = auth.uid() AND mi.status = 'pending';
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invite not found or already responded');
  END IF;
  
  IF accept THEN
    -- Check if group is full
    SELECT COUNT(*) INTO current_member_count
    FROM public.group_memberships
    WHERE group_id = invite_record.group_id AND status = 'active';
    
    IF current_member_count >= invite_record.max_members THEN
      UPDATE public.member_invites
      SET status = 'rejected', responded_at = now()
      WHERE id = respond_to_invite.invite_id;
      
      RETURN json_build_object('success', false, 'error', 'Group is now full');
    END IF;
    
    new_position := current_member_count + 1;
    
    -- Add as member
    INSERT INTO public.group_memberships (group_id, user_id, payout_position, status)
    VALUES (invite_record.group_id, auth.uid(), new_position, 'active')
    ON CONFLICT (group_id, user_id) 
    DO UPDATE SET status = 'active', payout_position = new_position;
    
    -- Update invite status
    UPDATE public.member_invites
    SET status = 'accepted', responded_at = now()
    WHERE id = respond_to_invite.invite_id;
    
    RETURN json_build_object('success', true, 'message', 'You have joined the group', 'group_id', invite_record.group_id);
  ELSE
    -- Reject invite
    UPDATE public.member_invites
    SET status = 'rejected', responded_at = now()
    WHERE id = respond_to_invite.invite_id;
    
    RETURN json_build_object('success', true, 'message', 'Invite declined');
  END IF;
END;
$$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
