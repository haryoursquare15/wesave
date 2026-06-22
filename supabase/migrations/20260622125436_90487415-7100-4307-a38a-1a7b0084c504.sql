
CREATE TABLE public.internal_cron_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON public.internal_cron_tokens FROM anon, authenticated;
GRANT ALL ON public.internal_cron_tokens TO service_role;

ALTER TABLE public.internal_cron_tokens ENABLE ROW LEVEL SECURITY;
-- No policies = no client access; service_role bypasses RLS.

-- Seed the reconciler token (random, never exposed)
INSERT INTO public.internal_cron_tokens (name, token)
VALUES ('vfd_pool_reconciler', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;
