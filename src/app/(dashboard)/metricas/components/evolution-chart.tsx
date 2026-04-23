'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import type { DailyMetric } from '@/lib/metricas-conversaciones/types'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface EvolutionChartProps {
  data: DailyMetric[]
  loading?: boolean
}

export function EvolutionChart({ data, loading }: EvolutionChartProps) {
  const v2 = useDashboardV2()

  if (loading) {
    if (v2) {
      return (
        <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Evolución
            </div>
            <h3
              className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Evolucion por dia
            </h3>
          </div>
          <div className="p-5">
            <div className="h-[320px] w-full bg-[var(--paper-2)] animate-[mx-pulse_1.5s_ease-in-out_infinite]" />
          </div>
        </section>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolucion por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  if (!data.length) {
    if (v2) {
      return (
        <section className="bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
          <div className="px-5 pt-3.5 pb-3 border-b border-[var(--ink-1)] bg-[var(--paper-1)]">
            <div
              className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              Evolución
            </div>
            <h3
              className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Evolucion por dia
            </h3>
          </div>
          <div className="flex h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="mx-h4">Sin datos en el periodo seleccionado.</p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        </section>
      )
    }
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolucion por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
            Sin datos en el periodo seleccionado.
          </div>
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
            Evolución
          </div>
          <h3
            className="m-0 mt-0.5 text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink-1)]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Evolucion por dia
          </h3>
        </div>
        <div className="p-5">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                  tick={{ fill: 'var(--ink-3)', fontFamily: 'var(--font-mono)', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  cursor={{ stroke: 'var(--ink-3)', strokeOpacity: 0.4, strokeDasharray: '2 2' }}
                  contentStyle={{
                    backgroundColor: 'var(--paper-0)',
                    border: '1px solid var(--ink-1)',
                    borderRadius: 'var(--radius-3)',
                    fontFamily: 'var(--font-sans)',
                    fontSize: '12px',
                    boxShadow: '0 1px 0 var(--ink-1)',
                  }}
                  labelStyle={{ color: 'var(--ink-1)', fontWeight: 600 }}
                  itemStyle={{ fontFamily: 'var(--font-mono)', fontSize: '11px' }}
                />
                <Legend
                  wrapperStyle={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: '11px',
                    color: 'var(--ink-2)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="nuevas"
                  name="Nuevas"
                  stroke="var(--rubric-2)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--paper-0)', stroke: 'var(--rubric-2)', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="reabiertas"
                  name="Reabiertas"
                  stroke="var(--accent-gold)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--paper-0)', stroke: 'var(--accent-gold)', strokeWidth: 2 }}
                />
                <Line
                  type="monotone"
                  dataKey="agendadas"
                  name="Agendadas"
                  stroke="var(--accent-verdigris)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--paper-0)', stroke: 'var(--accent-verdigris)', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Evolucion por dia</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '0.875rem' }} />
              <Line
                type="monotone"
                dataKey="nuevas"
                name="Nuevas"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="reabiertas"
                name="Reabiertas"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="agendadas"
                name="Agendadas"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
