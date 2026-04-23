-- ============================================================================
-- VFD Sandbox: Strict RLS hardening
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS, so writes
-- continue to work. These policies only constrain client SELECTs.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_vfd_sandbox_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vfd_sandbox_group_members
    WHERE group_id = _group_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_vfd_sandbox_target_member(_target_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vfd_sandbox_target_members
    WHERE target_id = _target_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_vfd_sandbox_association_member(_association_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vfd_sandbox_association_memberships
    WHERE association_id = _association_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_vfd_sandbox_split_participant(_split_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.vfd_sandbox_split_participants
    WHERE split_id = _split_id AND user_id = _user_id);
$$;

-- ASSOCIATIONS ---------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read sandbox associations" ON public.vfd_sandbox_associations;
CREATE POLICY "Members or admin can view associations"
ON public.vfd_sandbox_associations FOR SELECT TO authenticated
USING (admin_id = auth.uid()
  OR public.is_vfd_sandbox_association_member(id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read sandbox association memberships" ON public.vfd_sandbox_association_memberships;
CREATE POLICY "Members can view own association memberships"
ON public.vfd_sandbox_association_memberships FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_association_member(association_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read sandbox association wallets" ON public.vfd_sandbox_association_wallets;
CREATE POLICY "Members can view own association wallet"
ON public.vfd_sandbox_association_wallets FOR SELECT TO authenticated
USING (public.is_vfd_sandbox_association_member(association_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read sandbox association contributions" ON public.vfd_sandbox_association_contributions;
CREATE POLICY "Members can view own association contributions"
ON public.vfd_sandbox_association_contributions FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_association_member(association_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

-- CAMPAIGN CONTRIBUTIONS -----------------------------------------------------
DROP POLICY IF EXISTS "Users can view campaign contributions" ON public.vfd_sandbox_campaign_contributions;
CREATE POLICY "Contributor or campaign owner can view contributions"
ON public.vfd_sandbox_campaign_contributions FOR SELECT TO authenticated
USING (contributor_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.vfd_sandbox_campaigns c
    WHERE c.id = vfd_sandbox_campaign_contributions.campaign_id
      AND c.creator_id = auth.uid())
  OR public.is_any_admin(auth.uid()));

-- GROUPS ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view sandbox groups" ON public.vfd_sandbox_groups;
CREATE POLICY "Members or admin can view sandbox groups"
ON public.vfd_sandbox_groups FOR SELECT TO authenticated
USING (admin_id = auth.uid()
  OR public.is_vfd_sandbox_group_member(id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view group members" ON public.vfd_sandbox_group_members;
CREATE POLICY "Members can view co-members"
ON public.vfd_sandbox_group_members FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_group_member(group_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view group contributions" ON public.vfd_sandbox_group_contributions;
CREATE POLICY "Group members can view group contributions"
ON public.vfd_sandbox_group_contributions FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_group_member(group_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view group payouts" ON public.vfd_sandbox_group_payouts;
DROP POLICY IF EXISTS "Authenticated can read group payouts" ON public.vfd_sandbox_group_payouts;
CREATE POLICY "Group members can view group payouts"
ON public.vfd_sandbox_group_payouts FOR SELECT TO authenticated
USING (recipient_id = auth.uid()
  OR public.is_vfd_sandbox_group_member(group_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read invite links" ON public.vfd_sandbox_group_invite_links;
CREATE POLICY "Group admin or creator can read invite links"
ON public.vfd_sandbox_group_invite_links FOR SELECT TO authenticated
USING (created_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.vfd_sandbox_groups g
    WHERE g.id = vfd_sandbox_group_invite_links.group_id
      AND g.admin_id = auth.uid())
  OR public.is_any_admin(auth.uid()));

-- TARGETS --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view sandbox targets" ON public.vfd_sandbox_targets;
CREATE POLICY "Members or admin can view targets"
ON public.vfd_sandbox_targets FOR SELECT TO authenticated
USING (admin_id = auth.uid()
  OR public.is_vfd_sandbox_target_member(id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view target members" ON public.vfd_sandbox_target_members;
CREATE POLICY "Members can view target co-members"
ON public.vfd_sandbox_target_members FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_target_member(target_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view target contributions" ON public.vfd_sandbox_target_contributions;
CREATE POLICY "Members can view target contributions"
ON public.vfd_sandbox_target_contributions FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_target_member(target_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read target invites" ON public.vfd_sandbox_target_invites;
CREATE POLICY "Invitee, inviter, or target admin can read target invites"
ON public.vfd_sandbox_target_invites FOR SELECT TO authenticated
USING (invitee_id = auth.uid()
  OR inviter_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.vfd_sandbox_targets t
    WHERE t.id = vfd_sandbox_target_invites.target_id
      AND t.admin_id = auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read target wr" ON public.vfd_sandbox_target_withdrawal_requests;
CREATE POLICY "Members can read target withdrawal requests"
ON public.vfd_sandbox_target_withdrawal_requests FOR SELECT TO authenticated
USING (requested_by = auth.uid()
  OR public.is_vfd_sandbox_target_member(target_id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read target votes" ON public.vfd_sandbox_target_withdrawal_votes;
CREATE POLICY "Members can read target withdrawal votes"
ON public.vfd_sandbox_target_withdrawal_votes FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.vfd_sandbox_target_withdrawal_requests wr
    WHERE wr.id = vfd_sandbox_target_withdrawal_votes.withdrawal_request_id
      AND public.is_vfd_sandbox_target_member(wr.target_id, auth.uid()))
  OR public.is_any_admin(auth.uid()));

-- SPLIT PAY ------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view sandbox splits" ON public.vfd_sandbox_splits;
CREATE POLICY "Creator or participants can view splits"
ON public.vfd_sandbox_splits FOR SELECT TO authenticated
USING (creator_id = auth.uid()
  OR public.is_vfd_sandbox_split_participant(id, auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view split participants" ON public.vfd_sandbox_split_participants;
CREATE POLICY "Participants can view split participants"
ON public.vfd_sandbox_split_participants FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_split_participant(split_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.vfd_sandbox_splits s
    WHERE s.id = vfd_sandbox_split_participants.split_id
      AND s.creator_id = auth.uid())
  OR public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read split tx" ON public.vfd_sandbox_split_transactions;
CREATE POLICY "Participants can read split transactions"
ON public.vfd_sandbox_split_transactions FOR SELECT TO authenticated
USING (user_id = auth.uid()
  OR public.is_vfd_sandbox_split_participant(split_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.vfd_sandbox_splits s
    WHERE s.id = vfd_sandbox_split_transactions.split_id
      AND s.creator_id = auth.uid())
  OR public.is_any_admin(auth.uid()));
