
-- ============================================================
-- VESTARA DOUBLE-ENTRY LEDGER — PHASE 1: CORE TABLES
-- ============================================================

-- 1. Enums
CREATE TYPE public.vestara_account_type AS ENUM (
  'wallet', 'locked_savings', 'accrued_interest',
  'thrift_pool', 'crowdfunding_pool', 'split_holding',
  'settlement', 'interest_expense', 'revenue'
);

CREATE TYPE public.vestara_tx_type AS ENUM (
  'deposit', 'withdrawal', 'lock', 'unlock',
  'thrift_contribution', 'thrift_payout',
  'split_payment', 'split_distribution',
  'crowdfunding_contribution', 'crowdfunding_disbursement',
  'interest_accrual', 'interest_payout', 'fee'
);

CREATE TYPE public.vestara_tx_status AS ENUM (
  'pending', 'completed', 'failed', 'reversed'
);

-- 2. Accounts table
CREATE TABLE public.vestara_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  account_type public.vestara_account_type NOT NULL,
  balance NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NGN',
  is_system BOOLEAN NOT NULL DEFAULT false,
  group_ref UUID,        -- FK-free ref to thrift group
  campaign_ref UUID,     -- FK-free ref to crowdfunding campaign
  split_ref UUID,        -- FK-free ref to split request
  label TEXT,            -- human-readable label
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vestara_accounts_user ON public.vestara_accounts(user_id);
CREATE INDEX idx_vestara_accounts_type ON public.vestara_accounts(account_type);
CREATE INDEX idx_vestara_accounts_group ON public.vestara_accounts(group_ref) WHERE group_ref IS NOT NULL;
CREATE INDEX idx_vestara_accounts_campaign ON public.vestara_accounts(campaign_ref) WHERE campaign_ref IS NOT NULL;
CREATE INDEX idx_vestara_accounts_split ON public.vestara_accounts(split_ref) WHERE split_ref IS NOT NULL;

-- Unique constraints: one wallet per user, one system account per type
CREATE UNIQUE INDEX idx_vestara_accounts_user_wallet
  ON public.vestara_accounts(user_id, account_type)
  WHERE account_type = 'wallet' AND is_system = false;

CREATE UNIQUE INDEX idx_vestara_accounts_system
  ON public.vestara_accounts(account_type)
  WHERE is_system = true;

-- 3. Transactions table
CREATE TABLE public.vestara_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.vestara_tx_type NOT NULL,
  status public.vestara_tx_status NOT NULL DEFAULT 'pending',
  reference TEXT NOT NULL UNIQUE,
  amount NUMERIC(18,2) NOT NULL,
  initiated_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_vestara_tx_status ON public.vestara_transactions(status);
CREATE INDEX idx_vestara_tx_type ON public.vestara_transactions(type);
CREATE INDEX idx_vestara_tx_initiated ON public.vestara_transactions(initiated_by);
CREATE INDEX idx_vestara_tx_created ON public.vestara_transactions(created_at DESC);

-- 4. Ledger entries table (double-entry)
CREATE TABLE public.vestara_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.vestara_transactions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.vestara_accounts(id),
  debit NUMERIC(18,2) NOT NULL DEFAULT 0,
  credit NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_debit_or_credit CHECK (
    (debit > 0 AND credit = 0) OR (debit = 0 AND credit > 0)
  )
);

CREATE INDEX idx_vestara_ledger_tx ON public.vestara_ledger_entries(transaction_id);
CREATE INDEX idx_vestara_ledger_account ON public.vestara_ledger_entries(account_id);
CREATE INDEX idx_vestara_ledger_created ON public.vestara_ledger_entries(created_at DESC);

-- 5. Reconciliation log
CREATE TABLE public.vestara_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_balance NUMERIC(18,2) NOT NULL,
  vfd_balance NUMERIC(18,2) NOT NULL,
  discrepancy NUMERIC(18,2) NOT NULL DEFAULT 0,
  resolved BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Enable RLS on all tables
ALTER TABLE public.vestara_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vestara_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vestara_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vestara_reconciliation_log ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies

-- vestara_accounts: users see their own accounts
CREATE POLICY "Users can view own accounts"
  ON public.vestara_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- vestara_transactions: users see transactions they initiated
CREATE POLICY "Users can view own transactions"
  ON public.vestara_transactions FOR SELECT TO authenticated
  USING (initiated_by = auth.uid());

-- vestara_ledger_entries: users see entries for their accounts
CREATE POLICY "Users can view own ledger entries"
  ON public.vestara_ledger_entries FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT id FROM public.vestara_accounts WHERE user_id = auth.uid()
    )
  );

-- reconciliation_log: admin only (via has_role)
CREATE POLICY "Admins can view reconciliation logs"
  ON public.vestara_reconciliation_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. Updated_at trigger for accounts
CREATE OR REPLACE FUNCTION public.vestara_update_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vestara_accounts_updated
  BEFORE UPDATE ON public.vestara_accounts
  FOR EACH ROW EXECUTE FUNCTION public.vestara_update_timestamp();

-- 9. Seed system accounts
INSERT INTO public.vestara_accounts (account_type, balance, is_system, label)
VALUES
  ('settlement', 0, true, 'VFD Settlement Account'),
  ('interest_expense', 0, true, 'Interest Expense Account'),
  ('revenue', 0, true, 'Platform Revenue Account');

-- 10. Auto-provision wallet on user signup
CREATE OR REPLACE FUNCTION public.vestara_provision_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vestara_accounts (user_id, account_type, label)
  VALUES (NEW.id, 'wallet', 'User Wallet')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vestara_provision_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.vestara_provision_wallet();

-- 11. Notify PostgREST of schema changes
NOTIFY pgrst, 'reload schema';
