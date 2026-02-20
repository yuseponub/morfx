-- Phase 20: SMS Messages tracking table for Twilio integration
-- Tracks every SMS sent/received for usage reporting and cost tracking.

CREATE TABLE IF NOT EXISTS sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  twilio_sid TEXT NOT NULL UNIQUE,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT NOT NULL,
  price DECIMAL(10, 6),
  price_unit TEXT DEFAULT 'USD',
  segments INTEGER DEFAULT 1,
  media_url TEXT,
  automation_execution_id UUID REFERENCES automation_executions(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- Index for workspace queries (dashboard, usage reports)
CREATE INDEX idx_sms_messages_workspace ON sms_messages(workspace_id, created_at DESC);

-- Index for Twilio status callback lookup by message SID
CREATE INDEX idx_sms_messages_twilio_sid ON sms_messages(twilio_sid);

-- RLS policies
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

-- Workspace members can read SMS messages (for usage dashboard)
CREATE POLICY sms_messages_select ON sms_messages
  FOR SELECT TO authenticated
  USING (workspace_id IN (
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));

-- System inserts only (from automation executor / Twilio status callback)
-- No user insert/update/delete policies needed — all writes go through createAdminClient()
