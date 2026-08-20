select cron.schedule(
  'thrift-poll-pending-mandates',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-sandbox-products',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'mandate_engine')
    ),
    body := '{"action":"poll_pending_mandates"}'::jsonb
  );
  $$
);