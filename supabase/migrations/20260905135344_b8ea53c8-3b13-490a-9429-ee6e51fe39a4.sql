DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Email assets admin upload') THEN
    CREATE POLICY "Email assets admin upload" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'email-assets' AND public.is_any_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Email assets admin delete') THEN
    CREATE POLICY "Email assets admin delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'email-assets' AND public.is_any_admin(auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Email assets public read') THEN
    CREATE POLICY "Email assets public read" ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'email-assets');
  END IF;
END $$;