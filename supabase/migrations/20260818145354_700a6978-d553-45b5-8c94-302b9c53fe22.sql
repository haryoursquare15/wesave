CREATE TABLE public.mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('thrift','fd_investment')),
  product_reference text NOT NULL,
  mandate_reference text NOT NULL UNIQUE,
  mandate_code text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','bank_approved','rejected','expired','revoked')),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  frequency text NOT NULL DEFAULT '3',
  start_date date,
  end_date date,
  payer_bank_code text,
  payer_account_number text,
  payer_phone text,
  payer_email text,
  payer_address text,
  nibss_account text,
  nibss_message text,
  setup_fee numeric(18,2) NOT NULL DEFAULT 0,
  setup_fee_internal_share numeric(18,2) NOT NULL DEFAULT 0,
  setup_fee_nibss_share numeric(18,2) NOT NULL DEFAULT 0,
  setup_fee_reference text UNIQUE,
  setup_fee_charged_at timestamptz,
  bank_approved_at timestamptz,
  resolved_at timestamptz,
  rejection_reason text,
  last_polled_at timestamptz,
  poll_count integer NOT NULL DEFAULT 0,
  vfd_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mandates_user ON public.mandates(user_id);
CREATE INDEX idx_mandates_status ON public.mandates(status);
CREATE INDEX idx_mandates_product ON public.mandates(product_type, product_reference);

GRANT SELECT ON public.mandates TO authenticated;
GRANT ALL ON public.mandates TO service_role;
ALTER TABLE public.mandates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own mandates" ON public.mandates
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all mandates" ON public.mandates
  FOR SELECT TO authenticated USING (public.is_any_admin());

CREATE TABLE public.mandate_debit_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id uuid NOT NULL REFERENCES public.mandates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  scheduled_date date NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  transaction_reference text NOT NULL UNIQUE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight','succeeded','failed')),
  failure_class text,
  failure_reason text,
  ledger_posted boolean NOT NULL DEFAULT false,
  ledger_reference text,
  vfd_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_review boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mandate_debit_attempts_unique_cycle UNIQUE (mandate_id, scheduled_date)
);

CREATE INDEX idx_mandate_attempts_mandate ON public.mandate_debit_attempts(mandate_id);
CREATE INDEX idx_mandate_attempts_user ON public.mandate_debit_attempts(user_id);

GRANT SELECT ON public.mandate_debit_attempts TO authenticated;
GRANT ALL ON public.mandate_debit_attempts TO service_role;
ALTER TABLE public.mandate_debit_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own debit attempts" ON public.mandate_debit_attempts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all debit attempts" ON public.mandate_debit_attempts
  FOR SELECT TO authenticated USING (public.is_any_admin());

CREATE TABLE public.mandate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id uuid REFERENCES public.mandates(id) ON DELETE CASCADE,
  user_id uuid,
  mandate_reference text,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mandate_events_mandate ON public.mandate_events(mandate_id, created_at DESC);

GRANT SELECT ON public.mandate_events TO authenticated;
GRANT ALL ON public.mandate_events TO service_role;
ALTER TABLE public.mandate_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own mandate events" ON public.mandate_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all mandate events" ON public.mandate_events
  FOR SELECT TO authenticated USING (public.is_any_admin());

CREATE TRIGGER trg_mandates_updated_at BEFORE UPDATE ON public.mandates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_mandate_attempts_updated_at BEFORE UPDATE ON public.mandate_debit_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_mandate_debit_attempt(
  _mandate_id uuid,
  _scheduled_date date,
  _amount numeric,
  _transaction_reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m public.mandates%ROWTYPE;
  _key text;
  _attempt public.mandate_debit_attempts%ROWTYPE;
  _new_id uuid;
BEGIN
  IF NOT (public.is_backend_role() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO _m FROM public.mandates WHERE id = _mandate_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'mandate_not_found');
  END IF;
  IF _m.status <> 'bank_approved' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'mandate_not_approved', 'status', _m.status);
  END IF;

  _key := _mandate_id::text || '|' || _scheduled_date::text;

  INSERT INTO public.mandate_debit_attempts
    (mandate_id, user_id, scheduled_date, idempotency_key, transaction_reference, amount)
  VALUES (_mandate_id, _m.user_id, _scheduled_date, _key, _transaction_reference, _amount)
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO _new_id;

  IF _new_id IS NULL THEN
    SELECT * INTO _attempt FROM public.mandate_debit_attempts WHERE idempotency_key = _key;
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'already_attempted',
      'attempt_id', _attempt.id, 'attempt_status', _attempt.status
    );
  END IF;

  RETURN jsonb_build_object('claimed', true, 'attempt_id', _new_id, 'idempotency_key', _key, 'user_id', _m.user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mandate_debit_attempt(uuid, date, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_mandate_debit_attempt(uuid, date, numeric, text) TO service_role;