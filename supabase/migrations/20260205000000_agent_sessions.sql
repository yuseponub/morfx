-- ============================================================================
-- Phase 13: Agent Engine Core - Plan 01
-- Agent sessions, turns, and state tables with RLS
-- ============================================================================

-- ============================================================================
-- AGENT_SESSIONS TABLE
-- One session per conversation per agent with optimistic locking
-- ============================================================================

CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Agent identification (references code-defined agent configs, not a FK)
  agent_id TEXT NOT NULL,
  -- Foreign keys to existing tables
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Optimistic locking: incremented on each update
  version INTEGER NOT NULL DEFAULT 1,

  -- Session status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed', 'handed_off')),
  current_mode TEXT NOT NULL DEFAULT 'conversacion',

  -- Timestamps (America/Bogota timezone per project rules)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- One active session per conversation per agent
  UNIQUE(conversation_id, agent_id)
);

-- ============================================================================
-- AGENT_TURNS TABLE
-- Complete audit trail of every conversation turn with token tracking
-- ============================================================================

CREATE TABLE agent_turns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,

  -- Message content
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Intent detection (for user turns)
  intent_detected TEXT,
  confidence NUMERIC(5,2),

  -- Tool calls (for assistant turns) - array of {name, input, result}
  tools_called JSONB NOT NULL DEFAULT '[]',

  -- Token tracking for budget enforcement
  tokens_used INTEGER NOT NULL DEFAULT 0,

  -- Timestamp (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Unique turn per session
  UNIQUE(session_id, turn_number)
);

-- ============================================================================
-- SESSION_STATE TABLE
-- Flexible state storage per session for agent workflow tracking
-- ============================================================================

CREATE TABLE session_state (
  session_id UUID PRIMARY KEY REFERENCES agent_sessions(id) ON DELETE CASCADE,

  -- State fields (user decision from CONTEXT.md)
  intents_vistos JSONB NOT NULL DEFAULT '[]',
  templates_enviados JSONB NOT NULL DEFAULT '[]',
  datos_capturados JSONB NOT NULL DEFAULT '{}',
  pack_seleccionado TEXT CHECK (pack_seleccionado IN ('1x', '2x', '3x') OR pack_seleccionado IS NULL),

  -- Timestamps for timer tracking (Inngest workflows)
  proactive_started_at TIMESTAMPTZ,
  first_data_at TIMESTAMPTZ,
  min_data_at TIMESTAMPTZ,
  ofrecer_promos_at TIMESTAMPTZ,

  -- Updated timestamp (America/Bogota timezone)
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- ============================================================================
-- INDEXES
-- Performance optimization for common query patterns
-- ============================================================================

-- Agent sessions indexes
CREATE INDEX idx_agent_sessions_workspace ON agent_sessions(workspace_id);
CREATE INDEX idx_agent_sessions_conversation ON agent_sessions(conversation_id);
CREATE INDEX idx_agent_sessions_status ON agent_sessions(workspace_id, status);
CREATE INDEX idx_agent_sessions_activity ON agent_sessions(workspace_id, last_activity_at DESC);

-- Agent turns indexes
CREATE INDEX idx_agent_turns_session ON agent_turns(session_id, turn_number);
CREATE INDEX idx_agent_turns_created ON agent_turns(session_id, created_at DESC);

-- ============================================================================
-- TRIGGERS
-- Automatic updated_at timestamp management
-- Uses existing update_updated_at_column() function from previous migrations
-- ============================================================================

CREATE TRIGGER agent_sessions_updated_at
  BEFORE UPDATE ON agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER session_state_updated_at
  BEFORE UPDATE ON session_state
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- Workspace isolation using existing is_workspace_member() function
-- ============================================================================

ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_state ENABLE ROW LEVEL SECURITY;

-- Agent sessions: workspace isolation via is_workspace_member()
CREATE POLICY "agent_sessions_workspace_select"
  ON agent_sessions FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "agent_sessions_workspace_insert"
  ON agent_sessions FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "agent_sessions_workspace_update"
  ON agent_sessions FOR UPDATE
  USING (is_workspace_member(workspace_id));

-- Agent turns: access via parent session
CREATE POLICY "agent_turns_access_select"
  ON agent_turns FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = agent_turns.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

CREATE POLICY "agent_turns_access_insert"
  ON agent_turns FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = agent_turns.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

CREATE POLICY "agent_turns_access_update"
  ON agent_turns FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = agent_turns.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

-- Session state: access via parent session
CREATE POLICY "session_state_access_select"
  ON session_state FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = session_state.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

CREATE POLICY "session_state_access_insert"
  ON session_state FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = session_state.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

CREATE POLICY "session_state_access_update"
  ON session_state FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM agent_sessions
    WHERE agent_sessions.id = session_state.session_id
    AND is_workspace_member(agent_sessions.workspace_id)
  ));

-- ============================================================================
-- REALTIME
-- Enable realtime for session updates (agent dashboard monitoring)
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE agent_sessions;
