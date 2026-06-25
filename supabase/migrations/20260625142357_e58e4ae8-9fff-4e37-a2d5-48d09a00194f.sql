-- Public anon-friendly RPC to fetch a sandbox campaign by its share slug
-- (for the unauthenticated /goal/:slug payment page).
CREATE OR REPLACE FUNCTION public.get_public_vfd_sandbox_campaign_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  creator_id uuid,
  goal_amount numeric,
  raised_amount numeric,
  contributor_count integer,
  deadline timestamptz,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  campaign_slug text,
  contribution_visibility text,
  campaign_image text,
  payment_reference text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, description, creator_id, goal_amount, raised_amount,
         contributor_count, deadline, status, created_at, updated_at,
         campaign_slug, contribution_visibility, campaign_image,
         ('GOAL-' || upper(substring(id::text, 1, 8))) AS payment_reference
  FROM public.vfd_sandbox_campaigns
  WHERE campaign_slug = p_slug AND status IN ('active','completed')
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_vfd_sandbox_campaign_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_vfd_sandbox_campaign_by_slug(text) TO anon, authenticated;

-- Idempotent inflow ledger so a retried VFD inflow webhook can't double-credit
-- the same bank transfer. One row per (vfd_session_id, campaign_id).
CREATE TABLE IF NOT EXISTS public.vfd_sandbox_campaign_inflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.vfd_sandbox_campaigns(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  vfd_session_id text NOT NULL,
  vfd_reference text,
  payer_account text,
  payer_name text,
  payer_bank text,
  narration text,
  raw_payload jsonb,
  source text NOT NULL DEFAULT 'bank_transfer',
  status text NOT NULL DEFAULT 'credited',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS vfd_sandbox_campaign_inflows_session_uq
  ON public.vfd_sandbox_campaign_inflows(vfd_session_id);

CREATE INDEX IF NOT EXISTS vfd_sandbox_campaign_inflows_campaign_idx
  ON public.vfd_sandbox_campaign_inflows(campaign_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vfd_sandbox_campaign_inflows TO authenticated;
GRANT ALL ON public.vfd_sandbox_campaign_inflows TO service_role;

ALTER TABLE public.vfd_sandbox_campaign_inflows ENABLE ROW LEVEL SECURITY;

-- Campaign owners (and admins) can see inflows on their campaigns.
DROP POLICY IF EXISTS "Campaign owner or admin can view inflows" ON public.vfd_sandbox_campaign_inflows;
CREATE POLICY "Campaign owner or admin can view inflows"
ON public.vfd_sandbox_campaign_inflows
FOR SELECT
TO authenticated
USING (
  public.is_any_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.vfd_sandbox_campaigns c
    WHERE c.id = vfd_sandbox_campaign_inflows.campaign_id
      AND c.creator_id = auth.uid()
  )
);

NOTIFY pgrst, 'reload schema';