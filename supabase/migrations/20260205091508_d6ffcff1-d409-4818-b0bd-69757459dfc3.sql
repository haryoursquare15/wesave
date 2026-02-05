-- =====================================================
-- ADMIN PERMISSIONS TABLE for granular access control
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, permission)
);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can view permissions"
  ON public.admin_permissions FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

-- Insert default permissions for each role
INSERT INTO public.admin_permissions (role, permission) VALUES
  -- Super Admin: Full access
  ('super_admin', 'users.view'), ('super_admin', 'users.edit'), ('super_admin', 'users.freeze'), ('super_admin', 'users.reset_2fa'),
  ('super_admin', 'wallets.view'), ('super_admin', 'wallets.freeze'),
  ('super_admin', 'groups.view'), ('super_admin', 'groups.pause'), ('super_admin', 'groups.resolve_disputes'),
  ('super_admin', 'associations.view'), ('super_admin', 'associations.manage'),
  ('super_admin', 'crowdfunding.view'), ('super_admin', 'crowdfunding.manage'),
  ('super_admin', 'transactions.view'), ('super_admin', 'transactions.retry'),
  ('super_admin', 'revenue.view'), ('super_admin', 'revenue.settle'),
  ('super_admin', 'requests.view'), ('super_admin', 'requests.approve'),
  ('super_admin', 'support.view'), ('super_admin', 'support.resolve'),
  ('super_admin', 'compliance.view'), ('super_admin', 'compliance.restrict'),
  ('super_admin', 'analytics.view'), ('super_admin', 'analytics.export'),
  ('super_admin', 'audit.view'), ('super_admin', 'roles.manage'),
  -- Admin (legacy) - give full access too
  ('admin', 'users.view'), ('admin', 'users.edit'), ('admin', 'users.freeze'), ('admin', 'users.reset_2fa'),
  ('admin', 'wallets.view'), ('admin', 'wallets.freeze'),
  ('admin', 'groups.view'), ('admin', 'groups.pause'), ('admin', 'groups.resolve_disputes'),
  ('admin', 'associations.view'), ('admin', 'associations.manage'),
  ('admin', 'crowdfunding.view'), ('admin', 'crowdfunding.manage'),
  ('admin', 'transactions.view'), ('admin', 'transactions.retry'),
  ('admin', 'revenue.view'), ('admin', 'revenue.settle'),
  ('admin', 'requests.view'), ('admin', 'requests.approve'),
  ('admin', 'support.view'), ('admin', 'support.resolve'),
  ('admin', 'compliance.view'), ('admin', 'compliance.restrict'),
  ('admin', 'analytics.view'), ('admin', 'analytics.export'),
  ('admin', 'audit.view'), ('admin', 'roles.manage'),
  -- Operations Admin
  ('operations_admin', 'users.view'), ('operations_admin', 'users.edit'),
  ('operations_admin', 'wallets.view'), ('operations_admin', 'wallets.freeze'),
  ('operations_admin', 'groups.view'), ('operations_admin', 'groups.pause'),
  ('operations_admin', 'associations.view'), ('operations_admin', 'associations.manage'),
  ('operations_admin', 'crowdfunding.view'), ('operations_admin', 'crowdfunding.manage'),
  ('operations_admin', 'transactions.view'),
  ('operations_admin', 'requests.view'), ('operations_admin', 'requests.approve'),
  -- Support Officer
  ('support_officer', 'users.view'),
  ('support_officer', 'transactions.view'),
  ('support_officer', 'groups.view'),
  ('support_officer', 'support.view'), ('support_officer', 'support.resolve'),
  ('support_officer', 'requests.view'), ('support_officer', 'requests.approve'),
  -- Finance Admin
  ('finance_admin', 'transactions.view'), ('finance_admin', 'transactions.retry'),
  ('finance_admin', 'revenue.view'), ('finance_admin', 'revenue.settle'),
  ('finance_admin', 'analytics.view'), ('finance_admin', 'analytics.export'),
  ('finance_admin', 'wallets.view'),
  -- Compliance/Risk Admin
  ('compliance_admin', 'users.view'), ('compliance_admin', 'users.freeze'),
  ('compliance_admin', 'compliance.view'), ('compliance_admin', 'compliance.restrict'),
  ('compliance_admin', 'audit.view')
ON CONFLICT (role, permission) DO NOTHING;

-- =====================================================
-- ASSOCIATIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  admin_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  member_count INTEGER NOT NULL DEFAULT 1,
  max_members INTEGER NOT NULL DEFAULT 50 CHECK (max_members >= 5 AND max_members <= 50),
  flw_subaccount_id TEXT,
  terms_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view associations they belong to"
  ON public.associations FOR SELECT
  USING (admin_id = auth.uid());

-- =====================================================
-- ASSOCIATION MEMBERSHIPS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.association_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'treasurer', 'secretary', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(association_id, user_id)
);

ALTER TABLE public.association_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view association memberships"
  ON public.association_memberships FOR SELECT
  USING (user_id = auth.uid());

-- =====================================================
-- ASSOCIATION WALLETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.association_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id UUID NOT NULL UNIQUE REFERENCES public.associations(id) ON DELETE CASCADE,
  available_balance NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.association_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Association members can view their wallet"
  ON public.association_wallets FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.association_memberships WHERE association_id = association_wallets.association_id AND user_id = auth.uid())
  );

