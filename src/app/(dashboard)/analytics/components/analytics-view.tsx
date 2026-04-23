'use client'

import { useState, useTransition } from 'react'
import { getOrderMetrics, getSalesTrend } from '@/app/actions/analytics'
import type { Period, OrderMetrics, SalesTrend } from '@/lib/analytics/types'
import { MetricCards } from './metric-cards'
import { SalesChart } from './sales-chart'
import { PeriodSelector } from './period-selector'

interface AnalyticsViewProps {
  initialMetrics: OrderMetrics
  initialTrend: SalesTrend
}

export function AnalyticsView({ initialMetrics, initialTrend }: AnalyticsViewProps) {
  const [period, setPeriod] = useState<Period>('7days')
  const [metrics, setMetrics] = useState(initialMetrics)
  const [trend, setTrend] = useState(initialTrend)
  const [isPending, startTransition] = useTransition()

  const handlePeriodChange = (newPeriod: Period) => {
    setPeriod(newPeriod)
    startTransition(async () => {
      const [newMetrics, newTrend] = await Promise.all([
        getOrderMetrics(newPeriod),
        getSalesTrend(newPeriod)
      ])
      setMetrics(newMetrics)
      setTrend(newTrend)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <PeriodSelector value={period} onChange={handlePeriodChange} disabled={isPending} />
      </div>

      <MetricCards metrics={metrics} loading={isPending} />

      <SalesChart data={trend.data} loading={isPending} />
    </div>
  )
}
