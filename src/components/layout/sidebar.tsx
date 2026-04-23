'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, MessageSquare, MessageSquareText, Settings, Users, LogOut, ListTodo, BarChart3, Bot, Zap, Sparkles, Terminal, CalendarCheck, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { WorkspaceSwitcher } from '@/components/workspace/workspace-switcher'
import { GlobalSearch } from '@/components/search/global-search'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { logout } from '@/app/actions/auth'
import { useTaskBadge } from '@/hooks/use-task-badge'
import { useAutomationBadge } from '@/hooks/use-automation-badge'
import type { WorkspaceWithRole } from '@/lib/types/database'
import type { User } from '@supabase/supabase-js'

type NavItem = {
  href: string
  label: string
  icon: typeof Building2
  badgeType?: 'tasks' | 'automations'
  adminOnly?: boolean
  /**
   * Optional gate based on workspaces.settings JSONB.
   * Format: '<namespace>.<key>', e.g. 'conversation_metrics.enabled'.
   * The item is hidden unless settings[namespace][key] is truthy.
   * Unlike `adminOnly`, this gate applies to ALL users of the workspace.
   */
  settingsKey?: string
  subLink?: {
    href: string
    label: string
    icon: typeof Building2
  }
}

const navItems: NavItem[] = [
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
    href: '/sms',
    label: 'SMS',
    icon: MessageSquareText,
  },
  {
    href: '/tareas',
    label: 'Tareas',
    icon: ListTodo,
    badgeType: 'tasks',
  },
  {
    href: '/comandos',
    label: 'Comandos',
    icon: Terminal,
    adminOnly: true,
  },
  {
    href: '/automatizaciones',
    label: 'Automatizaciones',
    icon: Zap,
    badgeType: 'automations',
    subLink: {
      href: '/automatizaciones/builder',
      label: 'AI Builder',
      icon: Sparkles,
    },
  },
  {
    href: '/analytics',
    label: 'Analytics',
    icon: BarChart3,
    adminOnly: true,
  },
  {
    // NOTE: NO adminOnly — explicit exception vs analytics.
    // ALL workspace users can access /metricas when the flag is enabled.
    href: '/metricas',
    label: 'Metricas',
    icon: TrendingUp,
    settingsKey: 'conversation_metrics.enabled',
  },
  {
    href: '/sandbox',
    label: 'Sandbox',
    icon: Bot,
  },
  {
    href: '/agentes',
    label: 'Agentes',
    icon: Bot,
  },
  {
    href: '/confirmaciones',
    label: 'Confirmaciones',
    icon: CalendarCheck,
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
  user?: User | null
  /**
   * UI Dashboard v2 flag (Standalone ui-redesign-dashboard, D-DASH-01/D-DASH-06).
   * Resolved server-side via `getIsDashboardV2Enabled(workspaceId)` in
   * `src/lib/auth/dashboard-v2.ts`. When false, the sidebar renders
   * byte-identical to today (Regla 6 zero regression). When true, the
   * editorial re-skin applies: paper-1 bg, ink-1 border, smallcaps
   * section labels, rubric-2 active state, serif wordmark `morf·x`.
   * The parent `(dashboard)/layout.tsx` adds `.theme-editorial` to the
   * outer wrapper so the `var(--paper-*)` / `var(--ink-*)` / etc.
   * tokens resolve correctly when v2=true.
   */
  v2?: boolean
}

