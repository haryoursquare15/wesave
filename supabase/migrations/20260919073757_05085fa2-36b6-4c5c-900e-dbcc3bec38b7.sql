ALTER TABLE public.vestara_fee_ledger DROP CONSTRAINT IF EXISTS vestara_fee_ledger_fee_type_check;
ALTER TABLE public.vestara_fee_ledger ADD CONSTRAINT vestara_fee_ledger_fee_type_check
  CHECK (fee_type = ANY (ARRAY['transfer_fee'::text,'stamp_duty'::text,'thrift_service_fee'::text,'thrift_penalty_fee'::text]));
CREATE UNIQUE INDEX IF NOT EXISTS vestara_fee_ledger_reference_uidx ON public.vestara_fee_ledger (reference);