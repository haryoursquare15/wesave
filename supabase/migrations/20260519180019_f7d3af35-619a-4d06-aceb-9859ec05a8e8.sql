
-- ============================================================
-- BILLS POWER-UP: Beneficiaries, Receipts, Recurring Bills
-- ============================================================

-- Beneficiaries
CREATE TABLE public.vfd_sandbox_bill_beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nickname TEXT NOT NULL,
  category TEXT NOT NULL,
  biller_id TEXT NOT NULL,
  biller_name TEXT NOT NULL,
  division TEXT NOT NULL,
  product_id TEXT NOT NULL,
  payment_item_code TEXT,
  payment_item_name TEXT,
  customer_id TEXT NOT NULL,
  phone_number TEXT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, biller_id, customer_id)
);
CREATE INDEX idx_bill_benef_user ON public.vfd_sandbox_bill_beneficiaries(user_id);

ALTER TABLE public.vfd_sandbox_bill_beneficiaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own beneficiaries select" ON public.vfd_sandbox_bill_beneficiaries
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own beneficiaries insert" ON public.vfd_sandbox_bill_beneficiaries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own beneficiaries update" ON public.vfd_sandbox_bill_beneficiaries
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own beneficiaries delete" ON public.vfd_sandbox_bill_beneficiaries
  FOR DELETE USING (auth.uid() = user_id);

-- Receipts
CREATE TABLE public.vfd_sandbox_bill_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  biller_id TEXT NOT NULL,
  biller_name TEXT NOT NULL,
  payment_item_name TEXT,
  customer_id TEXT NOT NULL,
  phone_number TEXT,
  amount NUMERIC NOT NULL,
  convenience_fee NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  raw_response JSONB,
  recurring_bill_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bill_receipts_user ON public.vfd_sandbox_bill_receipts(user_id, paid_at DESC);
CREATE INDEX idx_bill_receipts_expiring ON public.vfd_sandbox_bill_receipts(expires_at) WHERE expires_at IS NOT NULL AND reminder_sent_at IS NULL;

ALTER TABLE public.vfd_sandbox_bill_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own receipts select" ON public.vfd_sandbox_bill_receipts
  FOR SELECT USING (auth.uid() = user_id);

-- Recurring bills (wallet-funded only, no card)
CREATE TABLE public.vfd_sandbox_recurring_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  nickname TEXT,
  category TEXT NOT NULL,
  biller_id TEXT NOT NULL,
  biller_name TEXT NOT NULL,
  division TEXT NOT NULL,
  product_id TEXT NOT NULL,
  payment_item_code TEXT NOT NULL,
  payment_item_name TEXT,
  customer_id TEXT NOT NULL,
  phone_number TEXT,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month SMALLINT CHECK (day_of_month BETWEEN 1 AND 28),
  hour_wat SMALLINT NOT NULL DEFAULT 16,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','cancelled')),
  next_run_at TIMESTAMPTZ NOT NULL,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  last_run_reason TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_recurring_bills_user ON public.vfd_sandbox_recurring_bills(user_id);
CREATE INDEX idx_recurring_bills_due ON public.vfd_sandbox_recurring_bills(next_run_at) WHERE status = 'active';

ALTER TABLE public.vfd_sandbox_recurring_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recurring select" ON public.vfd_sandbox_recurring_bills
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own recurring insert" ON public.vfd_sandbox_recurring_bills
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own recurring update" ON public.vfd_sandbox_recurring_bills
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own recurring delete" ON public.vfd_sandbox_recurring_bills
  FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger reusing existing function
CREATE TRIGGER trg_bill_benef_updated_at BEFORE UPDATE ON public.vfd_sandbox_bill_beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_recurring_bills_updated_at BEFORE UPDATE ON public.vfd_sandbox_recurring_bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
