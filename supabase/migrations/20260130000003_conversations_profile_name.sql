-- Add profile_name to conversations (WhatsApp profile name)
-- This stores the name from the user's WhatsApp profile

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS profile_name TEXT;

-- Comment
COMMENT ON COLUMN conversations.profile_name IS 'WhatsApp profile name from incoming messages';
