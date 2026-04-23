ALTER TABLE public.vfd_sandbox_campaigns
  ADD COLUMN IF NOT EXISTS escrow_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_withdrawn numeric NOT NULL DEFAULT 0;