
-- Drop overly permissive policies and replace with proper ones
-- These tables are only written to by edge functions (service_role), 
-- but authenticated users need read access

DROP POLICY IF EXISTS "Service role full access cycles" ON public.vfd_sandbox_contribution_cycles;
DROP POLICY IF EXISTS "Service role full access audit" ON public.vfd_sandbox_contribution_audit;
DROP POLICY IF EXISTS "Service role full access swaps" ON public.vfd_sandbox_position_swaps;
DROP POLICY IF EXISTS "Service role full access chat" ON public.vfd_sandbox_chat_messages;
DROP POLICY IF EXISTS "Service role full access notifications" ON public.vfd_sandbox_notifications;

-- Contribution cycles: users can read cycles for groups they belong to
CREATE POLICY "Users can read group cycles" ON public.vfd_sandbox_contribution_cycles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vfd_sandbox_group_members m 
    WHERE m.group_id = vfd_sandbox_contribution_cycles.group_id AND m.user_id = auth.uid()
  ));

-- Contribution audit: users can read their own audit entries
CREATE POLICY "Users can read own audit" ON public.vfd_sandbox_contribution_audit
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Position swaps: users can read swaps for their groups
CREATE POLICY "Users can read group swaps" ON public.vfd_sandbox_position_swaps
  FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR target_id = auth.uid());

-- Chat messages: users can read chat for groups they belong to
CREATE POLICY "Users can read group chat" ON public.vfd_sandbox_chat_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vfd_sandbox_group_members m 
    WHERE m.group_id = vfd_sandbox_chat_messages.group_id AND m.user_id = auth.uid()
  ));

-- Notifications: users can read their own notifications
CREATE POLICY "Users can read own notifications" ON public.vfd_sandbox_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications" ON public.vfd_sandbox_notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
