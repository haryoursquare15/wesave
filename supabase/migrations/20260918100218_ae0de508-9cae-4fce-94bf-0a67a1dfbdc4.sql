DROP POLICY IF EXISTS "Anyone can view lock configs" ON public.vfd_lock_configs;
CREATE POLICY "Admins can view lock configs"
  ON public.vfd_lock_configs FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));
REVOKE SELECT ON public.vfd_lock_configs FROM anon;

DROP POLICY IF EXISTS "Anyone can read banking service health" ON public.vfd_credential_health;
CREATE POLICY "Admins can read banking service health"
  ON public.vfd_credential_health FOR SELECT
  TO authenticated
  USING (public.is_any_admin(auth.uid()));
REVOKE SELECT ON public.vfd_credential_health FROM anon;

DROP POLICY IF EXISTS "Authenticated read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Email assets public read" ON storage.objects;