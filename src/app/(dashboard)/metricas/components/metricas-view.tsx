'use client'

import { useCallback, useState, useTransition } from 'react'
import type { Period, MetricsPayload } from '@/lib/metricas-conversaciones/types'
import { getConversationMetrics } from '@/app/actions/metricas-conversaciones'
import { PeriodSelector } from './period-selector'
import { MetricCards } from './metric-cards'

interface MetricasViewProps {
  initial: MetricsPayload
}

export function MetricasView({ initial }: MetricasViewProps) {
  const [period, setPeriod] = useState<Period>('today')
  const [data, setData] = useState<MetricsPayload>(initial)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback((p: Period) => {
    startTransition(async () => {
      const next = await getConversationMetrics(p)
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

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PeriodSelector value={period} onChange={handlePeriodChange} disabled={isPending} />
      </div>
      <MetricCards data={data.totals} loading={isPending} />
      {/* EvolutionChart added in Plan 03 */}
    </div>
  )
}
