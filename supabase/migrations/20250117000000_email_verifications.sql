-- ============================================================================
-- Email Verifications Table
-- ============================================================================
-- Stores email verification tokens for custom email verification flow

CREATE TABLE IF NOT EXISTS email_verifications (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_email_verifications_user_id ON email_verifications(user_id);
CREATE INDEX idx_email_verifications_expires_at ON email_verifications(expires_at);
CREATE INDEX idx_email_verifications_verified ON email_verifications(verified);

-- Enable RLS
ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only read their own verification tokens
CREATE POLICY "Users can read their own email verifications"
  ON email_verifications FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role has full access to email verifications"
  ON email_verifications FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Cleanup expired tokens (scheduled job can be added later)
COMMENT ON TABLE email_verifications IS 'Email verification tokens with 24-hour expiration';
