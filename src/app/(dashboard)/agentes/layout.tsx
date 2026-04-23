'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, BarChart3, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
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

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container py-6 px-6">
          {children}
        </div>
      </div>
    </div>
  )
}
