'use client'

import { useState, useEffect } from 'react'
import { UsageSummary } from './components/usage-summary'
import { UsageChart } from './components/usage-chart'
import { CategoryBreakdown } from './components/category-breakdown'
import { PeriodSelector, type Period } from './components/period-selector'
import {
  getUsageSummary,
  getUsageByDay,
  getSpendingStatus,
  type UsageSummary as UsageSummaryType,
  type DailyUsage,
  type SpendingStatus,
} from '@/app/actions/usage'
import { Loader2 } from 'lucide-react'

export default function CostosPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<UsageSummaryType | null>(null)
  const [dailyData, setDailyData] = useState<DailyUsage[]>([])
  const [spending, setSpending] = useState<SpendingStatus | null>(null)

  useEffect(() => {
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    try {
      const days = period === 'today' ? 1 : period === '7days' ? 7 : 30
      const [summaryData, dailyUsage, spendingStatus] = await Promise.all([
        getUsageSummary(period),
        getUsageByDay(days),
        getSpendingStatus(),
      ])
      setSummary(summaryData)
      setDailyData(dailyUsage)
      setSpending(spendingStatus)
    } catch (error) {
      console.error('Failed to load usage data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !summary) {
    return (
      <div className="container py-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Costos y Uso</h1>
          <p className="text-muted-foreground">
            Estadisticas de mensajes y costos de WhatsApp
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {summary && (
        <div className="space-y-6">
          <UsageSummary
            totalMessages={summary.totalMessages}
            totalCost={summary.totalCost}
            byCategory={summary.byCategory}
            limit={spending?.limit ?? null}
            percentUsed={spending?.percentUsed ?? null}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <UsageChart data={dailyData} />
            <CategoryBreakdown data={summary.byCategory} />
          </div>
        </div>
      )}
    </div>
  )
}
