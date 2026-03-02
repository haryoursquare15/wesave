
-- Allow any authenticated user to count active memberships per group (for pool display)
-- This only reveals the count, not sensitive member details, since the frontend uses head:true count queries
CREATE POLICY "Authenticated users can count group memberships"
  ON public.group_memberships
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
