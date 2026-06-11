'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, Building2, MessageSquare, Settings, Bot, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { useTaskBadge } from '@/hooks/use-task-badge'
import { useAutomationBadge } from '@/hooks/use-automation-badge'
import { navCategoriesV2, CAT_SLUG, filterNavItem } from './nav-items'
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
    href: '/automatizaciones',
    label: 'Automatizaciones',
    icon: Zap,
  },
  {
    href: '/agentes',
    label: 'Agentes',
    icon: Bot,
  },
  {
    href: '/settings',
    label: 'Configuracion',
    icon: Settings,
  },
]

/**
 * MobileNav — Sheet de navegación móvil.
 *
 * Prop `v3` (flag `ui_editorial_v3`, Standalone ui-redesign-editorial-shell, D-05):
 * ADITIVA, default `false`. Cuando `v3=false` (path no-v3) el componente renderiza
 * BYTE-IDÉNTICO a hoy (Regla 6 — early-return del branch v3 ANTES del return legacy).
 * El `<MobileNav />` del header de marketing (`header.tsx`) NO pasa `v3` → queda
 * byte-frozen. El `<MobileNav v3 currentWorkspace={...} />` del dashboard
 * ((dashboard)/layout.tsx, D-05b) renderiza el reskin editorial.
 *
 * Prop `currentWorkspace` (quick 260611-w3c, gap C-6): ADITIVA, default `null`.
 * Solo la consume la rama v3 para derivar los items de `navCategoriesV2` aplicando
 * los MISMOS filtros que el sidebar (adminOnly / settingsKey / hidden_modules). El
 * header de marketing no pasa esta prop → `null` → nunca entra a la rama v3 (v3=false).
 *
 * NOTA Regla 6: la rama v3 se aísla en el sub-componente `MobileNavV3` para que los
 * hooks de badge (useTaskBadge / useAutomationBadge) solo corran en el path del
 * dashboard (que sí tiene los providers). El path de marketing (return legacy) queda
 * byte-frozen y NO ejecuta esos hooks.
 */
export function MobileNav(
  { v3 = false, currentWorkspace = null }:
  { v3?: boolean; currentWorkspace?: WorkspaceWithRole | null } = {},
) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // =========================================================================
  // Editorial v3 branch (D-05 + gap C-6). Se delega al sub-componente
  // MobileNavV3 para aislar los hooks de badge del path de marketing. El return
  // no-v3 abajo queda BYTE-FROZEN (Regla 6).
  // =========================================================================
  if (v3) {
    return <MobileNavV3 currentWorkspace={currentWorkspace} />
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="h-16 flex items-center px-6 border-b">
          <SheetTitle>
            <Image src="/logo-light.png" className="block dark:hidden h-8 w-auto" alt="morfx" width={85} height={32} />
            <Image src="/logo-dark.png" className="hidden dark:block h-8 w-auto" alt="morfx" width={135} height={32} />
          </SheetTitle>
        </SheetHeader>
        <nav className="p-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.href)
              const Icon = item.icon

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
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
                </li>
              )
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  )
}

/**
 * MobileNavV3 — rama editorial v3 del MobileNav (gap C-6).
 *
 * Deriva los items de `navCategoriesV2` (misma fuente que el sidebar v3),
 * agrupados por categoría con headers `.cat`, aplicando `filterNavItem` con los
 * mismos filtros admin/settingsKey/hidden_modules. Antes el mobile-nav v3
 * hardcodeaba 5 items; ahora lista los 14 del sidebar.
 *
 * Los badges (tasks/automations) usan los mismos hooks que el sidebar. Estos
 * hooks viven aquí (no en `MobileNav`) para que NO corran en el path de
 * marketing (Regla 6 — header.tsx monta `<MobileNav />` sin providers).
 *
 * El `subLink` de Automatizaciones (AI Builder) NO se renderiza en móvil
 * (se omite por simplicidad; el módulo `/automatizaciones` sí queda accesible).
 */
function MobileNavV3({ currentWorkspace }: { currentWorkspace: WorkspaceWithRole | null }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { badgeCount: taskBadgeCount } = useTaskBadge()
  const { failureCount: automationFailureCount } = useAutomationBadge()

  const isManager = currentWorkspace?.role === 'owner' || currentWorkspace?.role === 'admin'
  const settings = currentWorkspace?.settings as Record<string, unknown> | null | undefined
  const hiddenModules = settings?.hidden_modules as string[] | undefined

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Abrir menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="theme-editorial-v3 sb w-64 p-0">
        <SheetHeader className="brand">
          <SheetTitle className="wm" asChild>
            <div>
              morf<b>·</b>x
            </div>
          </SheetTitle>
        </SheetHeader>
        <nav className="sb-nav">
          {navCategoriesV2.map(category => {
            const visibleItems = category.items.filter(item =>
              filterNavItem(item, { isManager, hiddenModules, settings }),
            )
            if (visibleItems.length === 0) return null
            return (
              <div key={category.label} className={cn('sb-sec', CAT_SLUG[category.label])}>
                <div className="cat">{category.label}</div>
                <ul>
                  {visibleItems.map(item => {
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                    const Icon = item.icon
                    let badgeCount = 0
                    if (item.badgeType === 'tasks') badgeCount = taskBadgeCount
                    else if (item.badgeType === 'automations') badgeCount = automationFailureCount
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={isActive ? 'active' : ''}
                        >
                          <Icon width={16} height={16} />
                          <span style={{ flex: 1 }}>{item.label}</span>
                          {badgeCount > 0 && (
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                color: 'var(--paper-0)',
                                background: 'var(--viv-red)',
                                padding: '1px 6px',
                                borderRadius: 999,
                                minWidth: 18,
                                textAlign: 'center',
                              }}
                            >
                              {badgeCount > 99 ? '99+' : badgeCount}
                            </span>
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
