
-- =============================================
-- RECURRING CHARGE TEST MODULE - ISOLATED TABLES
-- These tables are COMPLETELY separate from production
-- =============================================

-- Test payment tokens (isolated from production card_tokens)
CREATE TABLE public.user_payment_tokens_test (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  card_token TEXT NOT NULL,
  first_6digits TEXT,
  last_4digits TEXT,
  expiry TEXT,
  card_type TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_payment_tokens_test ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test tokens"
  ON public.user_payment_tokens_test FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Test webhook logs
CREATE TABLE public.recurring_webhook_logs_test (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  tx_ref TEXT,
  flw_ref TEXT,
  status TEXT,
  amount NUMERIC,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_webhook_logs_test ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view test webhook logs"
  ON public.recurring_webhook_logs_test FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Test ledger entries (isolated from production ledger_entries)
CREATE TABLE public.test_ledger_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID,
  amount NUMERIC NOT NULL,
  tx_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_cycle INTEGER DEFAULT 1,
  retry_count INTEGER DEFAULT 0,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.test_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test ledger"
  ON public.test_ledger_entries FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Test group for recurring charges
CREATE TABLE public.test_recurring_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  contribution_amount NUMERIC NOT NULL DEFAULT 1000,
  frequency TEXT NOT NULL DEFAULT 'daily',
  mode TEXT NOT NULL DEFAULT 'tokenized_recurring',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.test_recurring_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test groups"
  ON public.test_recurring_groups FOR ALL
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')));

-- Insert default test group
INSERT INTO public.test_recurring_groups (name, contribution_amount, frequency, mode)
VALUES ('Recurring Test Group', 1000, 'daily', 'tokenized_recurring');
