import type { WorkspaceRole } from '@/lib/types/database'

// Permission types for the system
export type Permission =
  | 'workspace.manage'
  | 'workspace.delete'
  | 'members.invite'
  | 'members.remove'
  | 'members.change_role'
  | 'contacts.view'
  | 'contacts.create'
  | 'contacts.edit'
  | 'contacts.delete'
  | 'orders.view'
  | 'orders.create'
  | 'orders.edit'
  | 'orders.delete'
  | 'whatsapp.view'
  | 'whatsapp.send'
  | 'settings.view'
  | 'settings.edit'

// Role hierarchy - higher index = more permissions
const roleHierarchy: WorkspaceRole[] = ['agent', 'admin', 'owner']

// Default permissions by role
const rolePermissions: Record<WorkspaceRole, Permission[]> = {
  owner: [
    'workspace.manage',
    'workspace.delete',
    'members.invite',
    'members.remove',
    'members.change_role',
    'contacts.view',
    'contacts.create',
    'contacts.edit',
    'contacts.delete',
    'orders.view',
    'orders.create',
    'orders.edit',
    'orders.delete',
    'whatsapp.view',
    'whatsapp.send',
    'settings.view',
    'settings.edit',
  ],
  admin: [
    'workspace.manage',
    'members.invite',
    'members.remove',
    'contacts.view',
    'contacts.create',
    'contacts.edit',
    'contacts.delete',
    'orders.view',
    'orders.create',
    'orders.edit',
    'orders.delete',
    'whatsapp.view',
    'whatsapp.send',
    'settings.view',
    'settings.edit',
  ],
  agent: [
    'contacts.view',
    'contacts.create',
    'contacts.edit',
    'orders.view',
    'orders.create',
    'orders.edit',
    'whatsapp.view',
    'whatsapp.send',
    'settings.view',
  ],
}

// Permission labels for UI
export const permissionLabels: Record<Permission, string> = {
  'workspace.manage': 'Gestionar workspace',
  'workspace.delete': 'Eliminar workspace',
  'members.invite': 'Invitar miembros',
  'members.remove': 'Eliminar miembros',
  'members.change_role': 'Cambiar roles',
  'contacts.view': 'Ver contactos',
  'contacts.create': 'Crear contactos',
  'contacts.edit': 'Editar contactos',
  'contacts.delete': 'Eliminar contactos',
  'orders.view': 'Ver pedidos',
  'orders.create': 'Crear pedidos',
  'orders.edit': 'Editar pedidos',
  'orders.delete': 'Eliminar pedidos',
  'whatsapp.view': 'Ver WhatsApp',
  'whatsapp.send': 'Enviar mensajes',
  'settings.view': 'Ver configuracion',
  'settings.edit': 'Editar configuracion',
}

// Permission categories for UI grouping
export const permissionCategories = {
  workspace: ['workspace.manage', 'workspace.delete'] as Permission[],
  members: ['members.invite', 'members.remove', 'members.change_role'] as Permission[],
  contacts: ['contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete'] as Permission[],
  orders: ['orders.view', 'orders.create', 'orders.edit', 'orders.delete'] as Permission[],
  whatsapp: ['whatsapp.view', 'whatsapp.send'] as Permission[],
  settings: ['settings.view', 'settings.edit'] as Permission[],
}

export const categoryLabels: Record<keyof typeof permissionCategories, string> = {
  workspace: 'Workspace',
  members: 'Miembros',
  contacts: 'Contactos',
  orders: 'Pedidos',
  whatsapp: 'WhatsApp',
  settings: 'Configuracion',
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  role: WorkspaceRole,
  permission: Permission,
  customPermissions?: Record<string, boolean>
): boolean {
  // Check custom permissions first
  if (customPermissions && permission in customPermissions) {
    return customPermissions[permission]
  }

  // Fall back to role-based permissions
  return rolePermissions[role]?.includes(permission) ?? false
}

/**
 * Check if a role can perform an action on another role
 * (e.g., admin can manage agents but not owners)
 */
export function canManageRole(managerRole: WorkspaceRole, targetRole: WorkspaceRole): boolean {
  const managerIndex = roleHierarchy.indexOf(managerRole)
  const targetIndex = roleHierarchy.indexOf(targetRole)
  return managerIndex > targetIndex
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: WorkspaceRole): Permission[] {
  return rolePermissions[role] ?? []
}

/**
 * Check if role is at least the specified level
 */
export function isRoleAtLeast(role: WorkspaceRole, minimumRole: WorkspaceRole): boolean {
  const roleIndex = roleHierarchy.indexOf(role)
  const minimumIndex = roleHierarchy.indexOf(minimumRole)
  return roleIndex >= minimumIndex
}

/**
 * Get roles that a user with the given role can assign
 */
export function getAssignableRoles(role: WorkspaceRole): WorkspaceRole[] {
  if (role === 'owner') return ['admin', 'agent']
  if (role === 'admin') return ['agent']
  return []
}

/**
 * Check multiple permissions at once
 */
export function hasAllPermissions(
  role: WorkspaceRole,
  permissions: Permission[],
  customPermissions?: Record<string, boolean>
): boolean {
  return permissions.every((p) => hasPermission(role, p, customPermissions))
}

/**
 * Check if user has any of the specified permissions
 */
export function hasAnyPermission(
  role: WorkspaceRole,
  permissions: Permission[],
  customPermissions?: Record<string, boolean>
): boolean {
  return permissions.some((p) => hasPermission(role, p, customPermissions))
}
