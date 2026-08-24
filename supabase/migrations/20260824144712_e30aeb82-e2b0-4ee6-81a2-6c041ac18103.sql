ALTER TABLE public.vfd_sandbox_group_members
  ADD COLUMN IF NOT EXISTS outstanding_owed numeric NOT NULL DEFAULT 0;

ALTER TABLE public.vfd_sandbox_penalties
  ADD COLUMN IF NOT EXISTS penalty_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missed_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz;

ALTER TABLE public.vfd_sandbox_group_payouts
  ADD COLUMN IF NOT EXISTS recovered_outstanding numeric NOT NULL DEFAULT 0;