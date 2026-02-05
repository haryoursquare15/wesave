-- Fix RLS policies for admin_requests table
CREATE POLICY "Admins can view all requests"
  ON public.admin_requests FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can update requests"
  ON public.admin_requests FOR UPDATE
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can insert requests"
  ON public.admin_requests FOR INSERT
  WITH CHECK (true);

-- Add policies for support staff viewing tickets
CREATE POLICY "Support staff can view all tickets"
  ON public.support_tickets FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Support staff can update tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.is_any_admin(auth.uid()));

-- Add policies for support staff viewing comments
CREATE POLICY "Support staff can view all comments"
  ON public.support_ticket_comments FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Support staff can add comments"
  ON public.support_ticket_comments FOR INSERT
  WITH CHECK (author_id = auth.uid());

-- Add policies for admins viewing crowdfunding
CREATE POLICY "Admins can view all campaigns"
  ON public.crowdfunding_campaigns FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can update campaigns"
  ON public.crowdfunding_campaigns FOR UPDATE
  USING (public.is_any_admin(auth.uid()));

-- Add policies for admins viewing associations
CREATE POLICY "Admins can view all associations"
  ON public.associations FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Admins can update associations"
  ON public.associations FOR UPDATE
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Users can create associations"
  ON public.associations FOR INSERT
  WITH CHECK (admin_id = auth.uid());

-- Association memberships additional policies
CREATE POLICY "Admins can view all memberships"
  ON public.association_memberships FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Association admins can manage members"
  ON public.association_memberships FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.associations WHERE id = association_id AND admin_id = auth.uid())
  );

-- Association wallets additional policies
CREATE POLICY "Admins can view all association wallets"
  ON public.association_wallets FOR SELECT
  USING (public.is_any_admin(auth.uid()));

-- Crowdfunding contributions additional policies
CREATE POLICY "Admins can view all contributions"
  ON public.crowdfunding_contributions FOR SELECT
  USING (public.is_any_admin(auth.uid()));

CREATE POLICY "Users can make contributions"
  ON public.crowdfunding_contributions FOR INSERT
  WITH CHECK (contributor_id = auth.uid());