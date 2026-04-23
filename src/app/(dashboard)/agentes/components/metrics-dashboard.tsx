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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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
  v2,
}: {
  title: string
  cards: MetricCardDef[]
  metrics: AgentMetrics
  loading: boolean
  v2: boolean
}) {
  return (
    <div className="space-y-3">
      {v2 ? (
        <h3
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {title}
        </h3>
      ) : (
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </h3>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return v2 ? (
            /* Editorial card pattern — refactor a <EditorialMetricCard> shared si Plan 07 lo introduce. Por ahora inline. */
            <article
              key={card.title}
              className="border border-[var(--ink-1)] bg-[var(--paper-0)] flex flex-col"
              style={{
                boxShadow: '0 1px 0 var(--ink-1), 0 8px 20px -14px oklch(0.3 0.04 60 / 0.25)',
              }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-[var(--border)]">
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {card.title}
                </span>
                <Icon className="h-[14px] w-[14px] text-[var(--ink-3)]" aria-hidden />
              </div>
              <div className="px-4 py-4 flex-1">
                {loading ? (
                  <div
                    className="h-9 w-24 bg-[var(--paper-2)]"
                    style={{ animation: 'mx-pulse 1.5s ease-in-out infinite' }}
                  />
                ) : (
                  <>
                    <div
                      className="text-[30px] font-bold leading-none text-[var(--ink-1)]"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {card.getValue(metrics)}
                    </div>
                    {card.description && (
                      <p
                        className="text-[12px] italic text-[var(--ink-3)] mt-2"
                        style={{ fontFamily: 'var(--font-serif)' }}
                      >
                        {card.description}
                      </p>
                    )}
                  </>
                )}
              </div>
            </article>
          ) : (
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
  const v2 = useDashboardV2()

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
      {v2 ? (
        <div className="flex justify-end">
          <div className="flex gap-2">
            {periods.map((p) => {
              const isActive = period === p.value
              return (
                <button
                  key={p.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => handlePeriodChange(p.value)}
                  className={cn(
                    'px-[10px] py-1 rounded-full border text-[12px] transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    isActive
                      ? 'bg-[var(--ink-1)] text-[var(--paper-0)] border-[var(--ink-1)] font-semibold'
                      : 'bg-[var(--paper-0)] text-[var(--ink-2)] border-[var(--border)] font-medium hover:bg-[var(--paper-2)]'
                  )}
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
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
      )}

      {/* Metric groups */}
      <MetricGroup
        title="Conversaciones"
        cards={conversationCards}
        metrics={metrics}
        loading={isPending}
        v2={v2}
      />

      <MetricGroup
        title="Handoffs"
        cards={handoffCards}
        metrics={metrics}
        loading={isPending}
        v2={v2}
      />

      <MetricGroup
        title="Costos"
        cards={costCards}
        metrics={metrics}
        loading={isPending}
        v2={v2}
      />
    </div>
  )
}
