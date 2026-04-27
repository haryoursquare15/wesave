-- Drop the overly permissive SELECT policy that exposed all membership rows
DROP POLICY IF EXISTS "Authenticated users can count group memberships" ON public.group_memberships;

-- Provide a safe count helper so the pool/browse view can still display member counts
-- for groups the user is NOT yet part of, without exposing sensitive membership columns.
CREATE OR REPLACE FUNCTION public.get_group_active_member_count(_group_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.group_memberships
  WHERE group_id = _group_id
    AND status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_group_active_member_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_active_member_count(uuid) TO authenticated;