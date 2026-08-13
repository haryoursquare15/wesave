DROP POLICY IF EXISTS "Members can view group wallet" ON public.group_wallets;
DROP POLICY IF EXISTS "Admins can view their group invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Admins can create invitations" ON public.group_invitations;
DROP POLICY IF EXISTS "Users can view own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Admins can view requests for their groups" ON public.pending_join_requests;
DROP POLICY IF EXISTS "Admins can update requests" ON public.pending_join_requests;
DROP POLICY IF EXISTS "Group members can view chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Group admins can view pending invitees" ON public.pending_invitees;
DROP POLICY IF EXISTS "Group admins can create pending invitees" ON public.pending_invitees;
DROP POLICY IF EXISTS "Inviters can view sent invites" ON public.member_invites;
DROP POLICY IF EXISTS "Admins can delete invites" ON public.member_invites;
DROP POLICY IF EXISTS "Admins can create invites" ON public.member_invites;
DROP POLICY IF EXISTS "Members can view contribution audit in their groups" ON public.contribution_audit;
DROP POLICY IF EXISTS "Users can view own invites" ON public.target_ajo_invites;
DROP POLICY IF EXISTS "Members can view member contributions" ON public.target_ajo_member_contributions;

DROP FUNCTION IF EXISTS public.is_group_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_group_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_target_ajo_admin(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_target_ajo_member(uuid) CASCADE;

CREATE POLICY "Users can view own transactions"
ON public.transactions FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can view own invites"
ON public.target_ajo_invites FOR SELECT TO authenticated
USING (invitee_id = auth.uid() OR inviter_id = auth.uid());

CREATE POLICY "Users can view own sent or received invites"
ON public.member_invites FOR SELECT TO authenticated
USING (inviter_id = auth.uid() OR invitee_id = auth.uid());

CREATE POLICY "Users can view own join requests"
ON public.pending_join_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can view own contribution audit"
ON public.contribution_audit FOR SELECT TO authenticated
USING (user_id = auth.uid());