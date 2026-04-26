-- ============================================================
-- FIX: ledger_confirmed_test - scope "full access" policy to service_role
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on ledger_confirmed_test" ON public.ledger_confirmed_test;

CREATE POLICY "Service role manages ledger_confirmed_test"
ON public.ledger_confirmed_test
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Allow users to view their own ledger entries
CREATE POLICY "Users can view own ledger_confirmed_test"
ON public.ledger_confirmed_test
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- FIX: storage.sandbox-campaign-images - prevent bucket listing
-- ============================================================
DROP POLICY IF EXISTS "Sandbox campaign images public read" ON storage.objects;

-- Owners can list/select their own campaign images
-- Public access to individual files continues via direct URL (public bucket)
CREATE POLICY "Sandbox campaign images owner read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sandbox-campaign-images'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- ============================================================
-- FIX: storage.email-assets - prevent bucket listing
-- ============================================================
-- email-assets has no SELECT policy currently? Re-check and tighten if present.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND qual LIKE '%email-assets%' AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END $$;

-- Authenticated admins can manage email assets; public access continues via
-- direct URL because the bucket is public. No broad SELECT policy needed.
CREATE POLICY "Email assets admin read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'email-assets'
  AND is_any_admin(auth.uid())
);
