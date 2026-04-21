-- ============================================================================
-- Standalone: whatsapp-template-ai-builder
-- Adds a 'kind' column to builder_sessions so the table can host multiple
-- builder flavors (automation / template / future config builders).
--
-- Existing rows default to 'automation' so the automation builder keeps
-- working without any code change. The CHECK constraint pins the allowed
-- values for this standalone; extending it later is a new ALTER.
-- ============================================================================

ALTER TABLE builder_sessions
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'automation'
    CHECK (kind IN ('automation', 'template'));

CREATE INDEX idx_builder_sessions_workspace_kind
  ON builder_sessions(workspace_id, kind, updated_at DESC);

COMMENT ON COLUMN builder_sessions.kind IS
  'Builder flavor: automation (Phase 19) or template (standalone whatsapp-template-ai-builder). Extend CHECK constraint when adding new flavors.';
