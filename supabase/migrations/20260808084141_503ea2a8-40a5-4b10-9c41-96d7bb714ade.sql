SELECT cron.unschedule('vestara-interest-accrual-daily');

SELECT cron.schedule(
  'goalsave-debit-worker',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/goalsave-debit-worker',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT token FROM public.internal_cron_tokens WHERE name = 'goalsave_debit_worker')
    ),
    body:=concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  ) AS request_id;
  $cron$
);

SELECT cron.schedule(
  'group-join-reminder-daily',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url:='https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/group-join-reminder',
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (SELECT token FROM public.internal_cron_tokens WHERE name = 'group_join_reminder')
    ),
    body:='{"source":"cron","type":"reminder","audience":"pending"}'::jsonb
  ) AS request_id;
  $cron$
);