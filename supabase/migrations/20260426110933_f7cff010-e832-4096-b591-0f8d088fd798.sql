-- ===== Fix 1: Allow association members to view their own associations =====
CREATE POLICY "Members can view their associations"
ON public.associations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.association_memberships am
    WHERE am.association_id = associations.id
      AND am.user_id = auth.uid()
  )
);

-- ===== Fix 2: Restrict direct read of sensitive PII columns on vfd_sandbox_clients =====
-- Users can still read their own row (needed for app functionality), but the most
-- sensitive PII columns (BVN, NIN, address, date_of_birth) are revoked from the
-- "authenticated" role. They remain accessible to service_role and to admin roles
-- that go through SECURITY DEFINER RPCs. This prevents accidental client-side leakage
-- of unencrypted national-ID-grade data.
REVOKE SELECT (bvn, nin, address, date_of_birth) ON public.vfd_sandbox_clients FROM authenticated;
REVOKE SELECT (bvn, nin, address, date_of_birth) ON public.vfd_sandbox_clients FROM anon;

-- Provide a SECURITY DEFINER RPC for the user to fetch their OWN sensitive fields
-- when the application explicitly needs them (e.g. KYC review screen). This becomes
-- the audit-able choke point for sensitive PII access.
CREATE OR REPLACE FUNCTION public.get_own_vfd_client_pii()
RETURNS TABLE (
  bvn text,
  nin text,
  address text,
  date_of_birth text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT bvn, nin, address, date_of_birth
  FROM public.vfd_sandbox_clients
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_own_vfd_client_pii() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_own_vfd_client_pii() TO authenticated;