-- lovable-cron-fallback-reviewed: 96 runs/day; inbound bank credit alerts are delivered via an external gateway that can go offline; statement polling is the only way to recover missed customer money within minutes.
insert into public.internal_cron_tokens (name, token)
values ('vfd_inflow_catchup', encode(gen_random_bytes(16), 'hex'))
on conflict (name) do nothing;

select cron.schedule(
  'vfd-inflow-catchup-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/vfd-inflow-catchup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'vfd_inflow_catchup')
    ),
    body := jsonb_build_object('days', 3)
  );
  $$
);