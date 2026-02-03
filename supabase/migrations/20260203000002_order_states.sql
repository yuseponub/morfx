-- ============================================================================
-- Phase 9.1: Order States Configuration
-- Configurable order states that group pipeline stages
-- Replaces hardcoded stage-phases.ts mapping
-- ============================================================================

-- ============================================================================
-- ORDER STATES TABLE
-- Workspace-level states for grouping pipeline stages
-- Each state has a name, emoji (for WhatsApp indicator), and position
-- ============================================================================

CREATE TABLE order_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, position)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_order_states_workspace ON order_states(workspace_id);
CREATE INDEX idx_order_states_position ON order_states(workspace_id, position);

-- ============================================================================
-- ADD FK TO PIPELINE_STAGES
-- Stages can optionally belong to an order state
-- ON DELETE SET NULL: when state is deleted, stages become unassigned
-- ============================================================================

ALTER TABLE pipeline_stages
ADD COLUMN order_state_id UUID REFERENCES order_states(id) ON DELETE SET NULL;

CREATE INDEX idx_stages_order_state ON pipeline_stages(order_state_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-set workspace_id from session context
CREATE TRIGGER order_states_set_workspace
  BEFORE INSERT ON order_states
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Auto-update updated_at on changes
CREATE TRIGGER order_states_updated_at
  BEFORE UPDATE ON order_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE order_states ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ORDER STATES POLICIES
-- SELECT: workspace members can read
-- INSERT/UPDATE/DELETE: workspace admins only (owner or admin role)
-- ============================================================================

-- SELECT: All workspace members can read order states
CREATE POLICY "order_states_workspace_isolation_select"
  ON order_states FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Only workspace managers can create states
CREATE POLICY "order_states_manager_insert"
  ON order_states FOR INSERT
  WITH CHECK (is_workspace_manager(workspace_id));

-- UPDATE: Only workspace managers can update states
CREATE POLICY "order_states_manager_update"
  ON order_states FOR UPDATE
  USING (is_workspace_manager(workspace_id));

-- DELETE: Only workspace managers can delete states
CREATE POLICY "order_states_manager_delete"
  ON order_states FOR DELETE
  USING (is_workspace_manager(workspace_id));
