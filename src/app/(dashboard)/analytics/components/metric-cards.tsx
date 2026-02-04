import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ShoppingCart, DollarSign, TrendingUp, Receipt } from 'lucide-react'
import type { OrderMetrics } from '@/lib/analytics/types'

interface MetricCardsProps {
  metrics: OrderMetrics
  loading?: boolean
}

export function MetricCards({ metrics, loading }: MetricCardsProps) {
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
