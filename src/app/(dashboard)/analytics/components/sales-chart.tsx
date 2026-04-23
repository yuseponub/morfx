'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts'
import type { TrendDataPoint } from '@/lib/analytics/types'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface SalesChartProps {
  data: TrendDataPoint[]
  loading?: boolean
}

export function SalesChart({ data, loading }: SalesChartProps) {
  const v2 = useDashboardV2()

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
      notation: 'compact'
    }).format(value)

  if (loading) {
    if (v2) {
      return (
        <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Tendencia
            </div>
            <h3
              className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tendencia de Ventas
            </h3>
          </div>
          <div className="p-5">
            <div className="h-[300px] w-full bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
          </div>
        </section>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia de Ventas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    if (v2) {
      return (
        <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Tendencia
            </div>
            <h3
              className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tendencia de Ventas
            </h3>
          </div>
          <div className="flex h-[300px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="mx-h4">Sin datos en este periodo</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        </section>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tendencia de Ventas</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">Sin datos en este periodo</p>
        </CardContent>
      </Card>
    )
  }

  if (v2) {
    return (
      <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
        <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Tendencia
          </div>
          <h3
            className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tendencia de Ventas
          </h3>
        </div>
        <div className="p-5">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorValueV2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--rubric-2)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--rubric-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--ink-4)"
                  strokeOpacity={0.2}
                  strokeDasharray="3 3"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'var(--ink-2)' }}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const item = payload[0].payload as TrendDataPoint
                    return (
                      <div
                        className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] p-3"
                        style={{ borderRadius: 'var(--radius-3)' }}
                      >
                        <p
                          className="font-semibold text-[13px] text-[var(--ink-1)]"
                          style={{ fontFamily: 'var(--font-sans)' }}
                        >
                          {label}
                        </p>
                        <p
                          className="text-[11px] text-[var(--ink-3)] mt-1"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          {item.orders} pedidos
                        </p>
                        <p
                          className="text-[12px] font-medium text-[var(--ink-1)] mt-0.5"
                          style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatCurrency(item.value)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--rubric-2)"
                  fill="url(#colorValueV2)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tendencia de Ventas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={80}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const item = payload[0].payload as TrendDataPoint
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3">
                      <p className="font-medium">{label}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.orders} pedidos
                      </p>
                      <p className="text-sm font-medium">
                        {formatCurrency(item.value)}
                      </p>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#colorValue)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
