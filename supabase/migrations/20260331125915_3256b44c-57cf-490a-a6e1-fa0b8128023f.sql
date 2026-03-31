
-- =============================================
-- VFD SANDBOX PARITY: Target Ajo extensions
-- =============================================

-- Add missing columns to vfd_sandbox_targets
ALTER TABLE public.vfd_sandbox_targets 
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS invite_limit integer DEFAULT 0;

-- Target Ajo invites
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_target_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.vfd_sandbox_targets(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(target_id, invitee_id)
);

ALTER TABLE public.vfd_sandbox_target_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read target invites" ON public.vfd_sandbox_target_invites FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages target invites" ON public.vfd_sandbox_target_invites FOR ALL TO service_role USING (true);

-- Target Ajo withdrawal requests (group mode voting)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_target_withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL REFERENCES public.vfd_sandbox_targets(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  amount numeric NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending',
  required_votes integer NOT NULL DEFAULT 1,
  approval_count integer NOT NULL DEFAULT 0,
  rejection_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.vfd_sandbox_target_withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read target wr" ON public.vfd_sandbox_target_withdrawal_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages target wr" ON public.vfd_sandbox_target_withdrawal_requests FOR ALL TO service_role USING (true);

-- Target Ajo withdrawal votes
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_target_withdrawal_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id uuid NOT NULL REFERENCES public.vfd_sandbox_target_withdrawal_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  vote text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(withdrawal_request_id, user_id)
);

ALTER TABLE public.vfd_sandbox_target_withdrawal_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read target votes" ON public.vfd_sandbox_target_withdrawal_votes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages target votes" ON public.vfd_sandbox_target_withdrawal_votes FOR ALL TO service_role USING (true);

-- =============================================
-- VFD SANDBOX PARITY: SplitPay extensions
-- =============================================

-- Add missing columns to vfd_sandbox_splits
ALTER TABLE public.vfd_sandbox_splits
  ADD COLUMN IF NOT EXISTS merchant_account_name text,
  ADD COLUMN IF NOT EXISTS merchant_bank_name text,
  ADD COLUMN IF NOT EXISTS merchant_account_number text,
  ADD COLUMN IF NOT EXISTS platform_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiry_date timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_status text,
  ADD COLUMN IF NOT EXISTS settlement_reference text,
  ADD COLUMN IF NOT EXISTS settlement_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement_failure_reason text;

-- Add paid_at to split participants
ALTER TABLE public.vfd_sandbox_split_participants
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Split transactions ledger
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_split_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid NOT NULL REFERENCES public.vfd_sandbox_splits(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vfd_sandbox_split_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read split tx" ON public.vfd_sandbox_split_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages split tx" ON public.vfd_sandbox_split_transactions FOR ALL TO service_role USING (true);

-- =============================================
-- VFD SANDBOX PARITY: Goal Funding extensions
-- =============================================

-- Add missing columns to vfd_sandbox_campaigns
ALTER TABLE public.vfd_sandbox_campaigns
  ADD COLUMN IF NOT EXISTS campaign_slug text,
  ADD COLUMN IF NOT EXISTS contribution_visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS beneficiary_account_name text,
  ADD COLUMN IF NOT EXISTS beneficiary_bank_name text,
  ADD COLUMN IF NOT EXISTS beneficiary_account_number text,
  ADD COLUMN IF NOT EXISTS campaign_image text;

-- Add missing columns to campaign contributions
ALTER TABLE public.vfd_sandbox_campaign_contributions
  ADD COLUMN IF NOT EXISTS contributor_name text,
  ADD COLUMN IF NOT EXISTS contribution_reference text;

-- Campaign updates/activity feed
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_campaign_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.vfd_sandbox_campaigns(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  update_message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vfd_sandbox_campaign_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read campaign updates" ON public.vfd_sandbox_campaign_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages campaign updates" ON public.vfd_sandbox_campaign_updates FOR ALL TO service_role USING (true);

-- =============================================
-- VFD SANDBOX PARITY: Thrift Group extensions
-- =============================================

-- Add missing scheduling columns to vfd_sandbox_groups
ALTER TABLE public.vfd_sandbox_groups
  ADD COLUMN IF NOT EXISTS contribution_day_of_week integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contribution_day_of_month integer DEFAULT 1;

-- Thrift group payouts table (if not exists)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_group_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  cycle_number integer NOT NULL,
  gross_amount numeric NOT NULL,
  platform_fee numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vfd_sandbox_group_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read group payouts" ON public.vfd_sandbox_group_payouts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages group payouts" ON public.vfd_sandbox_group_payouts FOR ALL TO service_role USING (true);
