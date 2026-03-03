-- Index for sorting conversations by last_customer_message_at
-- Enables dual sort mode in inbox (by last interaction vs by last customer message)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_customer_msg
ON conversations(workspace_id, last_customer_message_at DESC NULLS LAST);
