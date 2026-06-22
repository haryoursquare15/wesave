
-- Reconciliation runs log for corporate pool vs ledger sum
CREATE TABLE public.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  run_type text NOT NULL DEFAULT 'corporate_pool', -- 'corporate_pool' | 'per_nuban'
  vfd_corporate_balance numeric(18,2),
  ledger_sum numeric(18,2),
  variance numeric(18,2),
  status text NOT NULL CHECK (status IN ('matched','discrepancy','error')),
  notes text,
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reconciliation_runs_run_at ON public.reconciliation_runs(run_at DESC);
CREATE INDEX idx_reconciliation_runs_status ON public.reconciliation_runs(status) WHERE status <> 'matched';

GRANT SELECT ON public.reconciliation_runs TO authenticated;
GRANT ALL ON public.reconciliation_runs TO service_role;

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read; no client writes (service_role bypasses RLS)
CREATE POLICY "Admins can view reconciliation runs"
  ON public.reconciliation_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));
