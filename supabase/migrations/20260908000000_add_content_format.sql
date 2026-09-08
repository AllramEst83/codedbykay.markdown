-- Distinguish legacy plain-markdown notes from notes migrated to Yjs CRDT encoding.
-- 'content' keeps holding an opaque encrypted string blob either way; this column
-- only tells the client how to interpret the decrypted bytes.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS content_format TEXT NOT NULL DEFAULT 'plain';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notes_content_format_check'
  ) THEN
    ALTER TABLE notes ADD CONSTRAINT notes_content_format_check
      CHECK (content_format IN ('plain', 'yjs'));
  END IF;
END $$;
