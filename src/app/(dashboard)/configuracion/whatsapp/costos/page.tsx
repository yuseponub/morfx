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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

export default function CostosPage() {
  const v2 = useDashboardV2()
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
    if (v2) {
      return (
        <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
          <div className="container py-6 px-6">
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--ink-3)]" />
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="flex-1 overflow-auto">
        <div className="container py-6 px-6">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    )
  }

  if (v2) {
    return (
      <div className="flex-1 overflow-auto bg-[var(--paper-1)]">
        {/* Editorial topbar with inline period selector */}
        <div className="px-8 pt-[18px] pb-[14px] border-b border-[var(--ink-1)] bg-[var(--paper-1)] flex items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--rubric-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
              Datos · WhatsApp
            </div>
            <h1 className="m-0 mt-0.5 text-[30px] font-bold tracking-[-0.015em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              Costos y Uso
              <em className="ml-2.5 text-[15px] font-normal not-italic text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
                — estadisticas de mensajes y costos de WhatsApp
              </em>
            </h1>
          </div>
          <PeriodSelector value={period} onChange={setPeriod} v2={v2} />
        </div>

        <div className="px-8 py-6">
          {summary && (
            <div className="space-y-6">
              <UsageSummary
                totalMessages={summary.totalMessages}
                totalCost={summary.totalCost}
                byCategory={summary.byCategory}
                limit={spending?.limit ?? null}
                percentUsed={spending?.percentUsed ?? null}
                v2={v2}
              />

              <div className="grid gap-6 md:grid-cols-2">
                <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)] p-4">
                  <UsageChart data={dailyData} />
                </div>
                <CategoryBreakdown data={summary.byCategory} v2={v2} />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="container py-6 px-6">
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
    </div>
  )
}
