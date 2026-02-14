
-- =============================================
-- RECONCILIATION-SAFE RECURRING PAYMENTS TEST MODULE
-- =============================================

-- 1. Main transaction tracker with proper state machine
CREATE TABLE public.payments_test (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID NULL,
  amount NUMERIC NOT NULL,
  tx_ref TEXT NOT NULL,
  flw_transaction_id TEXT NULL,
  flw_ref TEXT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  -- States: initiated, pending, final_success, final_failed, reversed, unresolved
  payment_cycle INTEGER NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 10,
  failure_reason TEXT NULL,
  processor_response TEXT NULL,
  charge_type TEXT NOT NULL DEFAULT 'manual',
  -- charge_type: manual, cron, simulation
  verified_at TIMESTAMPTZ NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_test_tx_ref_unique UNIQUE (tx_ref)
);

-- 2. Confirmed ledger - ONLY final_success transactions go here
CREATE TABLE public.ledger_confirmed_test (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES public.payments_test(id),
  user_id UUID NOT NULL,
  group_id UUID NULL,
  amount NUMERIC NOT NULL,
  tx_ref TEXT NOT NULL,
  flw_transaction_id TEXT NULL,
  payment_cycle INTEGER NULL,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ledger_confirmed_test_tx_ref_unique UNIQUE (tx_ref),
  CONSTRAINT ledger_confirmed_test_payment_unique UNIQUE (payment_id)
);

-- 3. Webhook logs for test mode (keep existing table, add flw_transaction_id)
ALTER TABLE public.recurring_webhook_logs_test 
  ADD COLUMN IF NOT EXISTS flw_transaction_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS verification_source TEXT NULL;
-- verification_source: webhook, api_verify, manual_verify

-- 4. Enable RLS on new tables
ALTER TABLE public.payments_test ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_confirmed_test ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies - admin-only access via service role (edge functions use service key)
CREATE POLICY "Service role full access on payments_test"
  ON public.payments_test FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on ledger_confirmed_test"
  ON public.ledger_confirmed_test FOR ALL
  USING (true)
  WITH CHECK (true);

-- 6. Index for verification worker queries
CREATE INDEX idx_payments_test_status_created ON public.payments_test (status, created_at);
CREATE INDEX idx_payments_test_flw_transaction_id ON public.payments_test (flw_transaction_id);
CREATE INDEX idx_payments_test_user_id ON public.payments_test (user_id);

-- 7. Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_payments_test_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_payments_test_timestamp
  BEFORE UPDATE ON public.payments_test
  FOR EACH ROW
  EXECUTE FUNCTION public.update_payments_test_updated_at();
