-- Restrict target_ajo_groups SELECT to admins and active members only.
-- Beneficiary bank account fields (account number, name, bank) must not be readable
-- by every authenticated user.
DROP POLICY IF EXISTS "Anyone auth can view active target ajo groups" ON public.target_ajo_groups;

CREATE POLICY "Members and admins can view target ajo groups"
ON public.target_ajo_groups
FOR SELECT
TO authenticated
USING (
  admin_user_id = auth.uid()
  OR public.is_target_ajo_member(id)
  OR public.is_target_ajo_admin(id)
);