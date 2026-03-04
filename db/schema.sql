CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  three_things TEXT[],
  taste_decode TEXT,
  taste_thread TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  last_initiation_at TIMESTAMPTZ
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  is_initiation BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_context (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  fact TEXT NOT NULL,
  source_message_id INTEGER REFERENCES messages(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_user_id ON messages(user_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);
CREATE INDEX idx_user_context_user_id ON user_context(user_id);
CREATE INDEX idx_users_last_initiation ON users(last_initiation_at);
