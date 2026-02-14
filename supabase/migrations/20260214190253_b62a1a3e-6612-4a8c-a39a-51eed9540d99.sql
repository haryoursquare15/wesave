
-- Phase 2: Add pending_card tracking for contributions

-- Add card_charge_status to cycle_contributions to track card-based contributions
ALTER TABLE public.cycle_contributions
ADD COLUMN IF NOT EXISTS card_charge_status TEXT DEFAULT NULL;

-- Add flw_transaction_id for Flutterwave tracking
ALTER TABLE public.cycle_contributions
ADD COLUMN IF NOT EXISTS flw_transaction_id TEXT DEFAULT NULL;

-- Add card_charged_at timestamp
ALTER TABLE public.cycle_contributions
ADD COLUMN IF NOT EXISTS card_charged_at TIMESTAMPTZ DEFAULT NULL;

-- Add card_verified_at timestamp
ALTER TABLE public.cycle_contributions
ADD COLUMN IF NOT EXISTS card_verified_at TIMESTAMPTZ DEFAULT NULL;

-- Add card_charge_amount (may differ from contribution amount if fees apply)
ALTER TABLE public.cycle_contributions
ADD COLUMN IF NOT EXISTS card_charge_amount NUMERIC DEFAULT NULL;

-- Create a table for pending card charge reconciliation tracking
CREATE TABLE IF NOT EXISTS public.pending_card_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  group_id UUID NOT NULL REFERENCES public.thrift_groups(id),
  cycle_id UUID NOT NULL REFERENCES public.contribution_cycles(id),
  contribution_id UUID REFERENCES public.cycle_contributions(id),
  amount NUMERIC NOT NULL,
  tx_ref TEXT NOT NULL UNIQUE,
  flw_transaction_id TEXT,
  flw_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'unresolved')),
  failure_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.pending_card_charges ENABLE ROW LEVEL SECURITY;

-- Users can view their own pending charges
CREATE POLICY "Users can view own pending charges"
ON public.pending_card_charges FOR SELECT
USING (auth.uid() = user_id);

-- Service role handles inserts/updates (via edge functions)
-- Admin can view all
CREATE POLICY "Admins can view all pending charges"
ON public.pending_card_charges FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
);

-- Indexes for reconciliation worker
CREATE INDEX IF NOT EXISTS idx_pending_card_charges_status ON public.pending_card_charges(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pending_card_charges_user ON public.pending_card_charges(user_id);
CREATE INDEX IF NOT EXISTS idx_cycle_contributions_card_status ON public.cycle_contributions(card_charge_status) WHERE card_charge_status IS NOT NULL;
