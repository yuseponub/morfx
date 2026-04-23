'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type { Period, MetricsPayload } from '@/lib/metricas-conversaciones/types'
import { getConversationMetrics } from '@/app/actions/metricas-conversaciones'
import { useMetricasRealtime } from '../hooks/use-metricas-realtime'
import { PeriodSelector } from './period-selector'
import { MetricCards } from './metric-cards'
import { EvolutionChart } from './evolution-chart'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'

interface MetricasViewProps {
  initial: MetricsPayload
  workspaceId: string
}

export function MetricasView({ initial, workspaceId }: MetricasViewProps) {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState<MetricsPayload>(initial)
  const [isPending, startTransition] = useTransition()
  const v2 = useDashboardV2()

  // Track latest period in a ref so the realtime callback always re-fetches
  // with the currently-selected period without re-creating the subscription.
  const periodRef = useRef<Period>('today')
  useEffect(() => {
    periodRef.current = period
  }, [period])

  const refresh = useCallback((p?: Period) => {
    const target = p ?? periodRef.current
    startTransition(async () => {
      const next = await getConversationMetrics(target)
      setData(next)
    })
  }, [])

  const handlePeriodChange = useCallback(
    (p: Period) => {
      setPeriod(p)
      refresh(p)
    },
    [refresh]
  )

  // Realtime hybrid: any messages/contact_tags change triggers an RPC
  // re-fetch with the current period (debounced 400ms inside the hook).
  useMetricasRealtime(workspaceId, () => refresh())

  return (
    <div className={cn('space-y-6', v2 && 'theme-editorial')}>
      <div className="flex justify-end">
        <PeriodSelector value={period} onChange={handlePeriodChange} disabled={isPending} />
      </div>
      <MetricCards data={data.totals} loading={isPending} />
      <EvolutionChart data={data.daily} loading={isPending} />
    </div>
  )
}
