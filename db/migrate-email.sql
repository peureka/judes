-- Add email column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Click tracking for find emails
CREATE TABLE IF NOT EXISTS find_clicks (
  id SERIAL PRIMARY KEY,
  find_record_id UUID NOT NULL REFERENCES find_records(id),
  click_type TEXT NOT NULL,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_find_clicks_find ON find_clicks(find_record_id);

-- Magic link auth tokens
CREATE TABLE IF NOT EXISTS auth_tokens (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_token ON auth_tokens(token);
