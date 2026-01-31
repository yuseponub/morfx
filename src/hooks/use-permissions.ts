'use client'

import { useMemo } from 'react'
import type { WorkspaceRole } from '@/lib/types/database'
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

interface UsePermissionsOptions {
  role: WorkspaceRole
  customPermissions?: Record<string, boolean>
}

export function usePermissions({ role, customPermissions }: UsePermissionsOptions) {
  return useMemo(() => {
    return {
      /**
       * Check if user has a specific permission
       */
      can: (permission: Permission) =>
        hasPermission(role, permission, customPermissions),

      /**
       * Check if user has all specified permissions
       */
      canAll: (permissions: Permission[]) =>
        hasAllPermissions(role, permissions, customPermissions),

      /**
       * Check if user has any of the specified permissions
       */
      canAny: (permissions: Permission[]) =>
        hasAnyPermission(role, permissions, customPermissions),

      /**
       * Check if user can manage another role
       */
      canManage: (targetRole: WorkspaceRole) =>
        canManageRole(role, targetRole),

      /**
       * Check if user's role is at least the specified level
       */
      isAtLeast: (minimumRole: WorkspaceRole) =>
        isRoleAtLeast(role, minimumRole),

      /**
       * Get roles that this user can assign to others
       */
      assignableRoles: getAssignableRoles(role),

      /**
       * Get all permissions for the current role
       */
      permissions: getPermissionsForRole(role),

      /**
       * Current role
       */
      role,

      /**
       * Convenience checks for common scenarios
       */
      isOwner: role === 'owner',
      isAdmin: role === 'admin' || role === 'owner',
      isAgent: role === 'agent',
    }
  }, [role, customPermissions])
}

/**
 * Type for the return value of usePermissions
 */
export type PermissionsContext = ReturnType<typeof usePermissions>
