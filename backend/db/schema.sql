CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS notebooks (
  id         BIGSERIAL PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id          BIGSERIAL PRIMARY KEY,
  notebook_id BIGINT      NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,
  filename    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id          BIGSERIAL PRIMARY KEY,
  document_id BIGINT      NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INT         NOT NULL,
  content     TEXT        NOT NULL,
  embedding   vector(768),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notebooks_user_idx ON notebooks (user_id);
CREATE INDEX IF NOT EXISTS documents_notebook_idx ON documents (notebook_id);

DROP INDEX IF EXISTS chunks_embedding_idx;
CREATE INDEX IF NOT EXISTS chunks_embedding_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS chunks_content_fts_idx
  ON chunks USING gin (to_tsvector('english', content));
