ALTER TABLE public.vfd_savings_debit_schedule
  ADD COLUMN IF NOT EXISTS swept_to_subaccount_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subaccount_sweep_ref TEXT;

CREATE INDEX IF NOT EXISTS idx_vfd_savings_debit_schedule_unswept
  ON public.vfd_savings_debit_schedule (status, swept_to_subaccount_at)
  WHERE status = 'succeeded' AND swept_to_subaccount_at IS NULL;