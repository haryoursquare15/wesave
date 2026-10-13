-- lovable-cron-fallback-reviewed: live bank balances can only be polled (VFD offers no balance webhook); 15-min cadence matches the existing inflow catch-up backstop and the user approved this timing.
CREATE TABLE public.subaccount_balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_label text NOT NULL,
  account_number text NOT NULL,
  live_balance numeric,
  internal_expected numeric,
  drift numeric,
  error text,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subaccount_balance_snapshots TO authenticated;
GRANT ALL ON public.subaccount_balance_snapshots TO service_role;

ALTER TABLE public.subaccount_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read subaccount balance snapshots"
ON public.subaccount_balance_snapshots
FOR SELECT
TO authenticated
USING (public.is_any_admin(auth.uid()));

INSERT INTO public.internal_cron_tokens (name, token)
VALUES ('subaccount_balance_sweep', encode(gen_random_bytes(24), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.schedule(
  'subaccount-balance-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://sdwkqwmqgpsjrmijkdix.supabase.co/functions/v1/subaccount-balance-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select token from public.internal_cron_tokens where name = 'subaccount_balance_sweep')
    ),
    body := '{}'::jsonb
  );
  $$
);