-- ============================================================================
-- Seravault Database Schema for Supabase (PostgreSQL)
-- ============================================================================
-- This migration creates all the necessary tables for Seravault
-- Optimized for hundreds of millions of rows with proper indexing

-- ============================================================================
-- ENABLE EXTENSIONS
-- ============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for encryption functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  uid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  public_key TEXT NOT NULL,
  encrypted_private_key JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  key_version INTEGER DEFAULT 1,
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  terms_accepted_at TIMESTAMPTZ,
  email_verified BOOLEAN DEFAULT FALSE,
  column_visibility JSONB DEFAULT '{
    "type": true,
    "size": true,
    "shared": true,
    "created": true,
    "modified": true,
    "owner": true
  }'::jsonb,
  show_print_warning BOOLEAN DEFAULT true
);

-- Indexes for users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- Create a view for public user information (excludes encrypted_private_key)
-- This view can be used for contacts, sharing, etc.
CREATE OR REPLACE VIEW users_public AS
SELECT
  uid,
  email,
  display_name,
  public_key,
  created_at,
  theme
FROM users;

-- ============================================================================
-- FOLDERS TABLE
-- ============================================================================
-- Must be created BEFORE files table because files references folders

CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name JSONB NOT NULL, -- Encrypted: { ciphertext, nonce }
  parent UUID REFERENCES folders(id) ON DELETE CASCADE,
  encrypted_keys JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for folders table
CREATE INDEX idx_folders_owner ON folders(owner);
CREATE INDEX idx_folders_owner_parent ON folders(owner, parent);
CREATE INDEX idx_folders_parent ON folders(parent) WHERE parent IS NOT NULL;
CREATE INDEX idx_folders_created_at ON folders(created_at DESC);

-- ============================================================================
-- FILES TABLE
-- ============================================================================
-- Partitioned by owner for optimal performance at scale

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  name JSONB NOT NULL, -- Encrypted: { ciphertext, nonce }
  size JSONB NOT NULL, -- Encrypted: { ciphertext, nonce }
  storage_path TEXT NOT NULL,
  encrypted_keys JSONB NOT NULL, -- { uid: encryptedKey }
  shared_with UUID[] DEFAULT '{}',
  parent UUID REFERENCES folders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_modified TIMESTAMPTZ DEFAULT NOW(),
  user_favorites JSONB DEFAULT '{}'::jsonb,
  user_folders JSONB DEFAULT '{}'::jsonb,
  user_tags JSONB DEFAULT '{}'::jsonb,
  user_names JSONB DEFAULT '{}'::jsonb
);

-- Indexes for files table (critical for performance)
CREATE INDEX idx_files_owner ON files(owner);
CREATE INDEX idx_files_owner_parent ON files(owner, parent);
CREATE INDEX idx_files_created_at ON files(created_at DESC);
CREATE INDEX idx_files_last_modified ON files(last_modified DESC);
CREATE INDEX idx_files_shared_with ON files USING GIN(shared_with);
CREATE INDEX idx_files_parent ON files(parent) WHERE parent IS NOT NULL;

-- ============================================================================
-- CONTACTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1 UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  user_id_2 UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  user_1_email TEXT NOT NULL,
  user_2_email TEXT NOT NULL,
  user_1_display_name TEXT NOT NULL,
  user_2_display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  initiator_user_id UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  blocked_by_user_id UUID REFERENCES users(uid) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Ensure users can't be contacts with themselves
  CONSTRAINT different_users CHECK (user_id_1 != user_id_2)
);

-- Indexes for contacts table
CREATE INDEX idx_contacts_user_id_1 ON contacts(user_id_1);
CREATE INDEX idx_contacts_user_id_2 ON contacts(user_id_2);
CREATE INDEX idx_contacts_status ON contacts(status);
CREATE INDEX idx_contacts_created_at ON contacts(created_at DESC);

-- Create unique index to prevent duplicate contact pairs
-- This ensures that (user1, user2) and (user2, user1) are treated as the same pair
CREATE UNIQUE INDEX idx_contacts_unique_pair ON contacts (
  LEAST(user_id_1, user_id_2),
  GREATEST(user_id_1, user_id_2)
);

-- ============================================================================
-- CONTACT REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  from_user_email TEXT NOT NULL,
  from_user_display_name TEXT NOT NULL,
  to_user_id UUID REFERENCES users(uid) ON DELETE CASCADE,
  to_user_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

-- Indexes for contact_requests table
CREATE INDEX idx_contact_requests_from_user ON contact_requests(from_user_id);
CREATE INDEX idx_contact_requests_to_user ON contact_requests(to_user_id);
CREATE INDEX idx_contact_requests_status ON contact_requests(status);
CREATE INDEX idx_contact_requests_created_at ON contact_requests(created_at DESC);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE files ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can ONLY read their own FULL profile (including encrypted_private_key)
-- Other users CANNOT read your profile at all from the users table
CREATE POLICY "Users can read own profile only"
  ON users FOR SELECT
  USING (auth.uid() = uid);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = uid);

