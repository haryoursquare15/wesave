ALTER TABLE public.vfd_sandbox_contribution_audit
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS penalty_served boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sandbox_audit_retry
  ON public.vfd_sandbox_contribution_audit (status, next_retry_at)
  WHERE status = 'failed' AND penalty_served = false;

CREATE TABLE IF NOT EXISTS public.vfd_sandbox_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_id uuid NOT NULL,
  cycle_id uuid NOT NULL,
  amount numeric NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vfd_sandbox_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their sandbox penalties"
  ON public.vfd_sandbox_penalties FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());