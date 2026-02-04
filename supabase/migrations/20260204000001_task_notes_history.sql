-- ============================================================================
-- Phase 10.1: Task Notes and Activity History
-- Extends tasks with notes and automatic change history tracking
-- Follows the proven contact_notes/contact_activity pattern
-- ============================================================================

-- ============================================================================
-- ADD POSTPONEMENT COUNTER TO TASKS
-- Tracks how many times due_date was moved forward
-- ============================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS postponement_count INTEGER NOT NULL DEFAULT 0;

-- ============================================================================
-- TASK NOTES TABLE
-- Notes attached to tasks, visible to all workspace members
-- Mirrors contact_notes structure
-- ============================================================================

CREATE TABLE task_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_task_notes_task ON task_notes(task_id);
CREATE INDEX idx_task_notes_workspace ON task_notes(workspace_id);
CREATE INDEX idx_task_notes_created ON task_notes(created_at DESC);

-- Auto-update updated_at on notes update
CREATE TRIGGER task_notes_updated_at
  BEFORE UPDATE ON task_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TASK ACTIVITY TABLE
-- Automatic activity tracking for task changes (immutable audit log)
-- Mirrors contact_activity structure
-- ============================================================================

CREATE TABLE task_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,         -- 'created', 'updated', 'completed', 'reopened', 'due_date_changed', 'deleted', 'note_added', 'note_updated', 'note_deleted'
  changes JSONB,                -- JSONB diff for field changes
  metadata JSONB,               -- Additional context (note preview, etc.)
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_task_activity_task ON task_activity(task_id);
CREATE INDEX idx_task_activity_workspace ON task_activity(workspace_id);
CREATE INDEX idx_task_activity_created ON task_activity(created_at DESC);
CREATE INDEX idx_task_activity_action ON task_activity(action);

-- Special index for postponement/due_date queries
CREATE INDEX idx_task_activity_due_date ON task_activity(task_id, action)
  WHERE action = 'due_date_changed';

-- ============================================================================
-- ACTIVITY TRIGGER FUNCTION
-- Logs all task changes with JSONB diff and handles postponement detection
-- Uses BEFORE trigger to modify NEW.postponement_count when due_date moves forward
-- ============================================================================

CREATE OR REPLACE FUNCTION log_task_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changes_json JSONB := '{}';
  old_json JSONB;
  new_json JSONB;
  key TEXT;
  user_uuid UUID;
  action_type TEXT;
BEGIN
  -- Get current user from JWT (may be null for direct DB operations)
  BEGIN
    user_uuid := (auth.jwt() ->> 'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    user_uuid := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO task_activity (task_id, workspace_id, user_id, action, changes)
    VALUES (NEW.id, NEW.workspace_id, user_uuid, 'created', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    -- Build diff of changed fields
    FOR key IN SELECT jsonb_object_keys(new_json)
    LOOP
      -- Skip updated_at and postponement_count (they are derived/auto-updated)
      IF key NOT IN ('updated_at', 'postponement_count') AND old_json -> key IS DISTINCT FROM new_json -> key THEN
        changes_json := changes_json || jsonb_build_object(
          key, jsonb_build_object('old', old_json -> key, 'new', new_json -> key)
        );
      END IF;
    END LOOP;

    -- Determine action type based on what changed
    IF changes_json ? 'due_date' THEN
      action_type := 'due_date_changed';
      -- Increment postponement counter ONLY if:
      -- 1. Both old and new due_date are NOT NULL
      -- 2. New due_date is AFTER old due_date (moved forward)
      IF (NEW.due_date IS NOT NULL AND OLD.due_date IS NOT NULL
          AND NEW.due_date > OLD.due_date) THEN
        NEW.postponement_count := COALESCE(OLD.postponement_count, 0) + 1;
      END IF;
    ELSIF changes_json ? 'status' THEN
      IF NEW.status = 'completed' THEN
        action_type := 'completed';
      ELSE
        action_type := 'reopened';
      END IF;
    ELSE
      action_type := 'updated';
    END IF;

    -- Only log if there are actual changes
    IF changes_json != '{}' THEN
      INSERT INTO task_activity (task_id, workspace_id, user_id, action, changes)
      VALUES (NEW.id, NEW.workspace_id, user_uuid, action_type, changes_json);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO task_activity (task_id, workspace_id, user_id, action, changes)
    VALUES (OLD.id, OLD.workspace_id, user_uuid, 'deleted', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

-- Attach BEFORE trigger to tasks table
-- BEFORE is required because we need to modify NEW.postponement_count
CREATE TRIGGER task_activity_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION log_task_changes();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_activity ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TASK NOTES POLICIES
-- All workspace members can view, author or admin/owner can modify
-- ============================================================================

-- SELECT: Any workspace member can view notes
CREATE POLICY "task_notes_select"
  ON task_notes FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Any workspace member can create notes (must be author)
CREATE POLICY "task_notes_insert"
  ON task_notes FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND auth.uid() = user_id
  );

-- UPDATE: Author OR admin/owner can update notes
CREATE POLICY "task_notes_update"
  ON task_notes FOR UPDATE
  USING (
    -- Author can update their own notes
    (auth.uid() = user_id AND is_workspace_member(workspace_id))
    OR
    -- Admin/owner can update any note
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = task_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE: Author OR admin/owner can delete notes
CREATE POLICY "task_notes_delete"
  ON task_notes FOR DELETE
  USING (
    -- Author can delete their own notes
    (auth.uid() = user_id AND is_workspace_member(workspace_id))
    OR
    -- Admin/owner can delete any note
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = task_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- TASK ACTIVITY POLICIES
-- Read-only for workspace members, write is trigger-managed via SECURITY DEFINER
-- ============================================================================

-- SELECT: Any workspace member can view activity
CREATE POLICY "task_activity_select"
  ON task_activity FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Only via trigger (SECURITY DEFINER function)
-- No direct insert policy needed - trigger function uses SECURITY DEFINER

-- UPDATE: Not allowed (activity log is immutable)
-- DELETE: Not allowed (activity log is immutable)
