-- ============================================================================
-- Phase 4: Contacts & Tags
-- Contact management with workspace isolation and tag system
-- ============================================================================

-- ============================================================================
-- TABLES
-- ============================================================================

-- Tags table (global tags for workspace, usable on contacts, orders, whatsapp)
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, name)
);

-- Create indexes for tags
CREATE INDEX idx_tags_workspace ON tags(workspace_id);

-- Contacts table
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(workspace_id, phone)
);

-- Create indexes for contacts
CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_updated ON contacts(updated_at DESC);

-- Contact_tags junction table
CREATE TABLE contact_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  UNIQUE(contact_id, tag_id)
);

-- Create indexes for contact_tags
CREATE INDEX idx_contact_tags_contact ON contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag ON contact_tags(tag_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to auto-set workspace_id from JWT on insert
-- Note: Reusing pattern from Phase 2, creating if not exists
CREATE OR REPLACE FUNCTION set_workspace_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If workspace_id is not set, get it from JWT claims
  IF NEW.workspace_id IS NULL THEN
    NEW.workspace_id := (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID;
  END IF;

  -- Validate workspace_id is set
  IF NEW.workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id is required';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-set workspace_id on contacts insert
CREATE TRIGGER contacts_set_workspace
  BEFORE INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Auto-set workspace_id on tags insert
CREATE TRIGGER tags_set_workspace
  BEFORE INSERT ON tags
  FOR EACH ROW
  EXECUTE FUNCTION set_workspace_id();

-- Auto-update updated_at on contacts update
-- Note: update_updated_at_column() already exists from Phase 2
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- TAGS POLICIES
-- Uses is_workspace_member() from Phase 2 for workspace isolation
-- ============================================================================

CREATE POLICY "tags_workspace_isolation_select"
  ON tags FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "tags_workspace_isolation_insert"
  ON tags FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "tags_workspace_isolation_update"
  ON tags FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "tags_workspace_isolation_delete"
  ON tags FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- CONTACTS POLICIES
-- Uses is_workspace_member() from Phase 2 for workspace isolation
-- ============================================================================

CREATE POLICY "contacts_workspace_isolation_select"
  ON contacts FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "contacts_workspace_isolation_insert"
  ON contacts FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "contacts_workspace_isolation_update"
  ON contacts FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "contacts_workspace_isolation_delete"
  ON contacts FOR DELETE
  USING (is_workspace_member(workspace_id));

-- ============================================================================
-- CONTACT_TAGS POLICIES
-- Checks workspace membership via parent contact
-- ============================================================================

CREATE POLICY "contact_tags_access_select"
  ON contact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_tags.contact_id
      AND is_workspace_member(contacts.workspace_id)
    )
  );

CREATE POLICY "contact_tags_access_insert"
  ON contact_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_tags.contact_id
      AND is_workspace_member(contacts.workspace_id)
    )
  );

CREATE POLICY "contact_tags_access_delete"
  ON contact_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM contacts
      WHERE contacts.id = contact_tags.contact_id
      AND is_workspace_member(contacts.workspace_id)
    )
  );
