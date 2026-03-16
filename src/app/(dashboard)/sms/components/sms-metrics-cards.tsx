'use client'

import { Card, CardContent } from '@/components/ui/card'
import { MessageSquare, CalendarDays, CalendarRange, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SMSMetrics } from '@/app/actions/sms'

interface SmsMetricsCardsProps {
  metrics: SMSMetrics
}

export function SmsMetricsCards({ metrics }: SmsMetricsCardsProps) {
  const cards = [
    {
      label: 'SMS Enviados Hoy',
      value: metrics.sentToday.toLocaleString('es-CO'),
      icon: MessageSquare,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      label: 'SMS Esta Semana',
      value: metrics.sentThisWeek.toLocaleString('es-CO'),
      icon: CalendarDays,
      color: 'text-violet-600 dark:text-violet-400',
      bg: 'bg-violet-50 dark:bg-violet-950/30',
    },
    {
      label: 'SMS Este Mes',
      value: metrics.sentThisMonth.toLocaleString('es-CO'),
      icon: CalendarRange,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-950/30',
    },
    {
      label: 'Tasa de Entrega',
      value: `${metrics.deliveryRate}%`,
      icon: TrendingUp,
      color: metrics.deliveryRate >= 90
        ? 'text-green-600 dark:text-green-400'
        : metrics.deliveryRate >= 70
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400',
      bg: metrics.deliveryRate >= 90
        ? 'bg-green-50 dark:bg-green-950/30'
        : metrics.deliveryRate >= 70
          ? 'bg-yellow-50 dark:bg-yellow-950/30'
          : 'bg-red-50 dark:bg-red-950/30',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className={cn('rounded-full p-2', card.bg)}>
                <card.icon className={cn('h-4 w-4', card.color)} />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{card.label}</p>
                <p className={cn('text-xl font-bold', card.color)}>{card.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
