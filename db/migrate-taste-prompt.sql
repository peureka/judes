-- Taste Prompts — versioned, evolving taste articulations
-- The decode's older, denser sibling. Lives on the timeline.

CREATE TABLE IF NOT EXISTS taste_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id),
  version INTEGER NOT NULL DEFAULT 1,
  prompt_text TEXT NOT NULL,
  trigger_reason TEXT NOT NULL CHECK (trigger_reason IN (
    'onboarding', 'corrective_edge', 'through_line_shift', 'reaction_density'
  )),
  edge_count INTEGER NOT NULL,
  node_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taste_prompts_user ON taste_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_taste_prompts_user_version ON taste_prompts(user_id, version DESC);
