-- ============================================================================
-- Phase 8: Role-Based Conversation Visibility (WAPP-07, WAPP-08)
-- Managers see all conversations, agents only see assigned or unassigned
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTION: Check if user is manager (owner/admin) in workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION is_workspace_manager(workspace_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = workspace_uuid
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')  -- owner and admin are considered managers
  )
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION is_workspace_manager(UUID) TO authenticated;

-- ============================================================================
-- DROP EXISTING CONVERSATION POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "conversations_workspace_isolation_select" ON conversations;
DROP POLICY IF EXISTS "Workspace members can view conversations" ON conversations;

DROP POLICY IF EXISTS "conversations_workspace_isolation_update" ON conversations;
DROP POLICY IF EXISTS "Workspace members can update conversations" ON conversations;

DROP POLICY IF EXISTS "conversations_workspace_isolation_delete" ON conversations;
DROP POLICY IF EXISTS "Workspace members can delete conversations" ON conversations;

-- ============================================================================
-- CREATE NEW ROLE-BASED SELECT POLICY
-- Manager/Admin sees all workspace conversations
-- Agent sees only assigned to self or unassigned
-- ============================================================================

CREATE POLICY "conversations_role_based_select"
  ON conversations FOR SELECT
  USING (
    -- Must be workspace member first
    is_workspace_member(workspace_id)
    AND (
      -- Managers (owner/admin) see all workspace conversations
      is_workspace_manager(workspace_id)
      OR
      -- Agents see conversations assigned to them
      assigned_to = auth.uid()
      OR
      -- Agents also see unassigned conversations
      assigned_to IS NULL
    )
  );

COMMENT ON POLICY "conversations_role_based_select" ON conversations IS
  'Manager/Admin sees all workspace conversations. Agent sees only assigned to self or unassigned.';

-- ============================================================================
-- CREATE NEW ROLE-BASED UPDATE POLICY
-- Managers can update any conversation
-- Agents can only update conversations assigned to them or unassigned
-- ============================================================================

CREATE POLICY "conversations_role_based_update"
  ON conversations FOR UPDATE
  USING (
    is_workspace_member(workspace_id)
    AND (
      is_workspace_manager(workspace_id)
      OR assigned_to = auth.uid()
      OR assigned_to IS NULL
    )
  )
  WITH CHECK (
    is_workspace_member(workspace_id)
  );

COMMENT ON POLICY "conversations_role_based_update" ON conversations IS
  'Manager/Admin can update any conversation. Agent can update assigned or unassigned conversations.';

-- ============================================================================
-- CREATE DELETE POLICY (MANAGERS ONLY)
-- ============================================================================

CREATE POLICY "conversations_manager_only_delete"
  ON conversations FOR DELETE
  USING (
    is_workspace_member(workspace_id)
    AND is_workspace_manager(workspace_id)
  );

COMMENT ON POLICY "conversations_manager_only_delete" ON conversations IS
  'Only Manager/Admin can delete conversations.';

-- ============================================================================
-- NOTE: INSERT policy remains unchanged
-- conversations_workspace_isolation_insert allows any workspace member to create
-- ============================================================================
