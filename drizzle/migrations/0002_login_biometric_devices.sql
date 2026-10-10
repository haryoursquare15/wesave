
CREATE TABLE IF NOT EXISTS public.login_biometric_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  device_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS login_biometric_devices_user_idx ON public.login_biometric_devices(user_id);
GRANT SELECT ON public.login_biometric_devices TO authenticated;
GRANT ALL ON public.login_biometric_devices TO service_role;
ALTER TABLE public.login_biometric_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner can read devices" ON public.login_biometric_devices FOR SELECT TO authenticated USING (user_id = auth.uid());
