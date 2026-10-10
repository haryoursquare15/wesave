
CREATE TABLE IF NOT EXISTS public.signup_email_otps (
  email text PRIMARY KEY,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);
GRANT ALL ON public.signup_email_otps TO service_role;
ALTER TABLE public.signup_email_otps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.signup_email_otps FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.login_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  pin_set_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.login_pins TO authenticated;
GRANT ALL ON public.login_pins TO service_role;
ALTER TABLE public.login_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can read status" ON public.login_pins FOR SELECT TO authenticated USING (user_id = auth.uid());
