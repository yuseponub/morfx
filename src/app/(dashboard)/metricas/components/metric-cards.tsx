import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquarePlus, RefreshCcw, CalendarCheck } from 'lucide-react'
import type { MetricTotals } from '@/lib/metricas-conversaciones/types'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface MetricCardsProps {
  data: MetricTotals
  loading?: boolean
}

export function MetricCards({ data, loading }: MetricCardsProps) {
  const v2 = useDashboardV2()

  const cards = [
    {
      title: 'Nuevas',
      value: data.nuevas.toLocaleString('es-CO'),
      description: 'Primer mensaje del cliente',
      icon: MessageSquarePlus,
    },
    {
      title: 'Reabiertas',
      value: data.reabiertas.toLocaleString('es-CO'),
      description: 'Volvieron tras el periodo de silencio',
      icon: RefreshCcw,
    },
    {
      title: 'Agendadas',
      value: data.agendadas.toLocaleString('es-CO'),
      description: 'Tag de valoracion aplicado',
      icon: CalendarCheck,
    },
  ]

  if (loading) {
    if (v2) {
      return (
        <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="border-b border-r border-[var(--border)] p-[16px_18px] last:border-r-0 md:border-b-0 md:[&:last-child]:border-r-0"
            >
              <div className="h-[12px] w-24 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
              <div className="mt-2 h-[28px] w-20 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
              <div className="mt-2 h-[10px] w-32 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-20 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (v2) {
    return (
      <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.title}
              className="p-[16px_18px] border-b border-r border-[var(--border)] last:border-r-0 md:border-b-0 md:[&:last-child]:border-r-0"
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {card.title}
              </div>
              <div
                className="mt-2 text-[28px] font-bold leading-none tracking-[-0.01em] text-[var(--ink-1)]"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {card.value}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Icon className="h-[11px] w-[11px] text-[var(--ink-3)]" aria-hidden />
                <p
                  className="text-[11px] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {card.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{card.description}</p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
