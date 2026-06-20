ALTER TABLE public.vfd_sandbox_transactions ADD COLUMN IF NOT EXISTS session_id text;
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_transactions_session_id ON public.vfd_sandbox_transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_vfd_sandbox_transactions_status_reserved_at ON public.vfd_sandbox_transactions(status, reserved_at) WHERE status IN ('reserved','pending');