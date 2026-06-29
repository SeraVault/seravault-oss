-- ============================================================================
-- Edge Function Triggers Migration
-- ============================================================================
-- This migration creates PostgreSQL triggers to replace Firebase Firestore triggers
-- Many triggers call Edge Functions via HTTP for complex logic

-- ============================================================================
-- ENABLE REQUIRED EXTENSIONS
-- ============================================================================

-- HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================================
-- STORAGE TRACKING TRIGGERS (Pure SQL - No Edge Function calls)
-- ============================================================================

-- Function to update storage on file create
CREATE OR REPLACE FUNCTION trigger_update_storage_on_file_create()
RETURNS TRIGGER AS $$
DECLARE
  file_size_bytes BIGINT;
BEGIN
  -- Extract size from JSONB (encrypted)
  -- Assuming size is stored as integer in JSONB
  file_size_bytes := COALESCE((NEW.size->>'value')::BIGINT, 0);

  -- Insert or update storage usage
  INSERT INTO user_storage_usage (user_id, storage_bytes, file_count, last_updated)
  VALUES (NEW.owner, file_size_bytes, 1, NOW())
  ON CONFLICT (user_id)
  DO UPDATE SET
    storage_bytes = user_storage_usage.storage_bytes + file_size_bytes,
    file_count = user_storage_usage.file_count + 1,
    last_updated = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_storage_on_file_create
  AFTER INSERT ON files
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_storage_on_file_create();

-- Function to update storage on file update
CREATE OR REPLACE FUNCTION trigger_update_storage_on_file_update()
RETURNS TRIGGER AS $$
DECLARE
  old_size BIGINT;
  new_size BIGINT;
  size_diff BIGINT;
BEGIN
  -- Only update if size changed
  IF OLD.size IS DISTINCT FROM NEW.size THEN
    old_size := COALESCE((OLD.size->>'value')::BIGINT, 0);
    new_size := COALESCE((NEW.size->>'value')::BIGINT, 0);
    size_diff := new_size - old_size;

    UPDATE user_storage_usage
    SET storage_bytes = storage_bytes + size_diff,
        last_updated = NOW()
    WHERE user_id = NEW.owner;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_storage_on_file_update
  AFTER UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_storage_on_file_update();

-- Function to update storage on file delete
CREATE OR REPLACE FUNCTION trigger_update_storage_on_file_delete()
RETURNS TRIGGER AS $$
DECLARE
  file_size_bytes BIGINT;
BEGIN
  file_size_bytes := COALESCE((OLD.size->>'value')::BIGINT, 0);

  UPDATE user_storage_usage
  SET storage_bytes = GREATEST(storage_bytes - file_size_bytes, 0),
      file_count = GREATEST(file_count - 1, 0),
      last_updated = NOW()
  WHERE user_id = OLD.owner;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_storage_on_file_delete
  AFTER DELETE ON files
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_storage_on_file_delete();

-- ============================================================================
-- NOTIFICATION TRIGGERS (Call Edge Functions)
-- ============================================================================

-- Helper function to call Edge Functions
CREATE OR REPLACE FUNCTION call_edge_function(
  function_name TEXT,
  payload JSONB
) RETURNS void AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := payload
  );
END;
$$ LANGUAGE plpgsql;

-- File shared notification trigger
CREATE OR REPLACE FUNCTION trigger_notify_file_shared()
RETURNS TRIGGER AS $$
DECLARE
  old_shared UUID[];
  new_shared UUID[];
  newly_shared UUID[];
BEGIN
  -- Only process on update
  IF TG_OP = 'UPDATE' THEN
    old_shared := COALESCE(OLD.shared_with, ARRAY[]::UUID[]);
    new_shared := COALESCE(NEW.shared_with, ARRAY[]::UUID[]);

    -- Find newly added users
    newly_shared := ARRAY(
      SELECT unnest(new_shared)
      EXCEPT
      SELECT unnest(old_shared)
    );

    -- If there are newly shared users, call Edge Function
    IF array_length(newly_shared, 1) > 0 THEN
      PERFORM call_edge_function(
        'notify-file-shared',
        jsonb_build_object(
          'file_id', NEW.id,
          'owner_id', NEW.owner,
          'newly_shared_users', newly_shared
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_file_shared
  AFTER UPDATE ON files
  FOR EACH ROW
  WHEN (OLD.shared_with IS DISTINCT FROM NEW.shared_with)
  EXECUTE FUNCTION trigger_notify_file_shared();

-- File modified notification trigger
CREATE OR REPLACE FUNCTION trigger_notify_file_modified()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify if actual content changed (not just sharing)
  IF (OLD.storage_path IS DISTINCT FROM NEW.storage_path OR
      OLD.size IS DISTINCT FROM NEW.size OR
      OLD.name IS DISTINCT FROM NEW.name) AND
     (OLD.shared_with IS NOT DISTINCT FROM NEW.shared_with) THEN

    PERFORM call_edge_function(
      'notify-file-modified',
      jsonb_build_object(
        'file_id', NEW.id,
        'owner_id', NEW.owner,
        'shared_with', NEW.shared_with
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_file_modified
  AFTER UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_file_modified();

-- Contact request notification trigger
CREATE OR REPLACE FUNCTION trigger_notify_contact_request()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM call_edge_function(
    'notify-contact-request',
    jsonb_build_object(
      'request_id', NEW.id,
      'from_user_id', NEW.from_user_id,
      'to_user_id', NEW.to_user_id,
      'message', NEW.message
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_contact_request
  AFTER INSERT ON contact_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_contact_request();

-- Contact accepted notification trigger
CREATE OR REPLACE FUNCTION trigger_notify_contact_accepted()
RETURNS TRIGGER AS $$
BEGIN
  -- Only notify when status changes to 'accepted'
  IF OLD.status != 'accepted' AND NEW.status = 'accepted' THEN
    PERFORM call_edge_function(
      'notify-contact-accepted',
      jsonb_build_object(
        'request_id', NEW.id,
        'from_user_id', NEW.from_user_id,
        'to_user_id', NEW.to_user_id
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notify_contact_accepted
  AFTER UPDATE ON contact_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION trigger_notify_contact_accepted();

-- ============================================================================
-- SCHEDULED FUNCTIONS (pg_cron)
-- ============================================================================

-- NOTE: These require app.supabase_url and app.supabase_service_role_key to be set
-- Set via: ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';


-- ============================================================================
-- CONFIGURATION HELPER
-- ============================================================================

-- Run these commands to set required configuration:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://xiluxsotnnmvpsbznzbi.supabase.co';
-- ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key';

-- View scheduled jobs:
-- SELECT * FROM cron.job;

-- View job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION trigger_update_storage_on_file_create IS 'Automatically track storage usage when files are created';
COMMENT ON FUNCTION trigger_update_storage_on_file_update IS 'Update storage usage when file size changes';
COMMENT ON FUNCTION trigger_update_storage_on_file_delete IS 'Decrement storage usage when files are deleted';
COMMENT ON FUNCTION call_edge_function IS 'Helper to call Supabase Edge Functions from triggers';
COMMENT ON FUNCTION trigger_notify_file_shared IS 'Notify users when files are shared with them';
COMMENT ON FUNCTION trigger_notify_file_modified IS 'Notify users when shared files are modified';
COMMENT ON FUNCTION trigger_notify_contact_request IS 'Notify users of new contact requests';
COMMENT ON FUNCTION trigger_notify_contact_accepted IS 'Notify users when contact requests are accepted';
