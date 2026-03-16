-- ============================================================================
-- Add multi-channel support to conversations
-- Adds 'channel' column with default 'whatsapp' for backward compatibility.
-- All existing conversations remain 'whatsapp'. New FB/IG conversations
-- will be created with channel='facebook' or 'instagram'.
-- ============================================================================

-- 1. Add channel column (all existing rows get 'whatsapp')
ALTER TABLE conversations ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'
  CHECK (channel IN ('whatsapp', 'facebook', 'instagram'));

-- 2. Add external subscriber ID for ManyChat (FB/IG don't use phone numbers)
ALTER TABLE conversations ADD COLUMN external_subscriber_id TEXT;

-- 3. Drop old unique constraint and create new one including channel
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_workspace_id_phone_key;
ALTER TABLE conversations ADD CONSTRAINT conversations_workspace_id_phone_channel_key
  UNIQUE(workspace_id, phone, channel);

-- 4. Index for channel filtering (optional, helps with filtered queries)
CREATE INDEX IF NOT EXISTS idx_conversations_channel
  ON conversations(workspace_id, channel);
