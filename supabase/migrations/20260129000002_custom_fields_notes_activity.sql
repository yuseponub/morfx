-- ============================================================================
-- Phase 5: Custom Fields, Notes, and Activity Tracking
-- Extends contacts with custom fields, notes, and automatic activity history
-- ============================================================================

-- ============================================================================
-- CUSTOM FIELD DEFINITIONS TABLE
-- Stores schema for custom fields per workspace
-- ============================================================================

CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,           -- Display name (e.g., "Fecha de cumpleanos")
  key TEXT NOT NULL,            -- Storage key (e.g., "fecha_cumpleanos")
  field_type TEXT NOT NULL,     -- text, number, date, select, checkbox, etc.
  options JSONB,                -- Options for select type (e.g., ["Option1", "Option2"])
  is_required BOOLEAN DEFAULT false,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, key)
);

CREATE INDEX idx_custom_fields_workspace ON custom_field_definitions(workspace_id);
CREATE INDEX idx_custom_fields_order ON custom_field_definitions(workspace_id, display_order);

-- ============================================================================
-- ADD CUSTOM_FIELDS COLUMN TO CONTACTS
-- JSONB column stores actual custom field values
-- ============================================================================

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields ON contacts USING GIN (custom_fields);

-- ============================================================================
-- CONTACT NOTES TABLE
-- Notes attached to contacts, visible to all workspace members
-- ============================================================================

CREATE TABLE contact_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_notes_contact ON contact_notes(contact_id);
CREATE INDEX idx_notes_workspace ON contact_notes(workspace_id);
CREATE INDEX idx_notes_created ON contact_notes(created_at DESC);

-- Auto-update updated_at on notes update
CREATE TRIGGER contact_notes_updated_at
  BEFORE UPDATE ON contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- CONTACT ACTIVITY TABLE
-- Automatic activity tracking for contact changes
-- ============================================================================

CREATE TABLE contact_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,         -- created, updated, deleted, note_added, etc.
  changes JSONB,                -- JSONB diff for updated action
  metadata JSONB,               -- Additional context
  created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())
);

CREATE INDEX idx_activity_contact ON contact_activity(contact_id);
CREATE INDEX idx_activity_workspace ON contact_activity(workspace_id);
CREATE INDEX idx_activity_created ON contact_activity(created_at DESC);
CREATE INDEX idx_activity_action ON contact_activity(action);

-- ============================================================================
-- ACTIVITY TRIGGER FUNCTION
-- Automatically logs contact changes with JSONB diff
-- ============================================================================

CREATE OR REPLACE FUNCTION log_contact_changes()
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
BEGIN
  -- Get current user from JWT (may be null for direct DB operations)
  BEGIN
    user_uuid := (auth.jwt() ->> 'sub')::UUID;
  EXCEPTION WHEN OTHERS THEN
    user_uuid := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO contact_activity (contact_id, workspace_id, user_id, action, changes)
    VALUES (NEW.id, NEW.workspace_id, user_uuid, 'created', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_json := to_jsonb(OLD);
    new_json := to_jsonb(NEW);

    -- Build diff of changed fields
    FOR key IN SELECT jsonb_object_keys(new_json)
    LOOP
      -- Skip updated_at to avoid noise in activity log
      IF key != 'updated_at' AND old_json -> key IS DISTINCT FROM new_json -> key THEN
        changes_json := changes_json || jsonb_build_object(
          key, jsonb_build_object('old', old_json -> key, 'new', new_json -> key)
        );
      END IF;
    END LOOP;

    -- Only log if there are actual changes
    IF changes_json != '{}' THEN
      INSERT INTO contact_activity (contact_id, workspace_id, user_id, action, changes)
      VALUES (NEW.id, NEW.workspace_id, user_uuid, 'updated', changes_json);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO contact_activity (contact_id, workspace_id, user_id, action, changes)
    VALUES (OLD.id, OLD.workspace_id, user_uuid, 'deleted', to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$;

-- Attach trigger to contacts table
CREATE TRIGGER contact_activity_trigger
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION log_contact_changes();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_activity ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CUSTOM FIELD DEFINITIONS POLICIES
-- All workspace members can read, only admin/owner can modify
-- ============================================================================

-- SELECT: Any workspace member can view field definitions
CREATE POLICY "custom_fields_select"
  ON custom_field_definitions FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Only admin or owner can create field definitions
CREATE POLICY "custom_fields_insert"
  ON custom_field_definitions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_field_definitions.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- UPDATE: Only admin or owner can update field definitions
CREATE POLICY "custom_fields_update"
  ON custom_field_definitions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_field_definitions.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE: Only admin or owner can delete field definitions
CREATE POLICY "custom_fields_delete"
  ON custom_field_definitions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = custom_field_definitions.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- CONTACT NOTES POLICIES
-- All workspace members can view, author or admin/owner can modify
-- ============================================================================

-- SELECT: Any workspace member can view notes
CREATE POLICY "notes_select"
  ON contact_notes FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Any workspace member can create notes
CREATE POLICY "notes_insert"
  ON contact_notes FOR INSERT
  WITH CHECK (
    is_workspace_member(workspace_id)
    AND auth.uid() = user_id
  );

-- UPDATE: Author OR admin/owner can update notes
CREATE POLICY "notes_update"
  ON contact_notes FOR UPDATE
  USING (
    -- Author can update their own notes
    (auth.uid() = user_id AND is_workspace_member(workspace_id))
    OR
    -- Admin/owner can update any note
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = contact_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- DELETE: Author OR admin/owner can delete notes
CREATE POLICY "notes_delete"
  ON contact_notes FOR DELETE
  USING (
    -- Author can delete their own notes
    (auth.uid() = user_id AND is_workspace_member(workspace_id))
    OR
    -- Admin/owner can delete any note
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = contact_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- CONTACT ACTIVITY POLICIES
-- Read-only for workspace members, write is trigger-managed
-- ============================================================================

-- SELECT: Any workspace member can view activity
CREATE POLICY "activity_select"
  ON contact_activity FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: Only via trigger (SECURITY DEFINER function)
-- No direct insert policy needed - trigger function uses SECURITY DEFINER

-- UPDATE: Not allowed (activity log is immutable)
-- DELETE: Not allowed (activity log is immutable)
