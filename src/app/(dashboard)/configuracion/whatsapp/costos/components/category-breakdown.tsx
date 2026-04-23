'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts'
import type { CostCategory } from '@/app/actions/usage'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface CategoryBreakdownProps {
  data: Record<CostCategory, { count: number; cost: number }>
  v2?: boolean
}

const CATEGORY_LABELS: Record<CostCategory, string> = {
  marketing: 'Marketing',
  utility: 'Utilidad',
  authentication: 'Autenticacion',
  service: 'Servicio',
}

const CATEGORY_COLORS: Record<CostCategory, string> = {
  marketing: '#f97316', // orange-500
  utility: '#3b82f6', // blue-500
  authentication: '#8b5cf6', // violet-500
  service: '#22c55e', // green-500
}

export function CategoryBreakdown({ data, v2: v2Prop }: CategoryBreakdownProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook

  const chartData = Object.entries(data)
    .filter(([, v]) => v.count > 0)
    .map(([category, values]) => ({
      name: CATEGORY_LABELS[category as CostCategory] || category,
      value: values.count,
      cost: values.cost,
      color: CATEGORY_COLORS[category as CostCategory] || '#6b7280',
    }))

  const totalCost = Object.values(data).reduce((sum, v) => sum + v.cost, 0)
  const totalCount = Object.values(data).reduce((sum, v) => sum + v.count, 0)

  if (chartData.length === 0) {
    if (v2) {
      return (
        <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
            <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Por Categoria</h3>
          </div>
          <div className="flex items-center justify-center h-[300px]">
            <p className="text-[13px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Sin datos en este periodo</p>
          </div>
        </div>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por Categoria</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">Sin datos en este periodo</p>
        </CardContent>
      </Card>
    )
  }

  if (v2) {
    return (
      <div className="bg-[var(--paper-0)] border border-[var(--ink-1)] rounded-[var(--radius-3)] shadow-[0_1px_0_var(--ink-1)]">
        <div className="px-[18px] py-[14px] border-b border-[var(--border)]">
          <h3 className="text-[18px] font-bold tracking-[-0.01em] m-0" style={{ fontFamily: 'var(--font-display)' }}>Por Categoria</h3>
          <p className="text-[12px] text-[var(--ink-3)] mt-[3px] m-0" style={{ fontFamily: 'var(--font-sans)' }}>
            Mensajes y gasto por tipo (marketing, utility, authentication, service)
          </p>
        </div>
        <div className="px-[18px] py-[16px] space-y-3">
          {chartData.map((item) => {
            const pct = totalCount > 0 ? (item.value / totalCount) * 100 : 0
            return (
              <div key={item.name} className="grid grid-cols-[120px_1fr_100px] gap-2.5 items-center text-[12px]" style={{ fontFamily: 'var(--font-sans)' }}>
                <span className="text-[var(--ink-2)] flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full border border-[var(--ink-2)]" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <div className="h-1.5 bg-[var(--paper-3)] border border-[var(--border)] rounded-full overflow-hidden">
                  <span className="block h-full bg-[var(--ink-1)]" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-right text-[11px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
                  {item.value} · ${item.cost.toFixed(4)}
                </span>
              </div>
            )
          })}
          <div className="flex items-center justify-between text-[13px] font-semibold pt-2 border-t border-[var(--border)]">
            <span className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>Total</span>
            <span className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-mono)' }}>${totalCost.toFixed(4)}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Por Categoria</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const item = payload[0].payload
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-3">
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.value.toLocaleString()} mensajes
                        </p>
                        <p className="text-sm text-muted-foreground">
                          ${item.cost.toFixed(4)} USD
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-sm">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 space-y-2">
          {chartData.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.name}</span>
              </div>
              <span className="text-muted-foreground">
                ${item.cost.toFixed(4)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between text-sm font-medium pt-2 border-t">
            <span>Total</span>
            <span>${totalCost.toFixed(4)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
