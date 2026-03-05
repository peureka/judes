-- Memory layer migration: adds semantic recall + emotional weighting
-- Run against Neon before deploying code

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE user_context ADD COLUMN IF NOT EXISTS embedding vector(384);
ALTER TABLE user_context ADD COLUMN IF NOT EXISTS weight SMALLINT DEFAULT 1 CHECK (weight BETWEEN 1 AND 3);
ALTER TABLE users ADD COLUMN IF NOT EXISTS taste_brief TEXT;

-- HNSW index for fast cosine similarity search
CREATE INDEX idx_user_context_embedding ON user_context USING hnsw (embedding vector_cosine_ops);
