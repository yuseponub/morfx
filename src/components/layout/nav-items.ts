import {
  Building2,
  MessageSquare,
  MessageSquareText,
  ListTodo,
  CalendarCheck,
  Zap,
  Bot,
  Terminal,
  BarChart3,
  TrendingUp,
  FlaskConical,
  Users,
  Settings,
} from 'lucide-react'

/**
 * Shared nav data for the dashboard shell (sidebar + mobile-nav v3).
 *
 * Extraído VERBATIM de `sidebar.tsx` (refactor puro — quick 260611-w3c, Task 1)
 * para que el mobile-nav v3 derive sus items de la MISMA fuente que el sidebar
 * (gap C-6: el mobile-nav v3 hardcodeaba 5 items; ahora deriva los 14 del
 * sidebar respetando los mismos filtros admin/settingsKey/hidden_modules).
 *
 * Sin 'use client': es solo data + tipos + un helper puro. Lo importan tanto
 * componentes client (sidebar.tsx, mobile-nav.tsx) como — potencialmente —
 * server.
 */

export type NavItem = {
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

/**
 * Sidebar v2 categories — Propuesta B (D-RETRO-04).
 *
 * 14 items across 4 categorías. Shares the same filtering semantics
 * as the legacy flat `navItems[]` in sidebar.tsx (adminOnly, settingsKey,
 * hidden_modules). Items link to routes that already exist in the codebase
 * (verified 2026-04-23 against `src/app/(dashboard)/*`).
 *
 * Used by the v2 and v3 branches of the sidebar (and the v3 mobile-nav). The
 * legacy flat `navItems[]` in sidebar.tsx keeps the flag-off render
 * byte-identical (Regla 6 fail-closed).
 */
export type SidebarCategoryV2 = {
  label: string
  items: NavItem[]
}

/**
 * Vivificación v3 (2026-06): slug de sección para colorear bullets e iconos
 * del sidebar v3 vía `.sb-sec.{op,auto,ana,adm}` → `--sec-c` (globals.css,
 * bloque VIVIFICACIÓN). Solo lo consume la rama v3 — v2/legacy intactas.
 */
export const CAT_SLUG: Record<string, string> = {
  'Operación': 'op', 'Automatización': 'auto', 'Análisis': 'ana', 'Admin': 'adm',
}

export const navCategoriesV2: SidebarCategoryV2[] = [
  {
    label: 'Operación',
    items: [
      { href: '/crm', label: 'CRM', icon: Building2 },
      { href: '/whatsapp', label: 'WhatsApp', icon: MessageSquare },
      { href: '/tareas', label: 'Tareas', icon: ListTodo, badgeType: 'tasks' },
      { href: '/confirmaciones', label: 'Confirmaciones', icon: CalendarCheck },
      { href: '/sms', label: 'SMS', icon: MessageSquareText },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { href: '/automatizaciones', label: 'Automatizaciones', icon: Zap, badgeType: 'automations' },
      { href: '/agentes', label: 'Agentes', icon: Bot },
      { href: '/comandos', label: 'Comandos', icon: Terminal, adminOnly: true },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { href: '/analytics', label: 'Analytics', icon: BarChart3, adminOnly: true },
      { href: '/metricas', label: 'Metricas', icon: TrendingUp, settingsKey: 'conversation_metrics.enabled' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/sandbox', label: 'Sandbox', icon: FlaskConical },
      { href: '/settings/workspace/members', label: 'Equipo', icon: Users },
      { href: '/configuracion', label: 'Configuración', icon: Settings },
    ],
  },
]

/**
 * Filtro compartido de visibilidad de un NavItem. Encapsula la lógica que
 * vivía duplicada inline en sidebar.tsx (ramas v3, v2 y legacy) — comportamiento
 * idéntico. Lo consumen el sidebar (las 3 ramas) y el mobile-nav v3.
 *
 * - `adminOnly`: oculto si el usuario no es manager (owner/admin).
 * - `hidden_modules`: oculto si el href está en la lista de módulos ocultos.
 * - `settingsKey`: oculto salvo que `settings[ns][key]` sea truthy.
 */
export function filterNavItem(
  item: NavItem,
  ctx: { isManager: boolean; hiddenModules?: string[]; settings?: Record<string, unknown> | null },
): boolean {
  if (item.adminOnly && !ctx.isManager) return false
  if (ctx.hiddenModules?.includes(item.href)) return false
  if (item.settingsKey) {
    const [ns, key] = item.settingsKey.split('.')
    const nsObj = ctx.settings?.[ns] as Record<string, unknown> | undefined
    if (!nsObj?.[key]) return false
  }
  return true
}
