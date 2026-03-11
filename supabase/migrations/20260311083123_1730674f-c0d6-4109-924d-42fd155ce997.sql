
-- Add tables to realtime only if not already present
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'target_ajo_memberships') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.target_ajo_memberships;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'target_ajo_invites') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.target_ajo_invites;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
