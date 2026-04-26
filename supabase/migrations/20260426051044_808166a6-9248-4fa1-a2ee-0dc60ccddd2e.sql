
-- ===== Fix 1: Restrict public access to bank account details on goal_campaigns =====
-- Replace the permissive public SELECT policy with a column-safe RPC + restricted policy.

DROP POLICY IF EXISTS "Anyone can view active campaigns" ON public.goal_campaigns;

-- Public/authenticated users can only see campaigns through the safe RPC below.
-- Owners and admins keep full row access via existing policies.

-- Safe public-facing RPC that omits beneficiary banking fields
CREATE OR REPLACE FUNCTION public.get_public_goal_campaigns()
RETURNS TABLE (
  id uuid,
  campaign_title text,
  description text,
  goal_amount numeric,
  amount_raised numeric,
  campaign_owner_user_id uuid,
  campaign_image text,
  campaign_status text,
  created_at timestamptz,
  updated_at timestamptz,
  campaign_deadline timestamptz,
  campaign_slug text,
  contribution_visibility text,
  contributor_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, campaign_title, description, goal_amount, amount_raised,
    campaign_owner_user_id, campaign_image, campaign_status,
    created_at, updated_at, campaign_deadline, campaign_slug,
    contribution_visibility, contributor_count
  FROM public.goal_campaigns
  WHERE campaign_status IN ('active', 'completed');
$$;

CREATE OR REPLACE FUNCTION public.get_public_goal_campaign(_id uuid)
RETURNS TABLE (
  id uuid,
  campaign_title text,
  description text,
  goal_amount numeric,
  amount_raised numeric,
  campaign_owner_user_id uuid,
  campaign_image text,
  campaign_status text,
  created_at timestamptz,
  updated_at timestamptz,
  campaign_deadline timestamptz,
  campaign_slug text,
  contribution_visibility text,
  contributor_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, campaign_title, description, goal_amount, amount_raised,
    campaign_owner_user_id, campaign_image, campaign_status,
    created_at, updated_at, campaign_deadline, campaign_slug,
    contribution_visibility, contributor_count
  FROM public.goal_campaigns
  WHERE id = _id
    AND campaign_status IN ('active', 'completed');
$$;

GRANT EXECUTE ON FUNCTION public.get_public_goal_campaigns() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_goal_campaign(uuid) TO anon, authenticated;

-- ===== Fix 2: Hash bank-change OTPs and enforce per-OTP attempt limit =====

ALTER TABLE public.bank_change_otps
  ADD COLUMN IF NOT EXISTS otp_hash text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

-- Backfill: invalidate any existing plaintext OTPs (force re-request — they expire in 5 mins anyway)
UPDATE public.bank_change_otps
SET verified = true
WHERE otp_hash IS NULL AND verified = false;
