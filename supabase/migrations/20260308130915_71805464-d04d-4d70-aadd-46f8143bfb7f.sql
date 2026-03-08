-- Allow any member (not just admin) to invite others to target ajo groups
DROP POLICY IF EXISTS "Admin can create invites" ON public.target_ajo_invites;

CREATE POLICY "Members can create invites"
ON public.target_ajo_invites
FOR INSERT
TO authenticated
WITH CHECK (
  (is_target_ajo_member(group_id) OR is_target_ajo_admin(group_id))
  AND inviter_id = auth.uid()
);