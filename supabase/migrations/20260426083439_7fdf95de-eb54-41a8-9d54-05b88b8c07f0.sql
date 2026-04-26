
-- ===== Fix 1: Restrict pending thrift_groups visibility to the group admin only =====
DROP POLICY IF EXISTS "Authenticated users can view pending groups" ON public.thrift_groups;

CREATE POLICY "Group admin can view own pending group"
ON public.thrift_groups
FOR SELECT
TO authenticated
USING (status = 'pending'::group_status AND is_group_admin(id));

-- ===== Fix 2: Restrict sensitive VFD sandbox client fields to compliance/finance admins =====
-- Drop the broad admin SELECT policy
DROP POLICY IF EXISTS "Admins can view all VFD clients" ON public.vfd_sandbox_clients;

-- Only finance_admin, compliance_admin, and super_admin can read full client records (with BVN/NIN)
CREATE POLICY "Compliance and finance admins can view VFD clients"
ON public.vfd_sandbox_clients
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR has_role(auth.uid(), 'compliance_admin'::app_role)
  OR has_role(auth.uid(), 'finance_admin'::app_role)
);

-- Allow other admin roles (operations, support) to view non-sensitive fields via a SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.get_vfd_clients_redacted()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  vfd_client_id text,
  vfd_account_number text,
  full_name text,
  tier text,
  kyc_method text,
  consent_status text,
  account_status text,
  balance numeric,
  source text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, vfd_client_id, vfd_account_number, full_name,
         tier, kyc_method, consent_status, account_status, balance,
         source, created_at, updated_at
  FROM public.vfd_sandbox_clients
  WHERE public.is_any_admin(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_vfd_clients_redacted() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vfd_clients_redacted() TO authenticated;
