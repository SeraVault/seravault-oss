-- ============================================================================
-- Notifications & contact settings support
-- ============================================================================

-- Add language preference to users (if missing)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Contact settings table (per-user preferences)
CREATE TABLE IF NOT EXISTS contact_settings (
  user_id UUID PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  notify_contact_requests BOOLEAN DEFAULT true,
  notify_file_share_from_unknown BOOLEAN DEFAULT true,
  block_unknown_users BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(uid) ON DELETE SET NULL,
  sender_display_name TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  file_id UUID,
  file_name TEXT,
  contact_request_id UUID,
  conversation_id UUID,
  message_id UUID,
  invitation_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id
  ON notifications(recipient_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON notifications(type);

-- ============================================================================
-- RLS policies
-- ============================================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_settings ENABLE ROW LEVEL SECURITY;

-- Users can read/delete their own notifications
DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = recipient_id);

-- Only users themselves can manage their contact settings
DROP POLICY IF EXISTS "Users can read own contact settings" ON contact_settings;
CREATE POLICY "Users can read own contact settings"
  ON contact_settings FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own contact settings" ON contact_settings;
CREATE POLICY "Users can insert own contact settings"
  ON contact_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own contact settings" ON contact_settings;
CREATE POLICY "Users can update own contact settings"
  ON contact_settings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
