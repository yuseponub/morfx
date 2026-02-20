-- ============================================================================
-- Phase 19: AI Automation Builder — Builder Sessions
-- Stores conversational sessions between users and the AI automation builder.
-- Includes workspace isolation, RLS, and efficient indexing.
-- ============================================================================

-- ============================================================================
-- BUILDER SESSIONS TABLE
-- ============================================================================

CREATE TABLE builder_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  automations_created UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Fast lookup of sessions by workspace and user
CREATE INDEX idx_builder_sessions_workspace_user
  ON builder_sessions(workspace_id, user_id);

-- Ordering sessions by creation date
CREATE INDEX idx_builder_sessions_created_at
  ON builder_sessions(created_at DESC);

-- ============================================================================
-- TRIGGER: Auto-update updated_at
-- Reuses existing update_updated_at_column() function from workspaces migration
-- ============================================================================

CREATE TRIGGER update_builder_sessions_updated_at
  BEFORE UPDATE ON builder_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE builder_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- SELECT: workspace members can read sessions from their workspace
CREATE POLICY "builder_sessions_workspace_select"
  ON builder_sessions FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: workspace members can create sessions in their workspace
CREATE POLICY "builder_sessions_workspace_insert"
  ON builder_sessions FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

-- UPDATE: only the session owner can update their own sessions
CREATE POLICY "builder_sessions_owner_update"
  ON builder_sessions FOR UPDATE
  USING (user_id = auth.uid());

-- DELETE: only the session owner can delete their own sessions
CREATE POLICY "builder_sessions_owner_delete"
  ON builder_sessions FOR DELETE
  USING (user_id = auth.uid());
