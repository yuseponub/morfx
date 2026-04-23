import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquarePlus, RefreshCcw, CalendarCheck } from 'lucide-react'
import type { MetricTotals } from '@/lib/metricas-conversaciones/types'

interface MetricCardsProps {
  data: MetricTotals
  loading?: boolean
}

export function MetricCards({ data, loading }: MetricCardsProps) {
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
