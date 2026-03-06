-- Judes Vision Migration: Phases 1-3
-- Run against Neon Postgres

-- === Phase 1: Living Brief ===

ALTER TABLE users ADD COLUMN IF NOT EXISTS brief_rebuilt_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS brief_fact_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS brief_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  brief TEXT NOT NULL,
  fact_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brief_history_user_id ON brief_history(user_id);

-- === Phase 1: Temporal Awareness ===

CREATE TABLE IF NOT EXISTS temporal_hints (
  id SERIAL PRIMARY KEY,
  fact_id INTEGER REFERENCES user_context(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  reference_text TEXT NOT NULL,
  estimated_date DATE,
  date_precision TEXT DEFAULT 'day',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_temporal_hints_date ON temporal_hints(estimated_date);
CREATE INDEX IF NOT EXISTS idx_temporal_hints_user ON temporal_hints(user_id);

-- === Phase 1: Multi-Modal Photos ===

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_description TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_file_id TEXT;

-- === Phase 2: Life Chapters ===

CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  themes TEXT[],
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chapters_user_id ON chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_active ON chapters(user_id) WHERE ended_at IS NULL;

-- === Phase 3: Taste Graph ===

ALTER TABLE users ADD COLUMN IF NOT EXISTS brief_embedding vector(384);

CREATE TABLE IF NOT EXISTS taste_connections (
  id SERIAL PRIMARY KEY,
  user_a INTEGER REFERENCES users(id),
  user_b INTEGER REFERENCES users(id),
  similarity FLOAT NOT NULL,
  pattern TEXT,
  surfaced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_taste_connections_similarity ON taste_connections(similarity DESC);
