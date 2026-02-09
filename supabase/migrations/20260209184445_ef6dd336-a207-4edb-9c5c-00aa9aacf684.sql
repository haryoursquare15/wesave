
-- 1. Disable the enforce_group_limit trigger for testing
DROP TRIGGER IF EXISTS enforce_group_limit ON public.group_memberships;

-- 2. Allow all authenticated users to view pending groups in the pool
-- Currently only members/admins can see groups, which blocks the pool
CREATE POLICY "Anyone can view pending groups"
ON public.thrift_groups
FOR SELECT
USING (status = 'pending');