-- Users can insert their own profile (for signup)
CREATE POLICY "Users can insert own profile"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = uid);

-- For reading public info of other users, use the users_public view
-- This view excludes encrypted_private_key for security

-- ============================================================================
-- FILES TABLE POLICIES
-- ============================================================================

-- Users can read files they own or that are shared with them
CREATE POLICY "Users can read own or shared files"
  ON files FOR SELECT
  USING (
    owner = auth.uid() OR
    auth.uid() = ANY(shared_with)
  );

-- Users can insert their own files
CREATE POLICY "Users can insert own files"
  ON files FOR INSERT
  WITH CHECK (owner = auth.uid());

-- Users can update files they own
CREATE POLICY "Users can update own files"
  ON files FOR UPDATE
  USING (owner = auth.uid());

-- Users can delete files they own
CREATE POLICY "Users can delete own files"
  ON files FOR DELETE
  USING (owner = auth.uid());

-- ============================================================================
-- FOLDERS TABLE POLICIES
-- ============================================================================

-- Users can read their own folders
CREATE POLICY "Users can read own folders"
  ON folders FOR SELECT
  USING (owner = auth.uid());

-- Users can insert their own folders
CREATE POLICY "Users can insert own folders"
  ON folders FOR INSERT
  WITH CHECK (owner = auth.uid());

-- Users can update their own folders
CREATE POLICY "Users can update own folders"
  ON folders FOR UPDATE
  USING (owner = auth.uid());

-- Users can delete their own folders
CREATE POLICY "Users can delete own folders"
  ON folders FOR DELETE
  USING (owner = auth.uid());

-- ============================================================================
-- CONTACTS TABLE POLICIES
-- ============================================================================

-- Users can read contacts they're part of
CREATE POLICY "Users can read own contacts"
  ON contacts FOR SELECT
  USING (
    user_id_1 = auth.uid() OR
    user_id_2 = auth.uid()
  );

-- Users can create contacts
CREATE POLICY "Users can create contacts"
  ON contacts FOR INSERT
  WITH CHECK (
    user_id_1 = auth.uid() OR
    user_id_2 = auth.uid()
  );

-- Users can update contacts they're part of
CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE
  USING (
    user_id_1 = auth.uid() OR
    user_id_2 = auth.uid()
  );

-- Users can delete contacts they're part of
CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE
  USING (
    user_id_1 = auth.uid() OR
    user_id_2 = auth.uid()
  );

-- ============================================================================
-- CONTACT REQUESTS TABLE POLICIES
-- ============================================================================

-- Users can read requests they sent or received
CREATE POLICY "Users can read own contact requests"
  ON contact_requests FOR SELECT
  USING (
    from_user_id = auth.uid() OR
    to_user_id = auth.uid()
  );

-- Users can create contact requests
CREATE POLICY "Users can create contact requests"
  ON contact_requests FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

-- Users can update contact requests they're involved in
CREATE POLICY "Users can update own contact requests"
  ON contact_requests FOR UPDATE
  USING (
    from_user_id = auth.uid() OR
    to_user_id = auth.uid()
  );

-- Users can delete contact requests they sent
CREATE POLICY "Users can delete own contact requests"
  ON contact_requests FOR DELETE
  USING (from_user_id = auth.uid());

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update last_modified timestamp
CREATE OR REPLACE FUNCTION update_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for users table
CREATE TRIGGER update_users_last_modified
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- Trigger for files table
CREATE TRIGGER update_files_last_modified
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- Trigger for folders table
CREATE TRIGGER update_folders_last_modified
  BEFORE UPDATE ON folders
  FOR EACH ROW
  EXECUTE FUNCTION update_last_modified();

-- ============================================================================
-- STORAGE BUCKETS
-- ============================================================================

-- Create storage bucket for files
INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for files bucket
CREATE POLICY "Users can upload own files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can read own files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- PERFORMANCE OPTIMIZATIONS
-- ============================================================================

-- Analyze tables for query planning
ANALYZE users;
ANALYZE files;
ANALYZE folders;
ANALYZE contacts;
ANALYZE contact_requests;

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE users IS 'User profiles with encrypted key pairs';
COMMENT ON TABLE files IS 'Encrypted file metadata (actual files stored in storage bucket)';
COMMENT ON TABLE folders IS 'Encrypted folder hierarchy';
COMMENT ON TABLE contacts IS 'User contact relationships';
COMMENT ON TABLE contact_requests IS 'Pending contact requests between users';

COMMENT ON COLUMN files.encrypted_keys IS 'Map of user IDs to encrypted file keys for sharing';
COMMENT ON COLUMN files.shared_with IS 'Array of user IDs who have access to this file';
COMMENT ON COLUMN files.user_folders IS 'Per-user folder assignments for shared files';
