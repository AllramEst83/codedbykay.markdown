-- upload-image calls storage upload with upsert: true, which performs an
-- UPDATE (not INSERT) when the object already exists. Without an UPDATE
-- policy, RLS silently rejects the upsert with "new row violates row-level
-- security policy" even though the INSERT policy allows the initial upload.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can update own images'
  ) THEN
    CREATE POLICY "Users can update own images" ON storage.objects FOR UPDATE USING (
      bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text
    ) WITH CHECK (
      bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;
