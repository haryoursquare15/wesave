-- group_memberships: admin update must re-validate on new row
DROP POLICY IF EXISTS "Admins can update memberships" ON public.group_memberships;
CREATE POLICY "Admins can update memberships"
ON public.group_memberships
FOR UPDATE
TO authenticated
USING (public.is_group_admin(group_id))
WITH CHECK (public.is_group_admin(group_id));

-- member_invites: invitee may only accept/decline their own pending invite
DROP POLICY IF EXISTS "Invitees can respond to invites" ON public.member_invites;
CREATE POLICY "Invitees can respond to invites"
ON public.member_invites
FOR UPDATE
TO authenticated
USING (invitee_id = auth.uid() AND status = 'pending')
WITH CHECK (invitee_id = auth.uid() AND status IN ('accepted', 'declined'));

-- position_swap_requests: target may only accept/decline
DROP POLICY IF EXISTS "Target can respond to swap requests" ON public.position_swap_requests;
CREATE POLICY "Target can respond to swap requests"
ON public.position_swap_requests
FOR UPDATE
TO authenticated
USING (target_id = auth.uid() AND status = 'pending')
WITH CHECK (target_id = auth.uid() AND status IN ('accepted', 'declined', 'rejected'));

-- target_ajo_invites: invitee may only accept/decline their own invite
DROP POLICY IF EXISTS "Invitees can update their invites" ON public.target_ajo_invites;
CREATE POLICY "Invitees can update their invites"
ON public.target_ajo_invites
FOR UPDATE
TO authenticated
USING (invitee_id = auth.uid())
WITH CHECK (invitee_id = auth.uid() AND status IN ('accepted', 'declined'));