-- Taste Graph Schema (from IDENTITY.md)
-- Implements: TasteNode, TasteEdge, UserTasteProfile, FindRecord, ReactionSignal, DecodePattern
-- Run against Neon Postgres

CREATE EXTENSION IF NOT EXISTS vector;

-- === TasteNode ===
-- Cultural objects: a song, a film, a place, a texture, a photographer, etc.

CREATE TABLE taste_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT NOT NULL CHECK (domain IN (
    'music', 'film', 'architecture', 'food', 'place',
    'photography', 'design', 'literature', 'fashion', 'fragrance',
    'material', 'texture', 'game', 'brand', 'font', 'colour', 'other'
  )),
  specificity TEXT NOT NULL DEFAULT 'work' CHECK (specificity IN (
    'domain', 'genre', 'creator', 'work', 'moment'
  )),
  source TEXT NOT NULL CHECK (source IN ('onboarding', 'find', 'user_response')),
  cross_user_count INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_taste_nodes_domain ON taste_nodes(domain);
CREATE INDEX idx_taste_nodes_name ON taste_nodes(name);

-- === TasteEdge ===
-- Connections between nodes with typed reasoning

CREATE TABLE taste_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_a UUID REFERENCES taste_nodes(id) ON DELETE CASCADE,
  node_b UUID REFERENCES taste_nodes(id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL CHECK (edge_type IN (
    'sensory', 'emotional', 'structural', 'corrective'
  )),
  reasoning TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN (
    'decode', 'find_reasoning', 'user_articulation'
  )),
  user_id INTEGER REFERENCES users(id),
  confidence FLOAT DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_taste_edges_nodes ON taste_edges(node_a, node_b);
CREATE INDEX idx_taste_edges_user ON taste_edges(user_id);
CREATE INDEX idx_taste_edges_type ON taste_edges(edge_type);

-- === UserTasteProfile ===
-- User's position in taste space, derived from onboarding + interactions

CREATE TABLE user_taste_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id),
  onboarding_inputs TEXT[] NOT NULL,
  decode TEXT NOT NULL,
  taste_vector vector(384),
  active_edges UUID[] DEFAULT '{}',
  staleness_score FLOAT DEFAULT 0.0,
  last_find_at TIMESTAMPTZ,
  total_finds_sent INTEGER DEFAULT 0,
  total_responses INTEGER DEFAULT 0,
  response_ratio FLOAT DEFAULT 0.0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_taste_profiles_user ON user_taste_profiles(user_id);
CREATE INDEX idx_user_taste_profiles_vector ON user_taste_profiles USING hnsw (taste_vector vector_cosine_ops);

-- === FindRecord ===
-- Every find sent, with reasoning and response tracking

CREATE TABLE find_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id),
  node_id UUID REFERENCES taste_nodes(id),
  reasoning_sentence TEXT NOT NULL,
  reasoning_edges UUID[] DEFAULT '{}',
  source_url TEXT,
  source_type TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  response_at TIMESTAMPTZ,
  message_id INTEGER REFERENCES messages(id)
);

CREATE INDEX idx_find_records_user ON find_records(user_id);
CREATE INDEX idx_find_records_sent ON find_records(sent_at DESC);

-- === ReactionSignal ===
-- Typed response to a find

CREATE TABLE reaction_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  find_id UUID REFERENCES find_records(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'soft_ignore', 'hard_ignore', 'confirmation',
    'deep_resonance', 'correction', 'discovery', 'social_share'
  )),
  raw_text TEXT,
  inferred_edges UUID[] DEFAULT '{}',
  taste_vector_delta vector(384),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reaction_signals_find ON reaction_signals(find_id);
CREATE INDEX idx_reaction_signals_user ON reaction_signals(user_id);

-- === DecodePattern ===
-- Three-input combinations and their through-lines

CREATE TABLE decode_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_nodes UUID[] NOT NULL,
  through_line TEXT NOT NULL,
  edges_used UUID[] DEFAULT '{}',
  user_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
