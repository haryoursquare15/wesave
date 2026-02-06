-- =====================================================
-- FIX PUBLIC PROFILES VIEW ACCESS
-- =====================================================

-- The profiles_public view with security_invoker=on won't work because
-- the underlying profiles table now restricts access to own profile only.
-- 
-- Solution: Create a SECURITY DEFINER function to safely fetch public profile data
-- This allows fetching limited public info about other users while keeping
-- the base table locked down.

-- Create a function to get public profile info for a list of user IDs
CREATE OR REPLACE FUNCTION public.get_public_profiles(user_ids UUID[])
RETURNS TABLE (
  id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  membership_tier membership_tier,
  credit_score INTEGER,
  completed_cycles INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.membership_tier,
    p.credit_score,
    p.completed_cycles
  FROM profiles p
  WHERE p.id = ANY(user_ids);
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_public_profiles(UUID[]) TO authenticated;

-- Also create a single-user version for convenience
CREATE OR REPLACE FUNCTION public.get_public_profile(target_user_id UUID)
RETURNS TABLE (
  id UUID,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  membership_tier membership_tier,
  credit_score INTEGER,
  completed_cycles INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    p.membership_tier,
    p.credit_score,
    p.completed_cycles
  FROM profiles p
  WHERE p.id = target_user_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_public_profile(UUID) TO authenticated;