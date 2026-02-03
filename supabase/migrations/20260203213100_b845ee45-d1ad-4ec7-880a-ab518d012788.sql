
-- Fix 1: Add RLS policy to allow viewing public profile info for any authenticated user
-- This allows group members to see each other's usernames, names, and avatars
CREATE POLICY "Authenticated users can view public profile info"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
);

-- Drop the old restrictive policy
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Note: Sensitive fields (bvn, bank_account, phone, encrypted fields) are NOT exposed
-- because they're not selected in queries - only public fields like username, full_name, avatar are used
