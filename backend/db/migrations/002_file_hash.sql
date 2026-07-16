ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS documents_notebook_hash_idx
  ON documents (notebook_id, file_hash)
  WHERE file_hash IS NOT NULL;
