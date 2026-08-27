ALTER TABLE public.mandates
  ADD COLUMN IF NOT EXISTS manual_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS manual_review_reason text,
  ADD COLUMN IF NOT EXISTS manual_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS expiry_final_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_fee_refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS setup_fee_refund_reference text;

ALTER TABLE public.vestara_savings DROP CONSTRAINT IF EXISTS vestara_savings_activation_status_check;
ALTER TABLE public.vestara_savings ADD CONSTRAINT vestara_savings_activation_status_check
  CHECK (activation_status = ANY (ARRAY['pending_mandate'::text,'active'::text,'matured'::text,'failed'::text,'expired'::text]));

ALTER TABLE public.vestara_savings DROP CONSTRAINT IF EXISTS vestara_savings_mandate_status_check;
ALTER TABLE public.vestara_savings ADD CONSTRAINT vestara_savings_mandate_status_check
  CHECK (mandate_status = ANY (ARRAY['pending'::text,'authorized'::text,'failed'::text,'cancelled'::text,'expired'::text]));

ALTER TABLE public.vestara_savings
  ADD COLUMN IF NOT EXISTS mandate_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_mandates_pending_expiry
  ON public.mandates (expires_at) WHERE status = 'pending';

SELECT cron.schedule(
  'vfd-mandate-expiry-sweep',
  '10 */3 * * *',
  $$
  select net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-mandate-engine',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'mandate_engine')
    ),
    body := '{"action":"expiry_sweep","limit":100}'::jsonb
  );
  $$
);