-- =====================================================
-- CROWDFUNDING CAMPAIGNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.crowdfunding_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  creator_id UUID NOT NULL,
  target_amount NUMERIC NOT NULL CHECK (target_amount > 0),
  raised_amount NUMERIC NOT NULL DEFAULT 0,
  contributor_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'cancelled', 'suspended')),
  category TEXT,
  image_url TEXT,
  deadline TIMESTAMPTZ,
  flw_subaccount_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crowdfunding_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active campaigns"
  ON public.crowdfunding_campaigns FOR SELECT
  USING (status IN ('active', 'completed'));

CREATE POLICY "Creators can view their own campaigns"
  ON public.crowdfunding_campaigns FOR SELECT
  USING (creator_id = auth.uid());

CREATE POLICY "Users can create campaigns"
  ON public.crowdfunding_campaigns FOR INSERT
  WITH CHECK (creator_id = auth.uid());

CREATE POLICY "Creators can update their campaigns"
  ON public.crowdfunding_campaigns FOR UPDATE
  USING (creator_id = auth.uid());

-- =====================================================
-- CROWDFUNDING CONTRIBUTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.crowdfunding_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.crowdfunding_campaigns(id) ON DELETE CASCADE,
  contributor_id UUID NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  anonymous BOOLEAN NOT NULL DEFAULT false,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crowdfunding_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contributors can view their contributions"
  ON public.crowdfunding_contributions FOR SELECT
  USING (contributor_id = auth.uid());

CREATE POLICY "Campaign creators can view contributions"
  ON public.crowdfunding_contributions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.crowdfunding_campaigns WHERE id = campaign_id AND creator_id = auth.uid())
  );

-- =====================================================
-- SUPPORT TICKETS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('transaction', 'group', 'wallet', 'account', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'escalated', 'closed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  related_transaction_id UUID,
  related_group_id UUID,
  assigned_to UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tickets"
  ON public.support_tickets FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =====================================================
-- SUPPORT TICKET COMMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.support_ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID NOT NULL,
  comment TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.support_ticket_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view public comments on their tickets"
  ON public.support_ticket_comments FOR SELECT
  USING (
    NOT is_internal AND EXISTS (SELECT 1 FROM public.support_tickets WHERE id = ticket_id AND user_id = auth.uid())
  );

-- =====================================================
-- ADMIN REQUESTS TABLE (unified inbox)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.admin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL CHECK (request_type IN ('join_group', 'gold_upgrade', 'withdrawal_exception', 'unfreeze_account', 'association_admin')),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
  risk_score INTEGER,
  recommended_action TEXT,
  internal_notes TEXT,
  metadata JSONB,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_requests ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ADD onboarding_completed FLAG TO PROFILES
-- =====================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS frozen_by UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS freeze_reason TEXT;

-- =====================================================
-- HELPER FUNCTION: Check if user has specific permission
-- =====================================================
CREATE OR REPLACE FUNCTION public.has_permission(_user_id UUID, _permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.admin_permissions ap ON ur.role = ap.role
    WHERE ur.user_id = _user_id AND ap.permission = _permission
  )
$$;

-- =====================================================
-- HELPER FUNCTION: Check if user is any type of admin
-- =====================================================
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id 
    AND role IN ('admin', 'super_admin', 'operations_admin', 'support_officer', 'finance_admin', 'compliance_admin')
  )
$$;

-- =====================================================
-- ENHANCED ADMIN STATS FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_get_enhanced_stats(_time_filter TEXT DEFAULT '30d')
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  start_date TIMESTAMPTZ;
BEGIN
  -- Check admin permission
  IF NOT public.is_any_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Calculate start date based on filter
  CASE _time_filter
    WHEN 'today' THEN start_date := date_trunc('day', now());
    WHEN '7d' THEN start_date := now() - INTERVAL '7 days';
    WHEN '30d' THEN start_date := now() - INTERVAL '30 days';
    ELSE start_date := now() - INTERVAL '30 days';
  END CASE;

  SELECT json_build_object(
    'total_users', (SELECT COUNT(*) FROM profiles),
    'verified_users', (SELECT COUNT(*) FROM profiles WHERE kyc_status = 'verified'),
    'unverified_users', (SELECT COUNT(*) FROM profiles WHERE kyc_status != 'verified' OR kyc_status IS NULL),
    'total_wallet_balance', (SELECT COALESCE(SUM(available_balance), 0) FROM wallets),
    'total_groups', (SELECT COUNT(*) FROM thrift_groups),
    'active_groups', (SELECT COUNT(*) FROM thrift_groups WHERE status = 'active'),
    'completed_cycles', (SELECT COUNT(*) FROM contribution_cycles WHERE status = 'completed'),
    'contributions_today', (SELECT COUNT(*) FROM cycle_contributions WHERE contributed_at >= date_trunc('day', now())),
    'total_funding_volume', (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'funding' AND status = 'completed'),
    'total_payouts', (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'payout' AND status = 'completed'),
    'platform_revenue', (SELECT COALESCE(available_balance, 0) FROM platform_wallet WHERE wallet_type = 'service_fees' LIMIT 1),
    'failed_transactions', (SELECT COUNT(*) FROM transactions WHERE status = 'failed' AND created_at >= start_date),
    'risk_alerts', (SELECT COUNT(*) FROM velocity_events WHERE flagged = true AND created_at >= start_date),
    'pending_requests', (SELECT COUNT(*) FROM admin_requests WHERE status = 'pending'),
    'open_tickets', (SELECT COUNT(*) FROM support_tickets WHERE status IN ('open', 'in_progress'))
  ) INTO result;

  RETURN result;
END;
$$;