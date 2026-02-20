-- ============================================================================
-- Phase 17: CRM Automations Engine — Foundation
-- Automations definitions, execution history, and connected orders support
-- ============================================================================

-- ============================================================================
-- AUTOMATIONS TABLE
-- User-configurable automation rules: trigger + conditions + actions
-- ============================================================================

CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Trigger configuration
  trigger_type TEXT NOT NULL,  -- 'order.stage_changed', 'tag.assigned', 'tag.removed', 'contact.created', 'order.created', 'field.changed', 'whatsapp.message_received', 'whatsapp.keyword_match', 'task.completed', 'task.overdue'
  trigger_config JSONB NOT NULL DEFAULT '{}',  -- Pipeline filter, keyword match, field name, etc.

  -- Conditions (AND/OR groups)
  conditions JSONB,  -- ConditionGroup or null (null = always match)

  -- Actions (sequential array)
  actions JSONB NOT NULL DEFAULT '[]',  -- AutomationAction[] executed in order

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- ============================================================================
-- AUTOMATION EXECUTIONS TABLE
-- Detailed execution history for monitoring and debugging
-- ============================================================================

CREATE TABLE automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  trigger_event JSONB NOT NULL,  -- Snapshot of the trigger event data
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed', 'cancelled')),
  actions_log JSONB NOT NULL DEFAULT '[]',  -- [{index, type, status, result, duration_ms, error}]
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  cascade_depth INTEGER NOT NULL DEFAULT 0
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Automations: fast lookup of enabled automations by trigger type per workspace
CREATE INDEX idx_automations_workspace_trigger ON automations(workspace_id, trigger_type, is_enabled);

-- Automations: workspace listing
CREATE INDEX idx_automations_workspace ON automations(workspace_id);

-- Executions: history lookup per automation
CREATE INDEX idx_automation_executions_workspace_automation ON automation_executions(workspace_id, automation_id);

-- Executions: recent executions list (sorted by date)
CREATE INDEX idx_automation_executions_workspace_started ON automation_executions(workspace_id, started_at DESC);

-- Executions: partial index for failure monitoring
CREATE INDEX idx_automation_executions_failed ON automation_executions(status) WHERE status = 'failed';

-- ============================================================================
-- TRIGGER: Auto-update updated_at on automations
-- Reuses existing update_updated_at_column() function from contacts migration
-- ============================================================================

CREATE TRIGGER automations_updated_at
  BEFORE UPDATE ON automations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- AUTOMATIONS POLICIES
-- Full CRUD for workspace members
-- ============================================================================

CREATE POLICY "automations_workspace_isolation_select"
  ON automations FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "automations_workspace_isolation_insert"
  ON automations FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "automations_workspace_isolation_update"
  ON automations FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "automations_workspace_isolation_delete"
  ON automations FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- AUTOMATION EXECUTIONS POLICIES
-- SELECT only for workspace members (executions are created by the system)
-- ============================================================================

CREATE POLICY "automation_executions_workspace_isolation_select"
  ON automation_executions FOR SELECT
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- CONNECTED ORDERS: source_order_id column
-- Distinct from linked_order_id (returns). source_order_id tracks orders
-- created by automations (1-to-many: one source can produce many derived orders).
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source_order_id UUID REFERENCES orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source_order_id ON orders(source_order_id) WHERE source_order_id IS NOT NULL;
