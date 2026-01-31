-- ============================================================================
-- Phase 2: Workspaces & Roles
-- Multi-tenant architecture with workspace isolation via RLS
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABLES
-- ============================================================================

-- Workspaces table
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  business_type TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index on owner_id for performance
CREATE INDEX idx_workspaces_owner_id ON workspaces(owner_id);
CREATE INDEX idx_workspaces_slug ON workspaces(slug);

-- Workspace members table (junction table for users and workspaces)
CREATE TABLE workspace_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'agent')),
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- Create indexes for RLS policy performance
CREATE INDEX idx_workspace_members_workspace_id ON workspace_members(workspace_id);
CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_role ON workspace_members(role);

-- Workspace invitations table
CREATE TABLE workspace_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'agent')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for invitations
CREATE INDEX idx_workspace_invitations_workspace_id ON workspace_invitations(workspace_id);
CREATE INDEX idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX idx_workspace_invitations_token ON workspace_invitations(token);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get current user's workspace_id from JWT claims
CREATE OR REPLACE FUNCTION get_current_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID,
    NULL
  )
$$;

-- Function to check if user is member of a workspace
CREATE OR REPLACE FUNCTION is_workspace_member(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
  )
$$;

-- Function to check if user has specific role in workspace
CREATE OR REPLACE FUNCTION has_workspace_role(workspace_uuid UUID, required_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
    AND (
      role = required_role
      OR role = 'owner'
      OR (role = 'admin' AND required_role = 'agent')
    )
  )
$$;

-- Function to check if user is owner or admin in workspace
CREATE OR REPLACE FUNCTION is_workspace_admin(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workspace_members_updated_at
  BEFORE UPDATE ON workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invitations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- WORKSPACES POLICIES
-- ============================================================================

-- Users can view workspaces they are members of
CREATE POLICY "Users can view their workspaces"
  ON workspaces
  FOR SELECT
  USING (is_workspace_member(id));

-- Any authenticated user can create a workspace (they become owner)
CREATE POLICY "Authenticated users can create workspaces"
  ON workspaces
  FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Only owner can update workspace
CREATE POLICY "Owners can update their workspaces"
  ON workspaces
  FOR UPDATE
  USING (owner_id = auth.uid());

-- Only owner can delete workspace
CREATE POLICY "Owners can delete their workspaces"
  ON workspaces
  FOR DELETE
  USING (owner_id = auth.uid());

-- ============================================================================
-- WORKSPACE MEMBERS POLICIES
-- ============================================================================

-- Users can view members of workspaces they belong to
CREATE POLICY "Members can view workspace members"
  ON workspace_members
  FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Admins and owners can add members
CREATE POLICY "Admins can add workspace members"
  ON workspace_members
  FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

-- Admins and owners can update members (but not promote to owner)
CREATE POLICY "Admins can update workspace members"
  ON workspace_members
  FOR UPDATE
  USING (
    is_workspace_admin(workspace_id)
    AND (
      -- Can't change owner membership
      (SELECT role FROM workspace_members WHERE id = workspace_members.id) != 'owner'
      OR auth.uid() = (SELECT owner_id FROM workspaces WHERE id = workspace_id)
    )
  );

-- Admins can remove members (but not owner)
CREATE POLICY "Admins can remove workspace members"
  ON workspace_members
  FOR DELETE
  USING (
    is_workspace_admin(workspace_id)
    AND role != 'owner'
  );

-- Users can leave a workspace (remove themselves, except owner)
CREATE POLICY "Users can leave workspaces"
  ON workspace_members
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND role != 'owner'
  );

-- ============================================================================
-- WORKSPACE INVITATIONS POLICIES
-- ============================================================================

-- Members can view invitations for their workspace
CREATE POLICY "Members can view workspace invitations"
  ON workspace_invitations
  FOR SELECT
  USING (is_workspace_member(workspace_id));

-- Anyone can view invitation by token (for accepting)
CREATE POLICY "Anyone can view invitation by token"
  ON workspace_invitations
  FOR SELECT
  USING (
    token IS NOT NULL
    AND expires_at > NOW()
    AND accepted_at IS NULL
  );

-- Admins can create invitations
CREATE POLICY "Admins can create invitations"
  ON workspace_invitations
  FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

-- Admins can delete invitations
CREATE POLICY "Admins can delete invitations"
  ON workspace_invitations
  FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- Invited users can accept invitation (update accepted_at)
CREATE POLICY "Invited users can accept invitations"
  ON workspace_invitations
  FOR UPDATE
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
    AND expires_at > NOW()
    AND accepted_at IS NULL
  );

-- ============================================================================
-- HELPER FUNCTION FOR WORKSPACE CREATION
-- ============================================================================

-- Function to create workspace and add owner as member (atomic operation)
CREATE OR REPLACE FUNCTION create_workspace_with_owner(
  workspace_name TEXT,
  workspace_slug TEXT,
  workspace_business_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_workspace_id UUID;
  current_user_id UUID := auth.uid();
BEGIN
  -- Verify user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Create the workspace
  INSERT INTO workspaces (name, slug, business_type, owner_id)
  VALUES (workspace_name, workspace_slug, workspace_business_type, current_user_id)
  RETURNING id INTO new_workspace_id;

  -- Add the creator as owner member
  INSERT INTO workspace_members (workspace_id, user_id, role, permissions)
  VALUES (new_workspace_id, current_user_id, 'owner', '{"all": true}');

  RETURN new_workspace_id;
END;
$$;

-- Function to accept invitation and join workspace
CREATE OR REPLACE FUNCTION accept_workspace_invitation(invitation_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  current_user_id UUID := auth.uid();
  current_user_email TEXT;
BEGIN
  -- Verify user is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Get user email
  SELECT email INTO current_user_email FROM auth.users WHERE id = current_user_id;

  -- Find the invitation
  SELECT * INTO inv FROM workspace_invitations
  WHERE token = invitation_token
    AND expires_at > NOW()
    AND accepted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid or expired invitation';
  END IF;

  -- Verify email matches
  IF inv.email != current_user_email THEN
    RAISE EXCEPTION 'Invitation is for a different email address';
  END IF;

  -- Check if already a member
  IF EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = inv.workspace_id AND user_id = current_user_id
  ) THEN
    RAISE EXCEPTION 'Already a member of this workspace';
  END IF;

  -- Add user as member
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (inv.workspace_id, current_user_id, inv.role);

  -- Mark invitation as accepted
  UPDATE workspace_invitations
  SET accepted_at = NOW()
  WHERE id = inv.id;

  RETURN inv.workspace_id;
END;
$$;

-- Function to generate secure invitation token
CREATE OR REPLACE FUNCTION generate_invitation_token()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT encode(gen_random_bytes(32), 'hex')
$$;
