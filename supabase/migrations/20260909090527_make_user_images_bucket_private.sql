-- Revert to private: images are now fetched client-side via the authenticated
-- storage.download() route (enforcing the per-user folder RLS policies)
-- instead of the unauthenticated /object/public/ endpoint, which bypassed RLS
-- entirely for anyone holding the URL.
UPDATE storage.buckets SET public = false WHERE id = 'user-images';
