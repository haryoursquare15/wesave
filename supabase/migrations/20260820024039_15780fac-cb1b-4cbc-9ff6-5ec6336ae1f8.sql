CREATE TABLE IF NOT EXISTS public.vfd_fee_sweeps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vfd_account_number text NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reference text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
  vfd_reference text,
  error text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS vfd_fee_sweeps_reference_key ON public.vfd_fee_sweeps (reference);
CREATE INDEX IF NOT EXISTS vfd_fee_sweeps_user_status_idx ON public.vfd_fee_sweeps (user_id, status);

GRANT SELECT ON public.vfd_fee_sweeps TO authenticated;
GRANT ALL ON public.vfd_fee_sweeps TO service_role;

ALTER TABLE public.vfd_fee_sweeps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view fee sweeps"
ON public.vfd_fee_sweeps FOR SELECT TO authenticated
USING (public.is_any_admin());