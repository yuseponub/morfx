'use client'

/**
 * CRM hub tabs — editorial v2 only (D-RETRO-05 piloto).
 *
 * Client Component because active state needs `usePathname()`. The parent
 * `src/app/(dashboard)/crm/layout.tsx` is a Server Component that resolves
 * the flag + renders `<CrmTabs/>` only when v2=true.
 *
 * Tabs (mock crm.html líneas 120-125):
 * - Contactos → /crm/contactos (existing route)
 * - Pedidos · kanban → /crm/pedidos (existing route — Plan 03 retrofit
 *   will rewrite this module; for now the tab just navigates there)
 * - Pipelines → href='#' + toast "Próximamente" (route does not exist)
 * - Configuración → /crm/configuracion (existing route in codebase —
 *   DEVIATION Rule 3: plan assumed this route was missing; it IS present
 *   under `src/app/(dashboard)/crm/configuracion/{pipelines,estados-pedido,
 *   campos-custom}/page.tsx`, so we link to it rather than stub)
 *
 * Uses `.tabs` + `.tabs a.on` classes ported to globals.css in Task 1
 * (mock lines 37-39). Raw HTML semantic per R-RETRO-01.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'

type Tab = {
  href: string
  label: string
  /**
   * When true, the tab renders as an inert <a href="#"> with an onClick
   * toast "Próximamente". Used for routes that do not yet exist in the
   * codebase (avoids 404 during QA).
   */
  comingSoon?: boolean
  /**
   * When true (and not comingSoon), active state matches the exact href
   * OR any sub-path (so `/crm/contactos/abc` still lights up the
   * Contactos tab). Default: true.
   */
  matchPrefix?: boolean
}

const TABS: Tab[] = [
  { href: '/crm/contactos', label: 'Contactos' },
  { href: '/crm/pedidos', label: 'Pedidos · kanban' },
  { href: '#', label: 'Pipelines', comingSoon: true },
  { href: '/crm/configuracion', label: 'Configuración' },
]

export function CrmTabs() {
  const pathname = usePathname()

  return (
    <nav className="tabs" aria-label="Secciones del módulo CRM">
      {TABS.map(tab => {
        if (tab.comingSoon) {
          return (
            <a
              key={tab.label}
              href="#"
              aria-disabled="true"
              onClick={(e) => {
                e.preventDefault()
                toast.info('Próximamente', {
                  description: `${tab.label} se activará en un plan futuro del retrofit.`,
                })
              }}
            >
              {tab.label}
            </a>
          )
        }
        const isActive =
          pathname === tab.href ||
          pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={isActive ? 'on' : ''}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
