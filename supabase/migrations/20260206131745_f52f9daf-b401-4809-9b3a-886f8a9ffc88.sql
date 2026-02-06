-- =====================================================
-- FIX CRITICAL DATA EXPOSURE VULNERABILITIES
-- =====================================================

-- 1. FIX PROFILES TABLE - Replace overly permissive SELECT policy
-- Drop the dangerous policy that allows any authenticated user to view all profiles
DROP POLICY IF EXISTS "Authenticated users can view public profile info" ON public.profiles;

-- Create restrictive policy: Users can only view their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Add policy for admins to view all profiles (needed for admin functions)
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (is_any_admin(auth.uid()));

-- 2. FIX THRIFT_GROUPS TABLE - Remove policy exposing financial data to everyone
-- Drop the dangerous policy that exposes all active groups with financial details
DROP POLICY IF EXISTS "Anyone can view active groups in pool" ON public.thrift_groups;

-- The public_groups view already exists and excludes sensitive fields (flw_subaccount_id, payout_order, etc.)
-- Enable RLS on the view with security_invoker
-- Note: The view already has security_invoker=on based on earlier context

-- 3. Ensure profiles_public view uses security_invoker 
-- (The view already exists and excludes sensitive columns)
-- Recreate it with explicit security_invoker setting to ensure it respects RLS

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public WITH (security_invoker=on) AS
  SELECT 
    id,
    username,
    full_name,
    membership_tier,
    credit_score,
    completed_cycles,
    created_at,
    avatar_url
  FROM public.profiles;

-- Grant select on the public view to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- 4. Update public_groups view to also use security_invoker
DROP VIEW IF EXISTS public.public_groups;
CREATE VIEW public.public_groups WITH (security_invoker=on) AS
  SELECT 
    tg.id,
    tg.name,
    tg.contribution_amount,
    tg.max_members,
    tg.period,
    tg.status,
    tg.rating,
    (SELECT COUNT(*) FROM public.group_memberships gm WHERE gm.group_id = tg.id AND gm.status = 'active') as member_count,
    (SELECT COUNT(*) FROM public.pending_join_requests pjr WHERE pjr.group_id = tg.id AND pjr.status = 'pending') as pending_requests
  FROM public.thrift_groups tg
  WHERE tg.status IN ('active', 'completed');

-- Grant select on public_groups view
GRANT SELECT ON public.public_groups TO authenticated;
GRANT SELECT ON public.public_groups TO anon;