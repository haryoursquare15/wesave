
-- Lock Funds Configuration Table
CREATE TABLE public.vfd_lock_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duration_months integer NOT NULL,
  interest_rate numeric NOT NULL,
  early_withdrawal_penalty numeric NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(duration_months)
);

-- Insert default configs (conservative rates)
INSERT INTO public.vfd_lock_configs (duration_months, interest_rate, early_withdrawal_penalty) VALUES
  (3, 4.0, 100),
  (6, 5.5, 75),
  (9, 7.0, 50),
  (12, 8.0, 25);

-- User Balance Tracking (internal ledger layer on top of VFD)
CREATE TABLE public.vfd_user_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  total_balance numeric NOT NULL DEFAULT 0,
  locked_balance numeric NOT NULL DEFAULT 0,
  savings_balance numeric NOT NULL DEFAULT 0,
  available_balance numeric GENERATED ALWAYS AS (total_balance - locked_balance - savings_balance) STORED,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Locked Funds Records
CREATE TABLE public.vfd_locked_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  principal_amount numeric NOT NULL,
  interest_rate numeric NOT NULL,
  duration_months integer NOT NULL,
  expected_interest numeric NOT NULL,
  total_payout numeric NOT NULL,
  start_date timestamptz NOT NULL DEFAULT now(),
  maturity_date timestamptz NOT NULL,
  actual_unlock_date timestamptz,
  penalty_amount numeric DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'vfd_sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Interest Accrual Tracking
CREATE TABLE public.vfd_interest_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lock_id uuid NOT NULL REFERENCES public.vfd_locked_funds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  accrual_date date NOT NULL,
  daily_interest numeric NOT NULL,
  cumulative_interest numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Lock Fund Ledger (tracks all lock-related movements)
CREATE TABLE public.vfd_lock_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lock_id uuid REFERENCES public.vfd_locked_funds(id),
  entry_type text NOT NULL,
  amount numeric NOT NULL,
  balance_before numeric NOT NULL DEFAULT 0,
  balance_after numeric NOT NULL DEFAULT 0,
  locked_before numeric NOT NULL DEFAULT 0,
  locked_after numeric NOT NULL DEFAULT 0,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vfd_lock_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_user_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_locked_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_interest_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vfd_lock_ledger ENABLE ROW LEVEL SECURITY;

-- RLS: Lock configs readable by all authenticated users
CREATE POLICY "Anyone can view lock configs" ON public.vfd_lock_configs
  FOR SELECT TO authenticated USING (true);

-- RLS: Users can view own balances
CREATE POLICY "Users can view own balances" ON public.vfd_user_balances
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS: Users can view own locked funds
CREATE POLICY "Users can view own locks" ON public.vfd_locked_funds
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS: Users can view own interest accruals
CREATE POLICY "Users can view own accruals" ON public.vfd_interest_accruals
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS: Users can view own lock ledger
CREATE POLICY "Users can view own lock ledger" ON public.vfd_lock_ledger
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Admin policies
CREATE POLICY "Admins can view all balances" ON public.vfd_user_balances
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can view all locks" ON public.vfd_locked_funds
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can view all accruals" ON public.vfd_interest_accruals
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can view all lock ledger" ON public.vfd_lock_ledger
  FOR SELECT TO authenticated USING (is_any_admin(auth.uid()));

NOTIFY pgrst, 'reload schema';
