
-- Add savings_type column: 'group' = shared wallet, 'independent' = individual sub-wallets
ALTER TABLE public.target_ajo_groups
ADD COLUMN savings_type text NOT NULL DEFAULT 'group';

-- Add individual contribution tracking per member for independent mode
CREATE TABLE public.target_ajo_member_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.target_ajo_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  total_contributed numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.target_ajo_member_contributions ENABLE ROW LEVEL SECURITY;

-- Members and admin can view contribution totals for their group
CREATE POLICY "Members can view member contributions"
ON public.target_ajo_member_contributions
FOR SELECT
TO authenticated
USING (
  is_target_ajo_member(group_id) OR is_target_ajo_admin(group_id)
);

-- System updates via service role, but allow insert/update for contributors
CREATE POLICY "Contributors can upsert own contribution"
ON public.target_ajo_member_contributions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Contributors can update own contribution"
ON public.target_ajo_member_contributions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());
