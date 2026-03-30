
-- =============================================
-- VFD SANDBOX PRODUCT TABLES
-- =============================================

-- 1. SANDBOX THRIFT GROUPS (AJO)
CREATE TABLE public.vfd_sandbox_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  admin_id uuid NOT NULL,
  contribution_amount numeric NOT NULL,
  period text NOT NULL DEFAULT 'monthly',
  max_members integer NOT NULL DEFAULT 5,
  member_count integer NOT NULL DEFAULT 1,
  current_cycle integer NOT NULL DEFAULT 1,
  total_cycles integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vfd_sandbox_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  payout_position integer,
  has_contributed_current boolean NOT NULL DEFAULT false,
  has_received_payout boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE public.vfd_sandbox_group_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  cycle_number integer NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vfd_sandbox_group_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  cycle_number integer NOT NULL,
  gross_amount numeric NOT NULL,
  platform_fee numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. SANDBOX TARGET AJO
CREATE TABLE public.vfd_sandbox_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  admin_id uuid NOT NULL,
  goal_amount numeric NOT NULL,
  contribution_amount numeric NOT NULL,
  frequency text NOT NULL DEFAULT 'daily',
  max_members integer NOT NULL DEFAULT 5,
  member_count integer NOT NULL DEFAULT 1,
  total_contributed numeric NOT NULL DEFAULT 0,
  savings_type text NOT NULL DEFAULT 'group',
  status text NOT NULL DEFAULT 'draft',
  target_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vfd_sandbox_target_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.vfd_sandbox_targets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  contributed_amount numeric NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(target_id, user_id)
);

CREATE TABLE public.vfd_sandbox_target_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.vfd_sandbox_targets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. SANDBOX GOAL FUNDING
CREATE TABLE public.vfd_sandbox_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  creator_id uuid NOT NULL,
  goal_amount numeric NOT NULL,
  raised_amount numeric NOT NULL DEFAULT 0,
  contributor_count integer NOT NULL DEFAULT 0,
  deadline timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vfd_sandbox_campaign_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.vfd_sandbox_campaigns(id) ON DELETE CASCADE,
  contributor_id uuid NOT NULL,
  amount numeric NOT NULL,
  anonymous boolean NOT NULL DEFAULT false,
  message text,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. SANDBOX SPLITPAY
CREATE TABLE public.vfd_sandbox_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  creator_id uuid NOT NULL,
  total_amount numeric NOT NULL,
  split_count integer NOT NULL DEFAULT 2,
  per_person_amount numeric NOT NULL,
  merchant_account text,
  merchant_bank text,
  merchant_name text,
  paid_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.vfd_sandbox_split_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid NOT NULL REFERENCES public.vfd_sandbox_splits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(split_id, user_id)
);

-- =============================================
-- RLS POLICIES
-- =============================================

ALTER TABLE public.vfd_sandbox_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_group_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_group_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_target_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_target_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_campaign_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_sandbox_split_participants ENABLE ROW LEVEL SECURITY;

-- Thrift Groups RLS
CREATE POLICY "Users can view sandbox groups" ON public.vfd_sandbox_groups
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create sandbox groups" ON public.vfd_sandbox_groups
  FOR INSERT TO authenticated WITH CHECK (admin_id = auth.uid());

CREATE POLICY "Users can view group members" ON public.vfd_sandbox_group_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view group contributions" ON public.vfd_sandbox_group_contributions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view group payouts" ON public.vfd_sandbox_group_payouts
  FOR SELECT TO authenticated USING (true);

-- Target Ajo RLS
CREATE POLICY "Users can view sandbox targets" ON public.vfd_sandbox_targets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create sandbox targets" ON public.vfd_sandbox_targets
  FOR INSERT TO authenticated WITH CHECK (admin_id = auth.uid());

CREATE POLICY "Users can view target members" ON public.vfd_sandbox_target_members
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can view target contributions" ON public.vfd_sandbox_target_contributions
  FOR SELECT TO authenticated USING (true);

-- Goal Funding RLS
CREATE POLICY "Users can view sandbox campaigns" ON public.vfd_sandbox_campaigns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create sandbox campaigns" ON public.vfd_sandbox_campaigns
  FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can view campaign contributions" ON public.vfd_sandbox_campaign_contributions
  FOR SELECT TO authenticated USING (true);

-- SplitPay RLS
CREATE POLICY "Users can view sandbox splits" ON public.vfd_sandbox_splits
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create sandbox splits" ON public.vfd_sandbox_splits
  FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Users can view split participants" ON public.vfd_sandbox_split_participants
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
