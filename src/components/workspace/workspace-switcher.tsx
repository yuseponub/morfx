'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronsUpDown, Plus, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { WorkspaceWithRole } from '@/lib/types/database'

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceWithRole[]
  currentWorkspace?: WorkspaceWithRole | null
}

const roleLabels: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  agent: 'Agente',
}

export function WorkspaceSwitcher({ workspaces, currentWorkspace }: WorkspaceSwitcherProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleSelect = (workspace: WorkspaceWithRole) => {
    setOpen(false)
    // Store selected workspace in cookie for server-side access
    document.cookie = `morfx_workspace=${workspace.id}; path=/; max-age=31536000`
    router.refresh()
  }

  if (workspaces.length === 0) {
    return (
      <Link href="/create-workspace">
        <Button variant="outline" className="w-full justify-start gap-2">
          <Plus className="h-4 w-4" />
          <span>Crear workspace</span>
        </Button>
      </Link>
    )
  }

  const displayWorkspace = currentWorkspace || workspaces[0]

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        >
          <div className="flex items-center gap-2 truncate">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
              <Building2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="truncate">{displayWorkspace.name}</span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[240px]" align="start">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => handleSelect(workspace)}
            className="cursor-pointer"
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="truncate">
                  <p className="truncate text-sm">{workspace.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {roleLabels[workspace.role] || workspace.role}
                  </p>
                </div>
              </div>
              {displayWorkspace.id === workspace.id && (
                <Check className="h-4 w-4 shrink-0" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/create-workspace" className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            <span>Crear workspace</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
