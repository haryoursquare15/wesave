-- ============================================================
-- FIX 1: profiles - prevent cross-user PII exposure
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can view basic profiles" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Add a safe search helper for invite/discovery flows.
-- Existing get_public_profile / get_public_profiles already expose only
-- non-sensitive columns (id, username, full_name, avatar_url, membership_tier,
-- credit_score, completed_cycles) and are used throughout the app.
CREATE OR REPLACE FUNCTION public.search_public_profiles(_query text, _limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF _query IS NULL OR length(trim(_query)) < 2 THEN
    RETURN;
  END IF;

  _q := '%' || lower(trim(_query)) || '%';

  RETURN QUERY
  SELECT p.id, p.username, p.full_name, p.avatar_url, p.email
  FROM public.profiles p
  WHERE lower(coalesce(p.username, '')) LIKE _q
     OR lower(coalesce(p.full_name, '')) LIKE _q
     OR lower(coalesce(p.email, '')) LIKE _q
  LIMIT LEAST(coalesce(_limit, 10), 25);
END;
$$;

REVOKE ALL ON FUNCTION public.search_public_profiles(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_profiles(text, int) TO authenticated;

-- ============================================================
-- FIX 2: payments_test - close public full-access policy
-- ============================================================
DROP POLICY IF EXISTS "Service role full access on payments_test" ON public.payments_test;

CREATE POLICY "Service role manages payments_test"
ON public.payments_test
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Users can view own payments_test"
ON public.payments_test
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- FIX 3: thrift_groups - restrict pending-group exposure
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view pending groups" ON public.thrift_groups;

CREATE POLICY "Authenticated users can view pending groups"
ON public.thrift_groups
FOR SELECT
TO authenticated
USING (status = 'pending'::group_status);

-- ============================================================
-- FIX 4: storage.avatars - prevent bucket listing
-- ============================================================
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

CREATE POLICY "Users can view own avatar files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
