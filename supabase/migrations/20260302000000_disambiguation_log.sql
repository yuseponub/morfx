-- ============================================================================
-- Phase 33: Confidence Routing + Disambiguation Log
-- Creates disambiguation_log table for logging low-confidence intent detections.
-- When the bot is not confident enough to respond, the message is handed off
-- to a human and logged here for review. Human reviewers can mark the correct
-- intent/action, building a dataset for future disambiguation improvements.
-- ============================================================================

-- 1. Create disambiguation_log table
CREATE TABLE disambiguation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  customer_message TEXT NOT NULL,
  detected_intent TEXT NOT NULL,
  confidence NUMERIC(5,2) NOT NULL,
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasoning TEXT,
  agent_state TEXT NOT NULL,
  templates_enviados JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_templates JSONB NOT NULL DEFAULT '[]'::jsonb,
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_intent TEXT,
  correct_action TEXT,
  guidance_notes TEXT,
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- 2. Indexes
CREATE INDEX idx_disambiguation_log_workspace ON disambiguation_log(workspace_id);
CREATE INDEX idx_disambiguation_log_unreviewed ON disambiguation_log(workspace_id, reviewed) WHERE reviewed = false;
CREATE INDEX idx_disambiguation_log_session ON disambiguation_log(session_id);
CREATE INDEX idx_disambiguation_log_created ON disambiguation_log(workspace_id, created_at DESC);

-- 3. RLS
ALTER TABLE disambiguation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_disambiguation_log" ON disambiguation_log
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "insert_disambiguation_log" ON disambiguation_log
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "update_disambiguation_log" ON disambiguation_log
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- 4. Grants
GRANT ALL ON disambiguation_log TO authenticated;
GRANT ALL ON disambiguation_log TO service_role;
