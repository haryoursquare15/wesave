CREATE TABLE public.settlement_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type text NOT NULL,
  product_reference text NOT NULL,
  user_id uuid,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  source_account text,
  destination_account text,
  provider text NOT NULL DEFAULT 'vfd',
  provider_reference text NOT NULL,
  provider_session_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','failed','unreconciled')),
  attempts integer NOT NULL DEFAULT 0,
  ledger_posted boolean NOT NULL DEFAULT false,
  ledger_reference text,
  confirmed_at timestamptz,
  last_checked_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX settlement_records_provider_reference_key
  ON public.settlement_records (provider, provider_reference);
CREATE INDEX settlement_records_status_idx ON public.settlement_records (status, created_at);
CREATE INDEX settlement_records_product_idx ON public.settlement_records (product_type, product_reference);
CREATE INDEX settlement_records_user_idx ON public.settlement_records (user_id);

GRANT SELECT ON public.settlement_records TO authenticated;
GRANT ALL ON public.settlement_records TO service_role;

ALTER TABLE public.settlement_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their own settlement records"
ON public.settlement_records FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins view all settlement records"
ON public.settlement_records FOR SELECT TO authenticated
USING (public.is_any_admin(auth.uid()));

CREATE TRIGGER settlement_records_set_updated_at
BEFORE UPDATE ON public.settlement_records
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();