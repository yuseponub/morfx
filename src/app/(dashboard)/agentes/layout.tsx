'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

const tabs = [
  { href: '/agentes', label: 'Dashboard', icon: BarChart3, exact: true },
  { href: '/agentes/config', label: 'Configuracion', icon: Settings, exact: false },
]

export default function AgentesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const v2 = useDashboardV2()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header — editorial (v2) */}
      {v2 && (
        <div className="border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
          <div className="container px-7 pt-[18px] pb-[14px]">
            <span
              className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Módulo · Automatización
            </span>
            <h1
              className="mt-[2px] text-[30px] font-bold leading-[1.1] tracking-[-0.015em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Agentes
              <em
                className="not-italic ml-2 text-[16px] font-normal text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                · Métricas y configuración
              </em>
            </h1>

            {/* Tabs underlined per D-DASH-16 */}
            <div className="flex gap-5 mt-4" role="tablist">
              {tabs.map((tab) => {
                const isActive = tab.exact
                  ? pathname === tab.href
                  : pathname.startsWith(tab.href)
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    role="tab"
                    aria-selected={isActive}
                    className={cn(
                      'pb-[10px] text-[13px] transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ink-1)]',
                      isActive
                        ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                        : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
                    )}
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    {tab.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header — shadcn slate (flag OFF, byte-identical preserve) */}
      {!v2 && (
        <div className="border-b bg-card">
          <div className="container px-6">
            <div className="flex items-center gap-3 pt-6 pb-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Agentes</h1>
                <p className="text-sm text-muted-foreground">
                  Metricas de rendimiento y configuracion del agente
                </p>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const isActive = tab.exact
                  ? pathname === tab.href
                  : pathname.startsWith(tab.href)
                const Icon = tab.icon

                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors',
                      isActive
                        ? 'border-primary text-primary bg-background'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {tab.label}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container py-6 px-6">
          {children}
        </div>
      </div>
    </div>
  )
}
