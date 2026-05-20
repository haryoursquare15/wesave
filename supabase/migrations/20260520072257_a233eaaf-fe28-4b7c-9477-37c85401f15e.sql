ALTER TABLE public.vfd_sandbox_notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vfd_sandbox_notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;