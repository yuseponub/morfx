-- Composite indexes for inbox conversation queries
-- Covers both sort modes: last_message_at and last_customer_message_at

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_status_last_msg
  ON conversations (workspace_id, status, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_status_last_customer_msg
  ON conversations (workspace_id, status, last_customer_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_msg
  ON conversations (workspace_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_last_customer_msg
  ON conversations (workspace_id, last_customer_message_at DESC NULLS LAST);

-- Index for batch tag fetch by contact IDs
CREATE INDEX IF NOT EXISTS idx_contact_tags_contact_id
  ON contact_tags (contact_id);
