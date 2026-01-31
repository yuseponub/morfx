'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, MessageSquare, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher'
import type { WorkspaceWithRole } from '@/lib/types/database'

const navItems = [
  {
    href: '/crm',
    label: 'CRM',
    icon: Building2,
  },
  {
    href: '/whatsapp',
    label: 'WhatsApp',
    icon: MessageSquare,
  },
  {
    href: '/settings/workspace/members',
    label: 'Equipo',
    icon: Users,
  },
  {
    href: '/settings',
    label: 'Configuracion',
    icon: Settings,
  },
]

interface SidebarProps {
  workspaces?: WorkspaceWithRole[]
  currentWorkspace?: WorkspaceWithRole | null
}

export function Sidebar({ workspaces = [], currentWorkspace }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-card">
      {/* Logo/Brand */}
      <div className="h-16 flex items-center px-6 border-b">
        <Link href="/crm" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-lg">M</span>
          </div>
          <span className="font-semibold text-xl tracking-tight">morfx</span>
        </Link>
      </div>

      {/* Workspace Switcher */}
      <div className="p-4 border-b">
        <WorkspaceSwitcher
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <TooltipProvider>
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <li key={item.href}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        )}
                      >
                        <Icon className="h-5 w-5" />
                        <span>{item.label}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{item.label}</p>
                    </TooltipContent>
                  </Tooltip>
                </li>
              )
            })}
          </ul>
        </TooltipProvider>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground text-center">
          morfx v0.1.0
        </p>
      </div>
    </aside>
  )
}
