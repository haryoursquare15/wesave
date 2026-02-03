-- Ensure users can create their own groups (fix RLS insert failures)

DO $$
BEGIN
  -- Create an explicit authenticated-only insert policy (keep existing policy intact)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'thrift_groups'
      AND policyname = 'Authenticated users can create groups'
  ) THEN
    CREATE POLICY "Authenticated users can create groups"
    ON public.thrift_groups
    FOR INSERT
    TO authenticated
    WITH CHECK (admin_id = auth.uid());
  END IF;
END $$;
