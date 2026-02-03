-- ============================================================================
-- Fix: Remove set_workspace_id trigger from order_states
-- The Server Action already provides workspace_id explicitly
-- The trigger was overwriting it with session context which may not be set
-- ============================================================================

DROP TRIGGER IF EXISTS order_states_set_workspace ON order_states;
