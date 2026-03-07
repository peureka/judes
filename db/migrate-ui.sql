-- UI production readiness migration
-- Adds candidate_name and judes_reply to find_records

ALTER TABLE find_records ADD COLUMN IF NOT EXISTS candidate_name TEXT;
ALTER TABLE find_records ADD COLUMN IF NOT EXISTS judes_reply TEXT;
