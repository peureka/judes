-- Add WhatsApp support columns and make telegram_id nullable
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_id TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN telegram_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_whatsapp ON users(whatsapp_id);
