'use client'

import { createContext, useContext, useMemo, useEffect } from 'react'
import type { WorkspaceWithRole } from '@/lib/types/database'
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  canManageRole,
  isRoleAtLeast,
  getAssignableRoles,
  getPermissionsForRole,
  type Permission,
} from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/types/database'

interface PermissionsContext {
  can: (permission: Permission) => boolean
  canAll: (permissions: Permission[]) => boolean
  canAny: (permissions: Permission[]) => boolean
  canManage: (targetRole: WorkspaceRole) => boolean
  isAtLeast: (minimumRole: WorkspaceRole) => boolean
  assignableRoles: WorkspaceRole[]
  permissions: Permission[]
  role: WorkspaceRole
  isOwner: boolean
  isAdmin: boolean
  isAgent: boolean
}

interface WorkspaceContextValue {
  workspace: WorkspaceWithRole | null
  workspaces: WorkspaceWithRole[]
  permissions: PermissionsContext | null
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  workspace: null,
  workspaces: [],
  permissions: null,
})

interface WorkspaceProviderProps {
  children: React.ReactNode
  workspace: WorkspaceWithRole | null
  workspaces: WorkspaceWithRole[]
}

export function WorkspaceProvider({
  children,
  workspace,
  workspaces,
}: WorkspaceProviderProps) {
  // Auto-set cookie if workspace exists but cookie doesn't
  // This fixes the bug where UI shows workspace but queries fail
  useEffect(() => {
    if (workspace) {
      const existingCookie = document.cookie
        .split('; ')
        .find(row => row.startsWith('morfx_workspace='))

      if (!existingCookie) {
        document.cookie = `morfx_workspace=${workspace.id}; path=/; max-age=31536000`
        // Refresh to apply the cookie to server queries
        window.location.reload()
      }
    }
  }, [workspace])

  const value = useMemo(() => {
    const role = workspace?.role ?? 'agent'

    const permissions: PermissionsContext | null = workspace ? {
      can: (permission: Permission) => hasPermission(role, permission),
      canAll: (perms: Permission[]) => hasAllPermissions(role, perms),
      canAny: (perms: Permission[]) => hasAnyPermission(role, perms),
      canManage: (targetRole: WorkspaceRole) => canManageRole(role, targetRole),
      isAtLeast: (minimumRole: WorkspaceRole) => isRoleAtLeast(role, minimumRole),
      assignableRoles: getAssignableRoles(role),
      permissions: getPermissionsForRole(role),
      role,
      isOwner: role === 'owner',
      isAdmin: role === 'admin' || role === 'owner',
      isAgent: role === 'agent',
    } : null

    return {
      workspace,
      workspaces,
      permissions,
    }
  }, [workspace, workspaces])

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}

export function useCurrentWorkspace() {
  const { workspace } = useWorkspace()
  if (!workspace) {
    throw new Error('No workspace selected')
  }
  return workspace
}

export function useWorkspacePermissions() {
  const { permissions } = useWorkspace()
  if (!permissions) {
    throw new Error('No workspace selected')
  }
  return permissions
}
