-- ============================================================
-- ManyChat Pending Replies
-- Temporary queue for Instagram replies sent via Dynamic Content.
-- sendContent API doesn't work for IG subscribers, so we:
--   1. Save reply here with status='pending'
--   2. Call sendFlow API to trigger ManyChat Flow
--   3. Flow's Dynamic Content block calls /api/manychat/dynamic-reply
--   4. Endpoint reads pending reply and returns it
--   5. ManyChat sends it to the IG subscriber
-- ============================================================

CREATE TABLE IF NOT EXISTS manychat_pending_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL,
  reply_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Index for quick lookup of pending replies
CREATE INDEX IF NOT EXISTS idx_manychat_pending_replies_lookup
  ON manychat_pending_replies(workspace_id, subscriber_id, status)
  WHERE status = 'pending';

-- Auto-cleanup: delete sent replies older than 1 hour (optional, via cron)
COMMENT ON TABLE manychat_pending_replies IS 'Queue for Instagram replies via ManyChat Dynamic Content. Rows with status=sent can be cleaned up.';
