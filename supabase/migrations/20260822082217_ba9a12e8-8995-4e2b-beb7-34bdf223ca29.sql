ALTER TABLE public.vfd_sandbox_clients
  ADD COLUMN IF NOT EXISTS kyc_previous_tier integer,
  ADD COLUMN IF NOT EXISTS kyc_pending_upgrade jsonb;