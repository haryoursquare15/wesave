-- Add Flutterwave integration fields to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS flw_subaccount_id TEXT,
ADD COLUMN IF NOT EXISTS flw_virtual_account_number TEXT,
ADD COLUMN IF NOT EXISTS flw_virtual_bank_name TEXT,
ADD COLUMN IF NOT EXISTS flw_account_reference TEXT;

-- Add Flutterwave integration fields to thrift_groups
ALTER TABLE public.thrift_groups 
ADD COLUMN IF NOT EXISTS flw_subaccount_id TEXT,
ADD COLUMN IF NOT EXISTS payout_order UUID[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS current_payout_position INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_contribution_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS next_payout_date TIMESTAMP WITH TIME ZONE;

-- Add auto-debit mandate tracking to group_memberships
ALTER TABLE public.group_memberships
ADD COLUMN IF NOT EXISTS flw_mandate_id TEXT,
ADD COLUMN IF NOT EXISTS mandate_status TEXT DEFAULT 'none';

-- Create chat_messages table for group chat
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Chat policies
CREATE POLICY "Group members can view chat messages"
ON public.chat_messages FOR SELECT
USING (is_group_member(group_id) OR is_group_admin(group_id));

CREATE POLICY "Group members can send messages"
ON public.chat_messages FOR INSERT
WITH CHECK (is_group_member(group_id) AND user_id = auth.uid());

-- Create contribution_cycles table to track each cycle
CREATE TABLE IF NOT EXISTS public.contribution_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL,
  status TEXT DEFAULT 'active',
  payout_recipient_id UUID,
  total_contributions NUMERIC DEFAULT 0,
  platform_fee NUMERIC DEFAULT 0,
  payout_amount NUMERIC DEFAULT 0,
  contribution_deadline TIMESTAMP WITH TIME ZONE,
  payout_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(group_id, cycle_number)
);

-- Enable RLS on contribution_cycles
ALTER TABLE public.contribution_cycles ENABLE ROW LEVEL SECURITY;

-- Cycle policies
CREATE POLICY "Group members can view cycles"
ON public.contribution_cycles FOR SELECT
USING (is_group_member(group_id) OR is_group_admin(group_id));

CREATE POLICY "Admins can manage cycles"
ON public.contribution_cycles FOR ALL
USING (is_group_admin(group_id));

-- Create cycle_contributions table to track individual contributions per cycle
CREATE TABLE IF NOT EXISTS public.cycle_contributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id UUID NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  flw_transaction_ref TEXT,
  contributed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on cycle_contributions
ALTER TABLE public.cycle_contributions ENABLE ROW LEVEL SECURITY;

-- Contribution policies
CREATE POLICY "Group members can view contributions"
ON public.cycle_contributions FOR SELECT
USING (is_group_member(group_id) OR is_group_admin(group_id));

CREATE POLICY "System can insert contributions"
ON public.cycle_contributions FOR INSERT
WITH CHECK (true);

-- Create payouts table to track all payouts
CREATE TABLE IF NOT EXISTS public.payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id) ON DELETE CASCADE,
  cycle_id UUID NOT NULL REFERENCES public.contribution_cycles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL,
  gross_amount NUMERIC NOT NULL,
  platform_fee NUMERIC NOT NULL,
  net_amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  flw_transfer_ref TEXT,
  flw_transfer_id TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payouts
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

-- Payout policies
CREATE POLICY "Group members can view payouts"
ON public.payouts FOR SELECT
USING (is_group_member(group_id) OR is_group_admin(group_id) OR recipient_id = auth.uid());

-- Create webhook_events table for idempotency
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Add realtime for chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Function to randomize payout order
CREATE OR REPLACE FUNCTION public.commence_thrift(target_group_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  is_admin BOOLEAN;
  member_ids UUID[];
  shuffled_ids UUID[];
  member_count INTEGER;
  group_record RECORD;
  next_contrib_date TIMESTAMP WITH TIME ZONE;
  i INTEGER;
  j INTEGER;
  temp UUID;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.thrift_groups
    WHERE id = target_group_id AND admin_id = auth.uid()
  ) INTO is_admin;
  
  IF NOT is_admin THEN
    RETURN json_build_object('success', false, 'error', 'Only group admin can commence thrift');
  END IF;
  
  SELECT * INTO group_record FROM public.thrift_groups WHERE id = target_group_id;
  
  IF group_record.status != 'pending' THEN
    RETURN json_build_object('success', false, 'error', 'Thrift has already commenced or completed');
  END IF;
  
  SELECT ARRAY_AGG(user_id) INTO member_ids
  FROM public.group_memberships
  WHERE group_id = target_group_id AND status = 'active';
  
  member_count := array_length(member_ids, 1);
  
  IF member_count < 2 THEN
    RETURN json_build_object('success', false, 'error', 'Need at least 2 members to commence');
  END IF;
  
  shuffled_ids := member_ids;
  FOR i IN REVERSE member_count..2 LOOP
    j := floor(random() * i) + 1;
    temp := shuffled_ids[i];
    shuffled_ids[i] := shuffled_ids[j];
    shuffled_ids[j] := temp;
  END LOOP;
  
  CASE group_record.period
    WHEN 'daily' THEN next_contrib_date := now() + INTERVAL '1 day';
    WHEN 'weekly' THEN next_contrib_date := now() + INTERVAL '1 week';
    WHEN 'monthly' THEN next_contrib_date := now() + INTERVAL '1 month';
    ELSE next_contrib_date := now() + INTERVAL '1 week';
  END CASE;
  
  UPDATE public.thrift_groups
  SET 
    status = 'active',
    payout_order = shuffled_ids,
    current_payout_position = 1,
    current_cycle = 1,
    next_contribution_date = next_contrib_date,
    next_payout_date = next_contrib_date
  WHERE id = target_group_id;
  
  FOR i IN 1..member_count LOOP
    UPDATE public.group_memberships
    SET payout_position = i
    WHERE group_id = target_group_id AND user_id = shuffled_ids[i];
  END LOOP;
  
  INSERT INTO public.contribution_cycles (group_id, cycle_number, payout_recipient_id, contribution_deadline)
  VALUES (target_group_id, 1, shuffled_ids[1], next_contrib_date);
  
  INSERT INTO public.chat_messages (group_id, user_id, message, message_type, metadata)
  VALUES (
    target_group_id, 
    auth.uid(),
    'Thrift has commenced! Payout order has been randomized.',
    'system',
    json_build_object('payout_order', shuffled_ids)
  );
  
  RETURN json_build_object(
    'success', true, 
    'payout_order', shuffled_ids,
    'first_recipient', shuffled_ids[1],
    'next_contribution_date', next_contrib_date
  );
END;
$$;

-- Function to get payout order with member details
CREATE OR REPLACE FUNCTION public.get_payout_order(target_group_id UUID)
RETURNS TABLE (
  payout_position INTEGER,
  member_user_id UUID,
  member_full_name TEXT,
  member_username TEXT,
  member_avatar_url TEXT,
  member_has_received_payout BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    gm.payout_position,
    gm.user_id as member_user_id,
    p.full_name as member_full_name,
    p.username as member_username,
    p.avatar_url as member_avatar_url,
    gm.has_received_payout as member_has_received_payout
  FROM public.group_memberships gm
  JOIN public.profiles p ON p.id = gm.user_id
  WHERE gm.group_id = target_group_id
  AND gm.status = 'active'
  ORDER BY gm.payout_position;
$$;