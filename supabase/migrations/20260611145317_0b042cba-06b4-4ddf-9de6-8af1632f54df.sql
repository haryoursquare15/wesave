
-- 1) Idempotency keys for outbound VFD money-moving calls
CREATE TABLE public.vfd_idempotency_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID,
  action TEXT NOT NULL,
  request_hash TEXT,
  transaction_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  response JSONB,
  http_status INTEGER,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfd_idem_user ON public.vfd_idempotency_keys(user_id);
CREATE INDEX idx_vfd_idem_ref ON public.vfd_idempotency_keys(transaction_reference);
CREATE INDEX idx_vfd_idem_status ON public.vfd_idempotency_keys(status);

GRANT ALL ON public.vfd_idempotency_keys TO service_role;
ALTER TABLE public.vfd_idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages idempotency keys"
  ON public.vfd_idempotency_keys FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2) Webhook dead-letter queue
CREATE TABLE public.vfd_webhook_dlq (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT,
  reference TEXT,
  payload JSONB NOT NULL,
  headers JSONB,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vfd_dlq_resolved ON public.vfd_webhook_dlq(resolved);
CREATE INDEX idx_vfd_dlq_ref ON public.vfd_webhook_dlq(reference);

GRANT ALL ON public.vfd_webhook_dlq TO service_role;
GRANT SELECT ON public.vfd_webhook_dlq TO authenticated; -- admins read via has_role check in UI
ALTER TABLE public.vfd_webhook_dlq ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manages dlq"
  ON public.vfd_webhook_dlq FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "admins can read dlq"
  ON public.vfd_webhook_dlq FOR SELECT
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 3) Reservation columns on vfd_sandbox_transactions
ALTER TABLE public.vfd_sandbox_transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vestara_reservation_ref TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vfd_sbx_tx_idem
  ON public.vfd_sandbox_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vfd_sbx_tx_vestara_ref
  ON public.vfd_sandbox_transactions(vestara_reservation_ref);

-- 4) updated_at trigger for idempotency keys
CREATE OR REPLACE FUNCTION public.touch_vfd_idem_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vfd_idem_updated
  BEFORE UPDATE ON public.vfd_idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION public.touch_vfd_idem_updated_at();
