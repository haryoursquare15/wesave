
-- Goal Funding Tables (separate from thrift system)

CREATE TABLE public.goal_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_title text NOT NULL,
  description text,
  goal_amount numeric NOT NULL,
  amount_raised numeric NOT NULL DEFAULT 0,
  campaign_owner_user_id uuid NOT NULL,
  beneficiary_account_name text,
  beneficiary_bank_name text,
  beneficiary_account_number text,
  campaign_image text,
  campaign_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  campaign_deadline timestamptz,
  campaign_slug text UNIQUE,
  contribution_visibility text NOT NULL DEFAULT 'public',
  contributor_count integer NOT NULL DEFAULT 0
);

CREATE TABLE public.goal_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.goal_campaigns(id) ON DELETE CASCADE,
  contributor_user_id uuid NOT NULL,
  contributor_name text,
  contribution_amount numeric NOT NULL,
  contribution_reference text,
  contribution_status text NOT NULL DEFAULT 'pledged',
  anonymous boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.campaign_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.goal_campaigns(id) ON DELETE CASCADE,
  update_message text NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.goal_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_updates ENABLE ROW LEVEL SECURITY;

-- goal_campaigns policies
CREATE POLICY "Anyone can view active campaigns" ON public.goal_campaigns FOR SELECT USING (campaign_status IN ('active', 'completed'));
CREATE POLICY "Owners can view own campaigns" ON public.goal_campaigns FOR SELECT USING (campaign_owner_user_id = auth.uid());
CREATE POLICY "Admins can view all goal campaigns" ON public.goal_campaigns FOR SELECT USING (is_any_admin(auth.uid()));
CREATE POLICY "Users can create goal campaigns" ON public.goal_campaigns FOR INSERT WITH CHECK (campaign_owner_user_id = auth.uid());
CREATE POLICY "Owners can update own campaigns" ON public.goal_campaigns FOR UPDATE USING (campaign_owner_user_id = auth.uid());
CREATE POLICY "Admins can update goal campaigns" ON public.goal_campaigns FOR UPDATE USING (is_any_admin(auth.uid()));

-- goal_contributions policies
CREATE POLICY "Contributors visible on public campaigns" ON public.goal_contributions FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.goal_campaigns WHERE id = campaign_id AND campaign_status IN ('active', 'completed'))
);
CREATE POLICY "Users can create contributions" ON public.goal_contributions FOR INSERT WITH CHECK (contributor_user_id = auth.uid());
CREATE POLICY "Campaign owners can update contributions" ON public.goal_contributions FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.goal_campaigns WHERE id = campaign_id AND campaign_owner_user_id = auth.uid())
);
CREATE POLICY "Admins can view all goal contributions" ON public.goal_contributions FOR SELECT USING (is_any_admin(auth.uid()));

-- campaign_updates policies
CREATE POLICY "Anyone can view updates for active campaigns" ON public.campaign_updates FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.goal_campaigns WHERE id = campaign_id AND campaign_status IN ('active', 'completed'))
);
CREATE POLICY "Campaign owners can post updates" ON public.campaign_updates FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.goal_campaigns WHERE id = campaign_id AND campaign_owner_user_id = auth.uid())
);

-- Enable realtime for contributions (live feed)
ALTER PUBLICATION supabase_realtime ADD TABLE public.goal_contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_updates;
