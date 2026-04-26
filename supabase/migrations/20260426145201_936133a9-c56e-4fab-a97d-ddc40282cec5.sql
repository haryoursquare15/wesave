
-- ============================================================
-- 1) FIX: vfd_sandbox_campaigns leaking beneficiary bank details
-- ============================================================
DROP POLICY IF EXISTS "Users can view sandbox campaigns" ON public.vfd_sandbox_campaigns;

-- Owner / contributor / admin can see full row (incl. beneficiary fields)
CREATE POLICY "Owner contributor or admin view full campaign"
ON public.vfd_sandbox_campaigns
FOR SELECT
TO authenticated
USING (
  creator_id = auth.uid()
  OR public.is_any_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.vfd_sandbox_campaign_contributions c
    WHERE c.campaign_id = vfd_sandbox_campaigns.id
      AND c.contributor_id = auth.uid()
  )
);

-- Safe redacted read for any authenticated user (no beneficiary bank fields)
CREATE OR REPLACE FUNCTION public.get_public_vfd_sandbox_campaigns()
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
  campaign_image text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, description, creator_id, goal_amount, raised_amount,
         contributor_count, deadline, status, created_at, updated_at,
         campaign_slug, contribution_visibility, campaign_image
  FROM public.vfd_sandbox_campaigns
  WHERE status IN ('active','completed');
$$;
REVOKE ALL ON FUNCTION public.get_public_vfd_sandbox_campaigns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_vfd_sandbox_campaigns() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_vfd_sandbox_campaign(p_id uuid)
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
  campaign_image text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id, title, description, creator_id, goal_amount, raised_amount,
         contributor_count, deadline, status, created_at, updated_at,
         campaign_slug, contribution_visibility, campaign_image
  FROM public.vfd_sandbox_campaigns
  WHERE id = p_id AND status IN ('active','completed');
$$;
REVOKE ALL ON FUNCTION public.get_public_vfd_sandbox_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_vfd_sandbox_campaign(uuid) TO authenticated;

-- ============================================================
-- 2) FIX: goal_contributions anonymous flag ignored on read
-- ============================================================
DROP POLICY IF EXISTS "Contributors visible on public campaigns" ON public.goal_contributions;

-- Self / campaign owner / admin see full row including identity
CREATE POLICY "Self owner or admin can view contributions"
ON public.goal_contributions
FOR SELECT
TO authenticated
USING (
  contributor_user_id = auth.uid()
  OR public.is_any_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.goal_campaigns gc
    WHERE gc.id = goal_contributions.campaign_id
      AND gc.campaign_owner_user_id = auth.uid()
  )
);

-- Public listing function: redacts contributor identity for anonymous rows,
-- and respects campaign contribution_visibility (only "public" visible).
CREATE OR REPLACE FUNCTION public.get_public_goal_contributions(p_campaign_id uuid)
RETURNS TABLE (
  id uuid,
  campaign_id uuid,
  contribution_amount numeric,
  contributor_name text,
  anonymous boolean,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    gc.id,
    gc.campaign_id,
    gc.contribution_amount,
    CASE WHEN gc.anonymous THEN 'Anonymous' ELSE gc.contributor_name END AS contributor_name,
    gc.anonymous,
    gc.created_at
  FROM public.goal_contributions gc
  JOIN public.goal_campaigns c ON c.id = gc.campaign_id
  WHERE gc.campaign_id = p_campaign_id
    AND gc.contribution_status = 'completed'
    AND c.contribution_visibility = 'public'
    AND c.campaign_status IN ('active','completed')
  ORDER BY gc.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_public_goal_contributions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_goal_contributions(uuid) TO authenticated, anon;

-- ============================================================
-- 3) FIX: is_admin() should also accept super_admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'super_admin'::public.app_role);
$$;

-- ============================================================
-- 4) FIX: user_payment_tokens_test missing user SELECT policy
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='user_payment_tokens_test'
  ) THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own payment tokens" ON public.user_payment_tokens_test';
    EXECUTE 'CREATE POLICY "Users can view own payment tokens"
             ON public.user_payment_tokens_test FOR SELECT TO authenticated
             USING (user_id = auth.uid())';
  END IF;
