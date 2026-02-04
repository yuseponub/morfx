-- ============================================================================
-- Phase 10: Tasks Foundation
-- Task management with entity linking via exclusive arc pattern
-- ============================================================================

-- ============================================================================
-- TASK TYPES TABLE
-- Workspace-scoped task categories for customization
-- ============================================================================

CREATE TABLE task_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'gray',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, name)
);

CREATE INDEX idx_task_types_workspace ON task_types(workspace_id);

-- ============================================================================
-- TASKS TABLE
-- Main task entity with exclusive arc for entity linking
-- At most one of contact_id, order_id, or conversation_id can be populated
-- ============================================================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Core task fields
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  task_type_id UUID REFERENCES task_types(id) ON DELETE SET NULL,

  -- Exclusive arc: at most one entity link
  -- This constraint ensures tasks can be linked to exactly one entity (or none)
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,

  -- Assignment tracking
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Completion tracking
  completed_at TIMESTAMPTZ,

  -- Timestamps (America/Bogota timezone)
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),

  -- Exclusive arc constraint: at most one entity link
  CONSTRAINT task_entity_exclusive CHECK (
    (CASE WHEN contact_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN order_id IS NOT NULL THEN 1 ELSE 0 END +
     CASE WHEN conversation_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary workspace index
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);

-- Entity link indexes (partial for efficiency)
CREATE INDEX idx_tasks_contact ON tasks(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_tasks_order ON tasks(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX idx_tasks_conversation ON tasks(conversation_id) WHERE conversation_id IS NOT NULL;

-- Pending tasks by due date (for dashboard/reminders)
CREATE INDEX idx_tasks_due_pending ON tasks(workspace_id, due_date) WHERE status = 'pending';

-- Assigned user index
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to) WHERE assigned_to IS NOT NULL;

-- Status index for filtering
CREATE INDEX idx_tasks_status ON tasks(workspace_id, status);

-- Created by user (for "my created tasks")
CREATE INDEX idx_tasks_created_by ON tasks(created_by) WHERE created_by IS NOT NULL;

-- ============================================================================
-- TRIGGERS: Auto-set workspace_id
-- ============================================================================

CREATE TRIGGER task_types_set_workspace
  BEFORE INSERT ON task_types
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

CREATE TRIGGER tasks_set_workspace
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- ============================================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================================

CREATE TRIGGER task_types_updated_at
  BEFORE UPDATE ON task_types
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TRIGGER: Auto-set completed_at on status change
-- ============================================================================

CREATE OR REPLACE FUNCTION set_task_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set completed_at when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    NEW.completed_at := timezone('America/Bogota', NOW());
  -- Clear completed_at when status changes from 'completed' to something else
  ELSIF NEW.status != 'completed' AND OLD.status = 'completed' THEN
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_set_completed_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at();

-- Also handle completed_at on insert if created as completed
CREATE OR REPLACE FUNCTION set_task_completed_at_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := timezone('America/Bogota', NOW());
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_set_completed_at_insert
  BEFORE INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_completed_at_on_insert();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE task_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TASK TYPES POLICIES
-- All members can view; managers (owner/admin) can modify
-- ============================================================================

CREATE POLICY "task_types_workspace_isolation_select"
  ON task_types FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "task_types_workspace_isolation_insert"
  ON task_types FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "task_types_workspace_isolation_update"
  ON task_types FOR UPDATE
  USING (is_workspace_admin(workspace_id));

CREATE POLICY "task_types_workspace_isolation_delete"
  ON task_types FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- ============================================================================
-- TASKS POLICIES
-- Members can view all workspace tasks
-- Members can create tasks (created_by = self)
-- Author or assigned can update
-- Managers can delete
-- ============================================================================

-- All workspace members can view tasks
CREATE POLICY "tasks_workspace_isolation_select"
  ON tasks FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Workspace members can create tasks
CREATE POLICY "tasks_workspace_isolation_insert"
  ON tasks FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND (created_by IS NULL OR created_by = auth.uid())
  );

-- Author or assigned user can update tasks
CREATE POLICY "tasks_workspace_isolation_update"
  ON tasks FOR UPDATE
  USING (
    is_workspace_member(workspace_id)
    AND (
      created_by = auth.uid()
      OR assigned_to = auth.uid()
      OR is_workspace_admin(workspace_id)
    )
  );

-- Only managers can delete tasks
CREATE POLICY "tasks_workspace_isolation_delete"
  ON tasks FOR DELETE
  USING (is_workspace_admin(workspace_id));
