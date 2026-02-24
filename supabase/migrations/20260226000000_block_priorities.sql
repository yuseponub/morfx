-- ============================================================================
-- Phase 31 Plan 02: Block Priorities + Pending Templates
-- Adds priority column to agent_templates and pending_templates to session_state
-- ============================================================================

-- 1. Add priority column to agent_templates with CHECK constraint
ALTER TABLE agent_templates
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'CORE'
  CHECK (priority IN ('CORE', 'COMPLEMENTARIA', 'OPCIONAL'));

-- 2. Seed priorities based on existing orden values
-- orden 0 = CORE (primary message), orden 1 = COMPLEMENTARIA, orden 2+ = OPCIONAL
UPDATE agent_templates SET priority = 'CORE' WHERE orden = 0;
UPDATE agent_templates SET priority = 'COMPLEMENTARIA' WHERE orden = 1;
UPDATE agent_templates SET priority = 'OPCIONAL' WHERE orden >= 2;

-- 3. Add pending_templates JSONB column to session_state
-- Stores templates that were deferred during interruption for later merge
ALTER TABLE session_state
  ADD COLUMN pending_templates JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 4. Column comments
COMMENT ON COLUMN agent_templates.priority IS 'Block priority: CORE (always send), COMPLEMENTARIA (send if no interruption), OPCIONAL (send if idle)';
COMMENT ON COLUMN session_state.pending_templates IS 'Templates deferred during interruption, pending merge into next response block';