END $$;

-- ============================================================
-- 5) FIX: storage policies for sandbox-association-docs (UPDATE/DELETE) + public avatars
-- ============================================================
DROP POLICY IF EXISTS "Users update own assoc docs" ON storage.objects;
CREATE POLICY "Users update own assoc docs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'sandbox-association-docs' AND auth.uid()::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'sandbox-association-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Users delete own assoc docs" ON storage.objects;
CREATE POLICY "Users delete own assoc docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'sandbox-association-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- avatars: public bucket should have public read
DROP POLICY IF EXISTS "Public read avatars" ON storage.objects;
CREATE POLICY "Public read avatars"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'avatars');

-- ============================================================
-- 6) FIX: realtime.messages missing RLS (subscription scoping)
-- ============================================================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Allow only authenticated users with a legitimate need for the topic.
-- Topic conventions used in app: 'vfd-tx-{userId}', 'notifications-{userId}', 
-- 'group-{groupId}', 'assoc-{associationId}', 'split-{splitId}', 'target-{targetId}',
-- 'campaign-{campaignId}'. Anything else is denied by default.
DROP POLICY IF EXISTS "Authenticated can subscribe to permitted topics" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to permitted topics"
ON realtime.messages FOR SELECT
TO authenticated
USING (
  -- Per-user channels: must own the topic
  (realtime.topic() LIKE 'vfd-tx-%' AND realtime.topic() = 'vfd-tx-' || auth.uid()::text)
  OR (realtime.topic() LIKE 'notifications-%' AND realtime.topic() = 'notifications-' || auth.uid()::text)
  OR (realtime.topic() LIKE 'user-%' AND realtime.topic() = 'user-' || auth.uid()::text)
  -- Group/association/split/target/campaign channels: must be a member or owner
  OR (
    realtime.topic() LIKE 'group-%'
    AND EXISTS (
      SELECT 1 FROM public.vfd_sandbox_groups g
      LEFT JOIN public.vfd_sandbox_group_members m
        ON m.group_id = g.id AND m.user_id = auth.uid()
      WHERE g.id::text = substring(realtime.topic() from 7)
        AND (g.admin_id = auth.uid() OR m.user_id IS NOT NULL)
    )
  )
  OR (
    realtime.topic() LIKE 'assoc-%'
    AND EXISTS (
      SELECT 1 FROM public.vfd_sandbox_associations a
      LEFT JOIN public.vfd_sandbox_association_memberships am
        ON am.association_id = a.id AND am.user_id = auth.uid()
      WHERE a.id::text = substring(realtime.topic() from 7)
        AND (a.admin_id = auth.uid() OR am.user_id IS NOT NULL)
    )
  )
  OR (
    realtime.topic() LIKE 'split-%'
    AND EXISTS (
      SELECT 1 FROM public.vfd_sandbox_splits s
      LEFT JOIN public.vfd_sandbox_split_participants sp
        ON sp.split_id = s.id AND sp.user_id = auth.uid()
      WHERE s.id::text = substring(realtime.topic() from 7)
        AND (s.creator_id = auth.uid() OR sp.user_id IS NOT NULL)
    )
  )
  OR (
    realtime.topic() LIKE 'target-%'
    AND EXISTS (
      SELECT 1 FROM public.vfd_sandbox_targets t
      LEFT JOIN public.vfd_sandbox_target_members tm
        ON tm.target_id = t.id AND tm.user_id = auth.uid()
      WHERE t.id::text = substring(realtime.topic() from 7)
        AND (t.admin_id = auth.uid() OR tm.user_id IS NOT NULL)
    )
  )
  OR (
    realtime.topic() LIKE 'campaign-%'
    AND EXISTS (
      SELECT 1 FROM public.vfd_sandbox_campaigns c
      WHERE c.id::text = substring(realtime.topic() from 10)
        AND (
          c.creator_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.vfd_sandbox_campaign_contributions cc
            WHERE cc.campaign_id = c.id AND cc.contributor_id = auth.uid()
          )
        )
    )
  )
);

-- Service role retains full access automatically (bypasses RLS).
