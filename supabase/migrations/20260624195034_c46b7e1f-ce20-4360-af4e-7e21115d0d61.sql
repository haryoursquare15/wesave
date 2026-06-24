
-- 1. Extend vfd_sandbox_groups with pool ledger + commencement state
ALTER TABLE public.vfd_sandbox_groups
  ADD COLUMN IF NOT EXISTS pool_ledger_balance BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_contributed_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_paid_out_kobo BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commencement_status TEXT NOT NULL DEFAULT 'pending_members',
  ADD COLUMN IF NOT EXISTS current_cycle_index INTEGER NOT NULL DEFAULT 0;

-- 2. Extend vfd_sandbox_group_members with mandate expiry + payout order
ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS mandate_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_order INTEGER;

-- 3. Sandbox thrift ledger entries (kobo-only, append-only)
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_thrift_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thrift_group_id UUID NOT NULL REFERENCES public.vfd_sandbox_groups(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ddm_contribution','wallet_contribution','payout','reversal')),
  amount_kobo BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  cycle_index INTEGER,
  payment_reference TEXT,
  mandate_code TEXT,
  vfd_session_id TEXT,
  vfd_payment_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','reversed')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_thrift_ledger_group ON public.vfd_sandbox_thrift_ledger_entries(thrift_group_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_thrift_ledger_member ON public.vfd_sandbox_thrift_ledger_entries(member_user_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_thrift_ledger_ref ON public.vfd_sandbox_thrift_ledger_entries(payment_reference);

GRANT SELECT ON public.vfd_sandbox_thrift_ledger_entries TO authenticated;
GRANT ALL ON public.vfd_sandbox_thrift_ledger_entries TO service_role;

ALTER TABLE public.vfd_sandbox_thrift_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "member_read_own_ledger"
  ON public.vfd_sandbox_thrift_ledger_entries
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

CREATE POLICY "service_role_ledger_write"
  ON public.vfd_sandbox_thrift_ledger_entries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
