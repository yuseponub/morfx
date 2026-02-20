-- Add agent_session_id to tool_executions for agent conversation tracing
-- Phase 12: Action DSL Real - Plan 01
--
-- This column enables reconstructing the complete sequence of tool calls
-- within an agent conversation. When source='agent', this field links
-- the execution to the specific agent session that triggered it.

ALTER TABLE tool_executions
  ADD COLUMN IF NOT EXISTS agent_session_id UUID;

-- Index for reconstructing agent conversations
-- Partial index: only indexes rows where agent_session_id is set
CREATE INDEX IF NOT EXISTS idx_tool_executions_agent_session
  ON tool_executions(agent_session_id)
  WHERE agent_session_id IS NOT NULL;

COMMENT ON COLUMN tool_executions.agent_session_id IS
  'Agent session ID for tracing. NOT NULL when invoked by agent.';
