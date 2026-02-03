-- Fix overly-permissive RLS on pending_invitees (was WITH CHECK true)

ALTER TABLE public.pending_invitees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create pending invitee" ON public.pending_invitees;
DROP POLICY IF EXISTS "Users can view own pending invites" ON public.pending_invitees;

-- Only a group admin can create pending invitee rows for their group
CREATE POLICY "Group admins can create pending invitees"
ON public.pending_invitees
FOR INSERT
TO authenticated
WITH CHECK (is_group_admin(group_id));

-- Only a group admin can view pending invitees for their group
CREATE POLICY "Group admins can view pending invitees"
ON public.pending_invitees
FOR SELECT
TO authenticated
USING (is_group_admin(group_id));
