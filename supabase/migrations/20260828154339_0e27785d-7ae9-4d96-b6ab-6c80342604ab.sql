ALTER TABLE public.vfd_sandbox_group_payouts
  ADD COLUMN IF NOT EXISTS cycle_id UUID,
  ADD COLUMN IF NOT EXISTS payout_reference TEXT,
  ADD COLUMN IF NOT EXISTS vfd_reference TEXT,
  ADD COLUMN IF NOT EXISTS vfd_session_id TEXT,
  ADD COLUMN IF NOT EXISTS recipient_nuban TEXT,
  ADD COLUMN IF NOT EXISTS bank_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS ledger_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS bank_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ledger_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reconciled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Historical rows were only ever written after a fully successful payout.
UPDATE public.vfd_sandbox_group_payouts
SET payout_status = 'completed',
    bank_status = CASE WHEN net_amount > 0 THEN 'confirmed' ELSE 'not_required' END,
    ledger_status = 'posted',
    completed_at = COALESCE(completed_at, created_at),
    bank_confirmed_at = COALESCE(bank_confirmed_at, created_at),
    ledger_posted_at = COALESCE(ledger_posted_at, created_at)
WHERE payout_status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS vfd_sandbox_group_payouts_group_cycle_uniq
  ON public.vfd_sandbox_group_payouts (group_id, cycle_number);

CREATE INDEX IF NOT EXISTS vfd_sandbox_group_payouts_recovery_idx
  ON public.vfd_sandbox_group_payouts (payout_status)
  WHERE payout_status <> 'completed';