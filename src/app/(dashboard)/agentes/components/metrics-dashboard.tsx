'use client'

import { useState, useTransition } from 'react'
import {
  MessageSquare,
  ShoppingCart,
  TrendingUp,
  UserX,
  UserCheck,
  Clock,
  Coins,
  DollarSign,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fetchAgentMetrics } from '@/app/actions/agent-metrics'
import type { AgentMetrics, MetricsPeriod } from '@/lib/agents/production/metrics'

// ============================================================================
// TYPES
// ============================================================================

interface MetricsDashboardProps {
  initialMetrics: AgentMetrics
}

interface MetricCardDef {
  title: string
  getValue: (m: AgentMetrics) => string
  icon: typeof MessageSquare
  description?: string
}

// ============================================================================
// PERIOD SELECTOR
// ============================================================================

const periods: { value: MetricsPeriod; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
]

// ============================================================================
// METRIC CARD DEFINITIONS
// ============================================================================

const conversationCards: MetricCardDef[] = [
  {
    title: 'Conversaciones',
    getValue: (m) => m.totalConversations.toLocaleString('es-CO'),
    icon: MessageSquare,
    description: 'Atendidas por el agente',
  },
  {
    title: 'Ordenes creadas',
    getValue: (m) => m.ordersCreated.toLocaleString('es-CO'),
    icon: ShoppingCart,
    description: 'Via agente automatico',
  },
  {
    title: 'Tasa de conversion',
    getValue: (m) => `${m.conversionRate}%`,
    icon: TrendingUp,
    description: 'Ordenes / conversaciones',
  },
]

const handoffCards: MetricCardDef[] = [
  {
    title: 'Handoffs',
    getValue: (m) => m.handoffsCount.toLocaleString('es-CO'),
    icon: UserX,
    description: 'Transferidas a humano',
  },
  {
    title: 'Sin humano',
    getValue: (m) => `${m.resolvedWithoutHumanPct}%`,
    icon: UserCheck,
    description: 'Resueltas automaticamente',
  },
  {
    title: 'Tiempo promedio',
    getValue: (m) => m.avgResponseTimeMs === 0 ? '--' : `${Math.round(m.avgResponseTimeMs)}ms`,
    icon: Clock,
    description: 'Respuesta del agente',
  },
]

const costCards: MetricCardDef[] = [
  {
    title: 'Tokens usados',
    getValue: (m) => {
      if (m.totalTokens >= 1_000_000) {
        return `${(m.totalTokens / 1_000_000).toFixed(1)}M`
      }
      if (m.totalTokens >= 1_000) {
        return `${(m.totalTokens / 1_000).toFixed(1)}K`
      }
      return m.totalTokens.toLocaleString('es-CO')
    },
    icon: Coins,
    description: 'Input + output',
  },
  {
    title: 'Costo / conversacion',
    getValue: (m) => `$${m.costPerConversation.toFixed(4)}`,
    icon: DollarSign,
    description: 'USD promedio',
  },
  {
    title: 'Costo total',
    getValue: (m) => `$${m.totalCost.toFixed(4)}`,
    icon: Receipt,
    description: 'USD en el periodo',
  },
]

// ============================================================================
// CARD GROUP COMPONENT
// ============================================================================

function MetricGroup({
  title,
  cards,
  metrics,
  loading,
}: {
  title: string
  cards: MetricCardDef[]
  metrics: AgentMetrics
  loading: boolean
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
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
                {loading ? (
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{card.getValue(metrics)}</div>
                    {card.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {card.description}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function MetricsDashboard({ initialMetrics }: MetricsDashboardProps) {
  const [period, setPeriod] = useState<MetricsPeriod>('today')
  const [metrics, setMetrics] = useState<AgentMetrics>(initialMetrics)
  const [isPending, startTransition] = useTransition()

  const handlePeriodChange = (newPeriod: MetricsPeriod) => {
    setPeriod(newPeriod)
    startTransition(async () => {
      const result = await fetchAgentMetrics(newPeriod)
      if ('success' in result && result.success) {
        setMetrics(result.data)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex justify-end">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {periods.map((p) => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => handlePeriodChange(p.value)}
              className={cn(
                'rounded-md',
                period === p.value && 'bg-background shadow-sm'
              )}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Metric groups */}
      <MetricGroup
        title="Conversaciones"
        cards={conversationCards}
        metrics={metrics}
        loading={isPending}
      />

      <MetricGroup
        title="Handoffs"
        cards={handoffCards}
        metrics={metrics}
        loading={isPending}
      />

      <MetricGroup
        title="Costos"
        cards={costCards}
        metrics={metrics}
        loading={isPending}
      />
    </div>
  )
}
