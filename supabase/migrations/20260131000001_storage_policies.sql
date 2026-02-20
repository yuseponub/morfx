-- Storage policies for whatsapp-media bucket

-- Allow authenticated users to upload files
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'whatsapp-media');

-- Allow authenticated users to read files
DROP POLICY IF EXISTS "Authenticated users can read" ON storage.objects;
CREATE POLICY "Authenticated users can read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'whatsapp-media');

-- Allow public to read files (needed for 360dialog to fetch media)
DROP POLICY IF EXISTS "Public can read whatsapp media" ON storage.objects;
CREATE POLICY "Public can read whatsapp media"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'whatsapp-media');

-- Allow authenticated users to delete their uploads
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
CREATE POLICY "Authenticated users can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'whatsapp-media');
