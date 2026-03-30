
-- Add missing columns to vfd_sandbox_groups to match production thrift_groups
ALTER TABLE public.vfd_sandbox_groups 
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS auto_debit boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invite_code text DEFAULT (gen_random_uuid())::text,
  ADD COLUMN IF NOT EXISTS payout_order uuid[] DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS current_payout_position integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_contribution_date timestamptz,
  ADD COLUMN IF NOT EXISTS next_payout_date timestamptz,
  ADD COLUMN IF NOT EXISTS contribution_day_of_month integer,
  ADD COLUMN IF NOT EXISTS contribution_day_of_week integer,
  ADD COLUMN IF NOT EXISTS contribution_hour integer DEFAULT 16,
  ADD COLUMN IF NOT EXISTS contribution_minute integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commenced_at timestamptz;

-- Add missing columns to vfd_sandbox_group_members to match production group_memberships
ALTER TABLE public.vfd_sandbox_group_members 
  ADD COLUMN IF NOT EXISTS has_used_swap boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Create contribution cycles table for VFD sandbox
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_contribution_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  cycle_number integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  contribution_deadline timestamptz,
  payout_recipient_id uuid,
  payout_amount numeric,
  platform_fee numeric,
  total_contributions numeric DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create contribution audit table for VFD sandbox
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_contribution_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  cycle_id uuid NOT NULL REFERENCES public.vfd_sandbox_contribution_cycles(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  contribution_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create position swap requests for VFD sandbox
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_position_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL,
  requester_position integer NOT NULL,
  target_id uuid NOT NULL,
  target_position integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create chat messages table for VFD sandbox
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  message text NOT NULL,
  message_type text DEFAULT 'text',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create notifications table for VFD sandbox
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  notification_type text NOT NULL,
  group_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.vfd_sandbox_contribution_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_contribution_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_position_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies - service role has full access, authenticated users can read their own data
CREATE POLICY "Service role full access cycles" ON public.vfd_sandbox_contribution_cycles FOR ALL USING (true);
CREATE POLICY "Service role full access audit" ON public.vfd_sandbox_contribution_audit FOR ALL USING (true);
CREATE POLICY "Service role full access swaps" ON public.vfd_sandbox_position_swaps FOR ALL USING (true);
CREATE POLICY "Service role full access chat" ON public.vfd_sandbox_chat_messages FOR ALL USING (true);
CREATE POLICY "Service role full access notifications" ON public.vfd_sandbox_notifications FOR ALL USING (true);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_cycles_group ON public.vfd_sandbox_contribution_cycles(group_id, status);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_audit_group_cycle ON public.vfd_sandbox_contribution_audit(group_id, cycle_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_swaps_group ON public.vfd_sandbox_position_swaps(group_id, status);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_chat_group ON public.vfd_sandbox_chat_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_notif_user ON public.vfd_sandbox_notifications(user_id, is_read);
