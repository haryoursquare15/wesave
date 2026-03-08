-- Allow authenticated users to view basic profile info for other users
-- This is needed for member lists, invite search, etc.
CREATE POLICY "Authenticated users can view basic profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Drop the old restrictive policy since the new one is more permissive
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;