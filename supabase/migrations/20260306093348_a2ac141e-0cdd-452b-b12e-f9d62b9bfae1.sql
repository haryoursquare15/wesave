
-- Target Ajo tables

CREATE TABLE public.target_ajo_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC NOT NULL,
  amount_raised NUMERIC NOT NULL DEFAULT 0,
  contribution_amount NUMERIC NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  target_date TIMESTAMPTZ,
  reason TEXT,
  beneficiary_account_name TEXT,
  beneficiary_bank_name TEXT,
  beneficiary_account_number TEXT,
  admin_user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'closed')),
  member_count INTEGER NOT NULL DEFAULT 0,
  max_members INTEGER NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.target_ajo_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.target_ajo_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE public.target_ajo_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.target_ajo_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC NOT NULL,
  contribution_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'wallet' CHECK (source IN ('wallet', 'manual')),
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.target_ajo_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.target_ajo_groups(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'disbursed')),
  required_votes INTEGER NOT NULL DEFAULT 0,
  approval_count INTEGER NOT NULL DEFAULT 0,
  rejection_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE public.target_ajo_withdrawal_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id UUID NOT NULL REFERENCES public.target_ajo_withdrawal_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('approve', 'reject')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(withdrawal_request_id, user_id)
);

CREATE TABLE public.target_ajo_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.target_ajo_groups(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL,
  invitee_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE(group_id, invitee_id)
);

-- Enable RLS
ALTER TABLE public.target_ajo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_ajo_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_ajo_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_ajo_withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_ajo_withdrawal_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_ajo_invites ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION public.is_target_ajo_member(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM target_ajo_memberships
    WHERE group_id = p_group_id AND user_id = auth.uid() AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_target_ajo_admin(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM target_ajo_groups
    WHERE id = p_group_id AND admin_user_id = auth.uid()
  );
$$;

-- RLS policies for target_ajo_groups
CREATE POLICY "Anyone auth can view active target ajo groups"
  ON public.target_ajo_groups FOR SELECT TO authenticated
  USING (status IN ('active', 'completed') OR admin_user_id = auth.uid());

CREATE POLICY "Auth users can create target ajo groups"
  ON public.target_ajo_groups FOR INSERT TO authenticated
  WITH CHECK (admin_user_id = auth.uid());

CREATE POLICY "Admin can update own target ajo groups"
  ON public.target_ajo_groups FOR UPDATE TO authenticated
  USING (admin_user_id = auth.uid());

-- RLS policies for memberships
CREATE POLICY "Members can view group memberships"
  ON public.target_ajo_memberships FOR SELECT TO authenticated
  USING (is_target_ajo_member(group_id) OR is_target_ajo_admin(group_id) OR user_id = auth.uid());

CREATE POLICY "Admin or self can insert memberships"
  ON public.target_ajo_memberships FOR INSERT TO authenticated
  WITH CHECK (is_target_ajo_admin(group_id) OR user_id = auth.uid());

CREATE POLICY "Admin can remove memberships"
  ON public.target_ajo_memberships FOR UPDATE TO authenticated
  USING (is_target_ajo_admin(group_id));

CREATE POLICY "Admin can delete memberships"
  ON public.target_ajo_memberships FOR DELETE TO authenticated
  USING (is_target_ajo_admin(group_id));

-- RLS policies for contributions
CREATE POLICY "Members can view group contributions"
  ON public.target_ajo_contributions FOR SELECT TO authenticated
  USING (is_target_ajo_member(group_id) OR is_target_ajo_admin(group_id));

CREATE POLICY "Members can insert own contributions"
  ON public.target_ajo_contributions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND (is_target_ajo_member(group_id) OR is_target_ajo_admin(group_id)));

-- RLS policies for withdrawal requests
CREATE POLICY "Members can view withdrawal requests"
  ON public.target_ajo_withdrawal_requests FOR SELECT TO authenticated
  USING (is_target_ajo_member(group_id) OR is_target_ajo_admin(group_id));

CREATE POLICY "Admin can create withdrawal requests"
  ON public.target_ajo_withdrawal_requests FOR INSERT TO authenticated
  WITH CHECK (is_target_ajo_admin(group_id) AND requested_by = auth.uid());

CREATE POLICY "Admin can update withdrawal requests"
  ON public.target_ajo_withdrawal_requests FOR UPDATE TO authenticated
  USING (is_target_ajo_admin(group_id));

-- RLS policies for votes
CREATE POLICY "Members can view votes"
  ON public.target_ajo_withdrawal_votes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM target_ajo_withdrawal_requests wr
      WHERE wr.id = withdrawal_request_id
      AND (is_target_ajo_member(wr.group_id) OR is_target_ajo_admin(wr.group_id))
    )
  );

CREATE POLICY "Members can cast votes"
  ON public.target_ajo_withdrawal_votes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM target_ajo_withdrawal_requests wr
      WHERE wr.id = withdrawal_request_id
      AND is_target_ajo_member(wr.group_id)
    )
  );

-- RLS policies for invites
CREATE POLICY "Users can view own invites"
  ON public.target_ajo_invites FOR SELECT TO authenticated
  USING (invitee_id = auth.uid() OR inviter_id = auth.uid() OR is_target_ajo_admin(group_id));

CREATE POLICY "Admin can create invites"
  ON public.target_ajo_invites FOR INSERT TO authenticated
  WITH CHECK (is_target_ajo_admin(group_id) AND inviter_id = auth.uid());

CREATE POLICY "Invitees can update their invites"
  ON public.target_ajo_invites FOR UPDATE TO authenticated
  USING (invitee_id = auth.uid());

-- Enable realtime for contributions and withdrawal votes
ALTER PUBLICATION supabase_realtime ADD TABLE public.target_ajo_contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.target_ajo_withdrawal_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.target_ajo_withdrawal_requests;
