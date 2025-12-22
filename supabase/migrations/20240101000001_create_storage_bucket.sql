-- Create user-images bucket (idempotent)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-images', 'user-images', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' 
    AND policyname = 'Users can upload own images'
  ) THEN
    CREATE POLICY "Users can upload own images" ON storage.objects FOR INSERT WITH CHECK (
      bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' 
    AND policyname = 'Users can view own images'
  ) THEN
    CREATE POLICY "Users can view own images" ON storage.objects FOR SELECT USING (
      bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' 
    AND policyname = 'Users can delete own images'
  ) THEN
    CREATE POLICY "Users can delete own images" ON storage.objects FOR DELETE USING (
      bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text
    );
  END IF;
END $$;

