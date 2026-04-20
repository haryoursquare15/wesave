
INSERT INTO storage.buckets (id, name, public)
VALUES ('sandbox-campaign-images', 'sandbox-campaign-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
DROP POLICY IF EXISTS "Sandbox campaign images public read" ON storage.objects;
CREATE POLICY "Sandbox campaign images public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'sandbox-campaign-images');

-- Authenticated insert into own folder
DROP POLICY IF EXISTS "Sandbox campaign images user upload" ON storage.objects;
CREATE POLICY "Sandbox campaign images user upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sandbox-campaign-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Authenticated update own files
DROP POLICY IF EXISTS "Sandbox campaign images user update" ON storage.objects;
CREATE POLICY "Sandbox campaign images user update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'sandbox-campaign-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Authenticated delete own files
DROP POLICY IF EXISTS "Sandbox campaign images user delete" ON storage.objects;
CREATE POLICY "Sandbox campaign images user delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'sandbox-campaign-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
