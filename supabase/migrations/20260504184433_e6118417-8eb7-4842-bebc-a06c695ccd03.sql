
-- Enable members to post into their group chat
DROP POLICY IF EXISTS "Users can post to group chat" ON public.vfd_sandbox_chat_messages;
CREATE POLICY "Users can post to group chat"
ON public.vfd_sandbox_chat_messages FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.vfd_sandbox_group_members m
    WHERE m.group_id = vfd_sandbox_chat_messages.group_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
);

-- Realtime
ALTER TABLE public.vfd_sandbox_chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.vfd_sandbox_groups REPLICA IDENTITY FULL;
ALTER TABLE public.vfd_sandbox_group_members REPLICA IDENTITY FULL;
ALTER TABLE public.vfd_sandbox_group_contributions REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vfd_sandbox_chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vfd_sandbox_groups;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vfd_sandbox_group_members;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.vfd_sandbox_group_contributions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
