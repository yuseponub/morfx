import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, DollarSign, TrendingUp, Receipt } from 'lucide-react'
import type { OrderMetrics } from '@/lib/analytics/types'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'

interface MetricCardsProps {
  metrics: OrderMetrics
  loading?: boolean
}

export function MetricCards({ metrics, loading }: MetricCardsProps) {
  const v2 = useDashboardV2()

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(value)

  const cards = [
    {
      title: 'Total Pedidos',
      value: metrics.totalOrders.toLocaleString('es-CO'),
      icon: ShoppingCart
    },
    {
      title: 'Valor Total',
      value: formatCurrency(metrics.totalValue),
      icon: DollarSign
    },
    {
      title: 'Tasa de Conversion',
      value: `${metrics.conversionRate}%`,
      icon: TrendingUp
    },
    {
      title: 'Ticket Promedio',
      value: formatCurrency(metrics.avgTicket),
      icon: Receipt
    }
  ]

  if (loading) {
    if (v2) {
      return (
        <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                'p-[16px_18px] border-b border-r border-[var(--border)]',
                'last:border-r-0 md:[&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r lg:last:border-r-0',
                'md:[&:nth-child(3)]:border-b-0 md:[&:nth-child(4)]:border-b-0 lg:border-b-0'
              )}
            >
              <div className="h-[12px] w-24 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
              <div className="mt-2 h-[28px] w-32 bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-4 w-4 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (v2) {
    return (
      <div className="grid grid-cols-1 border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)] md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.title}
              className={cn(
                'p-[16px_18px] border-b border-r border-[var(--border)]',
                'last:border-r-0 md:[&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r lg:last:border-r-0',
                'md:[&:nth-child(3)]:border-b-0 md:[&:nth-child(4)]:border-b-0 lg:border-b-0'
              )}
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
              <div
                className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-mono)' }}
                aria-hidden
              >
                <Icon className="h-[11px] w-[11px]" />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {cards.map(card => {
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
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
