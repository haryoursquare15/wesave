-- Fix the security definer view issue by recreating it with security_invoker
DROP VIEW IF EXISTS public.public_groups;

CREATE VIEW public.public_groups
WITH (security_invoker = true) AS
SELECT 
  id,
  name,
  rating,
  max_members,
  contribution_amount,
  period,
  status,
  (SELECT COUNT(*) FROM public.group_memberships WHERE group_id = thrift_groups.id AND status = 'active') as member_count,
  (SELECT COUNT(*) FROM public.pending_join_requests WHERE group_id = thrift_groups.id AND status = 'pending') as pending_requests
FROM public.thrift_groups
WHERE status != 'pending';

-- Add policy to allow all authenticated users to view pool groups (for browsing)
CREATE POLICY "Anyone can view active groups in pool"
  ON public.thrift_groups FOR SELECT
  USING (status IN ('active', 'completed'));