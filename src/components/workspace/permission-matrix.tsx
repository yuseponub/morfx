'use client'

import React from 'react'
import { Check, X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  permissionCategories,
  categoryLabels,
  permissionLabels,
  hasPermission,
  type Permission,
} from '@/lib/permissions'
import type { WorkspaceRole } from '@/lib/types/database'
import { cn } from '@/lib/utils'

const roles: WorkspaceRole[] = ['owner', 'admin', 'agent']

const roleLabels: Record<WorkspaceRole, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  agent: 'Agente',
}

interface PermissionMatrixProps {
  className?: string
}

export function PermissionMatrix({ className }: PermissionMatrixProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Permisos por rol</CardTitle>
        <CardDescription>
          Matriz de permisos disponibles para cada rol en el workspace
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 pr-4 font-medium">Permiso</th>
                {roles.map((role) => (
                  <th
                    key={role}
                    className="text-center px-4 py-3 font-medium min-w-[100px]"
                  >
                    {roleLabels[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(permissionCategories).map(([category, permissions]) => (
                <React.Fragment key={category}>
                  <tr className="bg-muted/50">
                    <td
                      colSpan={roles.length + 1}
                      className="py-2 px-2 font-medium text-muted-foreground"
                    >
                      {categoryLabels[category as keyof typeof categoryLabels]}
                    </td>
                  </tr>
                  {permissions.map((permission) => (
                    <tr key={permission} className="border-b border-border/50">
                      <td className="py-2 pr-4 pl-4">
                        {permissionLabels[permission]}
                      </td>
                      {roles.map((role) => {
                        const has = hasPermission(role, permission)
                        return (
                          <td key={`${permission}-${role}`} className="text-center px-4 py-2">
                            {has ? (
                              <Check className="h-4 w-4 mx-auto text-green-500" />
                            ) : (
                              <X className="h-4 w-4 mx-auto text-muted-foreground/30" />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

interface PermissionBadgeProps {
  permission: Permission
  role: WorkspaceRole
  customPermissions?: Record<string, boolean>
}

export function PermissionBadge({
  permission,
  role,
  customPermissions,
}: PermissionBadgeProps) {
  const has = hasPermission(role, permission, customPermissions)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        has
          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-muted text-muted-foreground'
      )}
    >
      {has ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
      {permissionLabels[permission]}
    </span>
  )
}
