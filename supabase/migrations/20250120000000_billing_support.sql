-- ============================================================================
-- Billing support objects
-- ============================================================================

-- Table to keep aggregated storage usage per user (used by storage quota logic)
CREATE TABLE IF NOT EXISTS user_storage_usage (
  user_id UUID PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  storage_bytes BIGINT DEFAULT 0,
  firestore_bytes BIGINT DEFAULT 0,
  file_count INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_storage_usage_user_id
  ON user_storage_usage(user_id);

