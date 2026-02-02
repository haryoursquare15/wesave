-- Add username field to profiles and group_invitations table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for username search
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles USING gin(to_tsvector('english', full_name));

-- Create group_invitations table for tracking invite links
CREATE TABLE public.group_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by UUID NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  max_uses INTEGER DEFAULT NULL,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on group_invitations
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for group_invitations
CREATE POLICY "Admins can create invitations" 
ON public.group_invitations 
FOR INSERT 
WITH CHECK (is_group_admin(group_id));

CREATE POLICY "Admins can view their group invitations" 
ON public.group_invitations 
FOR SELECT 
USING (is_group_admin(group_id));

CREATE POLICY "Anyone can view invitation by token" 
ON public.group_invitations 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can delete invitations" 
ON public.group_invitations 
FOR DELETE 
USING (is_group_admin(group_id));

-- Create pending_invitees table for tracking invited users before they sign up
CREATE TABLE public.pending_invitees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pending_invitees ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (during signup flow)
CREATE POLICY "Anyone can create pending invitee" 
ON public.pending_invitees 
FOR INSERT 
WITH CHECK (true);

-- Users can see their own pending invitations
CREATE POLICY "Users can view own pending invites" 
ON public.pending_invitees 
FOR SELECT 
USING (true);

-- Function to search users by username or name
CREATE OR REPLACE FUNCTION public.search_users(search_term TEXT)
RETURNS TABLE (
  id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  membership_tier public.membership_tier,
  credit_score INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.membership_tier,
    p.credit_score
  FROM public.profiles p
  WHERE 
    p.id != auth.uid() AND
    (
      p.username ILIKE '%' || search_term || '%' OR
      p.full_name ILIKE '%' || search_term || '%'
    )
  LIMIT 10
$$;

-- Function to validate and use an invite token
CREATE OR REPLACE FUNCTION public.validate_invite_token(token TEXT)
RETURNS TABLE (
  valid BOOLEAN,
  group_id UUID,
  group_name TEXT,
  contribution_amount NUMERIC,
  period public.contribution_period,
  max_members INTEGER,
  member_count BIGINT,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invitation RECORD;
  current_member_count BIGINT;
BEGIN
  -- Find the invitation
  SELECT gi.*, tg.name as group_name, tg.contribution_amount, tg.period, tg.max_members
  INTO invitation
  FROM public.group_invitations gi
  JOIN public.thrift_groups tg ON gi.group_id = tg.id
  WHERE gi.invite_token = token;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, NULL::public.contribution_period, NULL::INTEGER, NULL::BIGINT, 'Invalid invitation link'::TEXT;
    RETURN;
  END IF;
  
  -- Check if expired
  IF invitation.expires_at < now() THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, NULL::public.contribution_period, NULL::INTEGER, NULL::BIGINT, 'Invitation has expired'::TEXT;
    RETURN;
  END IF;
  
  -- Check max uses
  IF invitation.max_uses IS NOT NULL AND invitation.use_count >= invitation.max_uses THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, NULL::public.contribution_period, NULL::INTEGER, NULL::BIGINT, 'Invitation has reached maximum uses'::TEXT;
    RETURN;
  END IF;
  
  -- Get current member count
  SELECT COUNT(*) INTO current_member_count
  FROM public.group_memberships
  WHERE group_memberships.group_id = invitation.group_id AND status = 'active';
  
  -- Check if group is full
  IF current_member_count >= invitation.max_members THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::NUMERIC, NULL::public.contribution_period, NULL::INTEGER, NULL::BIGINT, 'Group is full'::TEXT;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT 
    true, 
    invitation.group_id, 
    invitation.group_name, 
    invitation.contribution_amount, 
    invitation.period, 
    invitation.max_members, 
    current_member_count,
    NULL::TEXT;
END;
$$;

-- Function to join group via invite (called after onboarding)
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
BEGIN
  -- Get invitation
  SELECT * INTO invitation
  FROM public.group_invitations
  WHERE invite_token = token;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid invitation');
  END IF;
  
  -- Check if already a member
  SELECT * INTO existing_membership
  FROM public.group_memberships
  WHERE group_id = invitation.group_id AND user_id = auth.uid();
  
  IF FOUND THEN
    RETURN json_build_object('success', true, 'message', 'Already a member', 'group_id', invitation.group_id);
  END IF;
  
  -- Get current member count for position
  SELECT COUNT(*) INTO current_member_count
  FROM public.group_memberships
  WHERE group_memberships.group_id = invitation.group_id AND status = 'active';
  
  new_position := current_member_count + 1;
  
  -- Add as member
  INSERT INTO public.group_memberships (group_id, user_id, payout_position, status)
  VALUES (invitation.group_id, auth.uid(), new_position, 'active');
  
  -- Increment use count
  UPDATE public.group_invitations
  SET use_count = use_count + 1
  WHERE id = invitation.id;
  
  -- Clean up pending invitee record if exists
  DELETE FROM public.pending_invitees WHERE invite_token = token AND email = (SELECT email FROM auth.users WHERE id = auth.uid());
  
  RETURN json_build_object('success', true, 'group_id', invitation.group_id);
END;
$$;

-- Allow admins to directly add members (for username search flow)
CREATE OR REPLACE FUNCTION public.add_member_to_group(target_group_id UUID, target_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin BOOLEAN;
  existing_membership RECORD;
  current_member_count BIGINT;
  group_max_members INTEGER;
  new_position INTEGER;
BEGIN
  -- Check if requester is admin
  SELECT EXISTS (
    SELECT 1 FROM public.thrift_groups
    WHERE id = target_group_id AND admin_id = auth.uid()
  ) INTO is_admin;
  
  IF NOT is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Only group admin can add members');
  END IF;
  
  -- Check if already a member or has pending request
  SELECT * INTO existing_membership
  FROM public.group_memberships
  WHERE group_id = target_group_id AND user_id = target_user_id;
  
  IF FOUND THEN
    IF existing_membership.status = 'active' THEN
      RETURN json_build_object('success', false, 'error', 'User is already a member');
    END IF;
  END IF;
  
  -- Check member count
  SELECT COUNT(*), g.max_members INTO current_member_count, group_max_members
  FROM public.group_memberships m
  RIGHT JOIN public.thrift_groups g ON g.id = target_group_id
  WHERE m.group_id = target_group_id AND m.status = 'active'
  GROUP BY g.max_members;
  
  IF current_member_count >= group_max_members THEN
    RETURN json_build_object('success', false, 'error', 'Group is full');
  END IF;
  
  new_position := COALESCE(current_member_count, 0) + 1;
  
  -- Add member
  INSERT INTO public.group_memberships (group_id, user_id, payout_position, status)
  VALUES (target_group_id, target_user_id, new_position, 'active')
  ON CONFLICT (group_id, user_id) 
  DO UPDATE SET status = 'active', payout_position = new_position;
  
  RETURN json_build_object('success', true, 'message', 'Member added successfully');
END;
$$;

-- Add unique constraint for group_memberships
ALTER TABLE public.group_memberships 
ADD CONSTRAINT unique_group_membership UNIQUE (group_id, user_id);