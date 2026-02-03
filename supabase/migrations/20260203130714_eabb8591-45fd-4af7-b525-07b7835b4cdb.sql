-- Create member_invites table for user-to-user invitations with accept/reject flow
CREATE TABLE public.member_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  responded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(group_id, invitee_id)
);

-- Enable RLS
ALTER TABLE public.member_invites ENABLE ROW LEVEL SECURITY;

-- Policies: Admins can create invites
CREATE POLICY "Admins can create invites"
ON public.member_invites
FOR INSERT
TO authenticated
WITH CHECK (is_group_admin(group_id) AND inviter_id = auth.uid());

-- Policies: Inviter can view invites they sent
CREATE POLICY "Inviters can view sent invites"
ON public.member_invites
FOR SELECT
TO authenticated
USING (inviter_id = auth.uid() OR invitee_id = auth.uid() OR is_group_admin(group_id));

-- Policies: Invitee can update their own invite (accept/reject)
CREATE POLICY "Invitees can respond to invites"
ON public.member_invites
FOR UPDATE
TO authenticated
USING (invitee_id = auth.uid() AND status = 'pending');

-- Policies: Admins can delete pending invites
CREATE POLICY "Admins can delete invites"
ON public.member_invites
FOR DELETE
TO authenticated
USING (is_group_admin(group_id));

-- Create function to send an invite (instead of directly adding)
CREATE OR REPLACE FUNCTION public.send_member_invite(target_group_id UUID, target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin BOOLEAN;
  existing_membership RECORD;
  existing_invite RECORD;
  group_record RECORD;
  current_member_count BIGINT;
BEGIN
  -- Check if requester is admin
  SELECT EXISTS (
    SELECT 1 FROM public.thrift_groups
    WHERE id = target_group_id AND admin_id = auth.uid()
  ) INTO is_admin;
  
  IF NOT is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Only group admin can invite members');
  END IF;
  
  -- Get group info
  SELECT * INTO group_record FROM public.thrift_groups WHERE id = target_group_id;
  
  IF group_record IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Group not found');
  END IF;
  
  -- Check if already a member
  SELECT * INTO existing_membership
  FROM public.group_memberships
  WHERE group_id = target_group_id AND user_id = target_user_id AND status = 'active';
  
  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User is already a member');
  END IF;
  
  -- Check if already invited
  SELECT * INTO existing_invite
  FROM public.member_invites
  WHERE group_id = target_group_id AND invitee_id = target_user_id AND status = 'pending';
  
  IF FOUND THEN
    RETURN json_build_object('success', false, 'error', 'User already has a pending invite');
  END IF;
  
  -- Check member count
  SELECT COUNT(*) INTO current_member_count
  FROM public.group_memberships
  WHERE group_id = target_group_id AND status = 'active';
  
  IF current_member_count >= group_record.max_members THEN
    RETURN json_build_object('success', false, 'error', 'Group is full');
  END IF;
  
  -- Create invite
  INSERT INTO public.member_invites (group_id, inviter_id, invitee_id, status)
  VALUES (target_group_id, auth.uid(), target_user_id, 'pending');
  
  RETURN json_build_object('success', true, 'message', 'Invite sent successfully');
END;
$$;

-- Create function to respond to invite
CREATE OR REPLACE FUNCTION public.respond_to_invite(invite_id UUID, accept BOOLEAN)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      -- Reject the invite since group is full
      UPDATE public.member_invites
      SET status = 'rejected', responded_at = now()
      WHERE id = invite_id;
      
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
    WHERE id = invite_id;
    
    RETURN json_build_object('success', true, 'message', 'You have joined the group', 'group_id', invite_record.group_id);
  ELSE
    -- Reject invite
    UPDATE public.member_invites
    SET status = 'rejected', responded_at = now()
    WHERE id = invite_id;
    
    RETURN json_build_object('success', true, 'message', 'Invite declined');
  END IF;
END;
$$;