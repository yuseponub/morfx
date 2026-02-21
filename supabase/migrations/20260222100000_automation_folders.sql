-- ============================================================================
-- Automation Folders + Ordering Support
-- Adds folder grouping and position-based ordering for automations UI
-- ============================================================================

-- ============================================================================
-- AUTOMATION FOLDERS TABLE
-- User-created folders for organizing automations
-- ============================================================================

CREATE TABLE automation_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_collapsed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_automation_folders_workspace ON automation_folders(workspace_id);

-- ============================================================================
-- TRIGGER: Auto-update updated_at
-- ============================================================================

CREATE TRIGGER automation_folders_updated_at
  BEFORE UPDATE ON automation_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE automation_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_folders_workspace_isolation_select"
  ON automation_folders FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "automation_folders_workspace_isolation_insert"
  ON automation_folders FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "automation_folders_workspace_isolation_update"
  ON automation_folders FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "automation_folders_workspace_isolation_delete"
  ON automation_folders FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- ADD FOLDER & POSITION COLUMNS TO AUTOMATIONS
-- folder_id ON DELETE CASCADE: deleting a folder deletes its automations
-- position: integer ordering within folder or root
-- ============================================================================

ALTER TABLE automations ADD COLUMN folder_id UUID REFERENCES automation_folders(id) ON DELETE CASCADE;
ALTER TABLE automations ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_automations_folder ON automations(folder_id);
