SELECT cron.unschedule('vfd-fee-sweep-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vfd-fee-sweep-daily');

SELECT cron.schedule(
  'vfd-fee-sweep-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-fee-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT token FROM public.internal_cron_tokens WHERE name = 'vfd-fee-sweep')
    ),
    body := '{}'::jsonb
  );
  $$
);