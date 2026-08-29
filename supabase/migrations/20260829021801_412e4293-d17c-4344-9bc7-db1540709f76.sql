SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'sandbox-ajo-auto-contribute';

SELECT cron.schedule(
  'sandbox-ajo-auto-contribute',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-sandbox-products',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'thrift_sweep')
    ),
    body := '{"action":"sandbox_auto_contribute"}'::jsonb
  );
  $$
);