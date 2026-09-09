-- upload-image returns a public storage URL (getPublicUrl) that gets embedded
-- directly in note markdown for <img> tags to load without auth. The public
-- object endpoint refuses to serve from a non-public bucket ("Bucket not
-- found"), so the bucket must be public for that to work. Write access is
-- still restricted by the per-user folder RLS policies on storage.objects.
UPDATE storage.buckets SET public = true WHERE id = 'user-images';