export function Sidebar({ workspaces = [], currentWorkspace, user, v2 = false }: SidebarProps) {
  const pathname = usePathname()
  const { badgeCount: taskBadgeCount } = useTaskBadge()
  const { failureCount: automationFailureCount } = useAutomationBadge()

  // Filter nav items based on user role and workspace settings
  const userRole = currentWorkspace?.role
  const isManager = userRole === 'owner' || userRole === 'admin'
  const settings = currentWorkspace?.settings as Record<string, unknown> | null | undefined
  const hiddenModules = settings?.hidden_modules as string[] | undefined
  const filteredNavItems = navItems.filter(item => {
    if (item.adminOnly && !isManager) return false
    if (hiddenModules?.includes(item.href)) return false
    if (item.settingsKey) {
      const [ns, key] = item.settingsKey.split('.')
      const nsObj = settings?.[ns] as Record<string, unknown> | undefined
      if (!nsObj?.[key]) return false
    }
    return true
  })

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col w-64 border-r',
        v2
          ? 'bg-[var(--paper-1)] border-[var(--ink-1)]'
          : 'bg-card',
      )}
    >
      <TooltipProvider>
      {/* Logo/Brand */}
      <div
        className={cn(
          'h-16 flex items-center px-6 border-b',
          v2 && 'border-[var(--ink-1)]',
        )}
      >
        <Link href="/crm" aria-label="morfx — inicio">
          {v2 ? (
            <span className="font-serif text-[22px] tracking-[0.02em] text-[var(--ink-1)]">
              morf<span className="text-[var(--rubric-2)]">·</span>x
            </span>
          ) : (
            <>
              <Image src="/logo-light.png" className="block dark:hidden h-8 w-auto" alt="morfx" width={85} height={32} />
              <Image src="/logo-dark.png" className="hidden dark:block h-8 w-auto" alt="morfx" width={135} height={32} />
            </>
          )}
        </Link>
      </div>

      {/* Workspace Switcher */}
      <div
        className={cn(
          'p-4 border-b',
          v2 && 'border-[var(--ink-1)]',
        )}
      >
        <WorkspaceSwitcher
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
        />
      </div>

      {/* Global Search */}
      <div className="px-4 pb-4">
        <GlobalSearch />
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-1">
            {filteredNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon
              // Determine badge count based on type
              let itemBadgeCount = 0
              if (item.badgeType === 'tasks') itemBadgeCount = taskBadgeCount
              else if (item.badgeType === 'automations') itemBadgeCount = automationFailureCount
              const showBadge = itemBadgeCount > 0

              return (
                <li key={item.href}>
                  <div className="flex items-center gap-1">
                    <Link
                      href={item.href}
                      className={cn(
                        'flex flex-1 items-center gap-3 px-3 py-2 transition-colors',
                        v2
                          ? cn(
                              'rounded-[3px] text-[13px] tracking-[0.02em]',
                              isActive
                                ? 'bg-[var(--paper-3)] text-[var(--ink-1)] border-l-2 border-[var(--rubric-2)] -ml-[2px] pl-[14px] font-serif'
                                : 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]',
                            )
                          : cn(
                              'rounded-md text-sm font-medium',
                              isActive
                                ? 'bg-accent text-accent-foreground'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            ),
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      <span className="flex-1">{item.label}</span>
                      {showBadge && (
                        <span
                          className={cn(
                            'flex h-5 min-w-5 items-center justify-center rounded-full text-[10px] font-medium px-1.5',
                            v2
                              ? 'bg-[var(--rubric-2)] text-[var(--paper-0)] font-mono'
                              : 'bg-destructive text-destructive-foreground',
                          )}
                        >
                          {itemBadgeCount > 99 ? '99+' : itemBadgeCount}
                        </span>
                      )}
                    </Link>
                    {item.subLink && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.subLink.href}
                            className={cn(
                              'flex h-8 w-8 items-center justify-center rounded-md transition-colors shrink-0',
                              pathname.startsWith(item.subLink.href)
                                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            <item.subLink.icon className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{item.subLink.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
      </nav>

      {/* Footer - User profile */}
      <div
        className={cn(
          'p-4 border-t',
          v2 && 'border-[var(--ink-1)]',
        )}
      >
        {user && (
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarFallback
                className={cn(
                  v2
                    ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
                    : 'bg-primary text-primary-foreground',
                )}
              >
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p
                className={cn(
                  'truncate',
                  v2
                    ? 'font-serif text-[13px] text-[var(--ink-1)]'
                    : 'text-sm font-medium',
                )}
              >
                {user.email?.split('@')[0]}
              </p>
              <p
                className={cn(
                  'truncate',
                  v2
                    ? 'text-[11px] text-[var(--ink-3)] font-mono'
                    : 'text-xs text-muted-foreground',
                )}
              >
                {user.email}
              </p>
            </div>
            <form action={logout}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="submit"
                    className={cn(
                      'p-2 rounded-md transition-colors',
                      v2
                        ? 'text-[var(--ink-2)] hover:bg-[var(--paper-2)] hover:text-[var(--ink-1)]'
                        : 'hover:bg-accent text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>Cerrar sesion</p>
                </TooltipContent>
              </Tooltip>
            </form>
          </div>
        )}
      </div>
      </TooltipProvider>
    </aside>
  )
}
