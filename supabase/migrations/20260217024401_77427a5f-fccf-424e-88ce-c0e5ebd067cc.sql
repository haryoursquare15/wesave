
-- Drop the overly permissive insert policy
DROP POLICY "Service role can insert notifications" ON public.user_notifications;

-- No insert policy for anon/authenticated - only service_role (which bypasses RLS) can insert
-- This is the correct approach since notifications are created by edge functions using service_role key
