CREATE TABLE public.vfd_sandbox_transfer_beneficiaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  alias TEXT NOT NULL,
  account_number TEXT NOT NULL,
  bank_code TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  beneficiary_name TEXT NOT NULL,
  is_intra BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bank_code, account_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vfd_sandbox_transfer_beneficiaries TO authenticated;
GRANT ALL ON public.vfd_sandbox_transfer_beneficiaries TO service_role;

ALTER TABLE public.vfd_sandbox_transfer_beneficiaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own transfer beneficiaries"
  ON public.vfd_sandbox_transfer_beneficiaries
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_transfer_benef_user_recent
  ON public.vfd_sandbox_transfer_beneficiaries (user_id, last_used_at DESC NULLS LAST);

CREATE OR REPLACE FUNCTION public.touch_transfer_benef_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_transfer_benef_updated_at
  BEFORE UPDATE ON public.vfd_sandbox_transfer_beneficiaries
  FOR EACH ROW EXECUTE FUNCTION public.touch_transfer_benef_updated_at();