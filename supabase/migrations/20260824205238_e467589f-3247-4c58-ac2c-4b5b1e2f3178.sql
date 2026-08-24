CREATE TABLE IF NOT EXISTS public.vfd_credential_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  token_mint_ok boolean NOT NULL DEFAULT false,
  token_mint_status text,
  account_scoped_ok boolean NOT NULL DEFAULT false,
  enquiry_status text,
  enquiry_message text,
  probed_account text,
  latency_ms integer,
  healthy boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  alerted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_vfd_credential_health_checked_at
  ON public.vfd_credential_health (checked_at DESC);

GRANT SELECT ON public.vfd_credential_health TO authenticated;
GRANT SELECT ON public.vfd_credential_health TO anon;
GRANT ALL ON public.vfd_credential_health TO service_role;

ALTER TABLE public.vfd_credential_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read banking service health" ON public.vfd_credential_health;
CREATE POLICY "Anyone can read banking service health"
  ON public.vfd_credential_health FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO public.internal_cron_tokens (name, token)
VALUES ('vfd_credential_health', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('vfd-credential-health-15min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vfd-credential-health-15min');

SELECT cron.schedule(
  'vfd-credential-health-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-credential-health',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-token', (SELECT token FROM public.internal_cron_tokens WHERE name = 'vfd_credential_health')
    ),
    body := '{}'::jsonb
  );
  $$
);