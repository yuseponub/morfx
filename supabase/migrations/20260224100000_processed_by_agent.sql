-- Migration: Add processed_by_agent column to messages table
--
-- Default TRUE preserves semantics for existing messages (they were all
-- processed at the time they arrived). New inbound messages are inserted
-- with FALSE by domain/messages.ts, then updated to TRUE after agent
-- processing completes (webhook handler, Plan 29-03).

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS processed_by_agent BOOLEAN NOT NULL DEFAULT true;

-- Partial index for efficient "check pre-envio" queries:
-- Find unprocessed inbound messages for a conversation, ordered by time.
CREATE INDEX IF NOT EXISTS idx_messages_unprocessed_inbound
  ON messages(conversation_id, created_at)
  WHERE direction = 'inbound' AND processed_by_agent = false;
