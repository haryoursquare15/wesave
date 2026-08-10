select cron.schedule(
  'recover-stuck-split-settlements',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-sandbox-products',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'bills_reconciler')
    ),
    body := jsonb_build_object('action','recover_stuck_split_settlements')
  );
  $$
);