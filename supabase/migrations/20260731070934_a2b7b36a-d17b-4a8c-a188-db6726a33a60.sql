CREATE OR REPLACE FUNCTION public.can_self_join_group(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.member_invites mi
    WHERE mi.group_id = _group_id
      AND mi.invitee_id = _user_id
      AND mi.status::text IN ('pending','accepted','approved')
  ) OR EXISTS (
    SELECT 1 FROM public.pending_join_requests pjr
    WHERE pjr.group_id = _group_id
      AND pjr.user_id = _user_id
      AND pjr.status::text IN ('approved','accepted')
  ) OR EXISTS (
    SELECT 1 FROM public.thrift_groups g
    WHERE g.id = _group_id AND g.admin_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_self_join_group(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_self_join_group(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can insert memberships" ON public.group_memberships;
DROP POLICY IF EXISTS "Admins or invited users can insert memberships" ON public.group_memberships;
CREATE POLICY "Admins or invited users can insert memberships"
ON public.group_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  is_group_admin(group_id)
  OR (user_id = auth.uid() AND public.can_self_join_group(group_id, auth.uid()))
);