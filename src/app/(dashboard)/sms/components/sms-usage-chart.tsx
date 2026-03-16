'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { getSMSUsageData, type SMSUsageDataPoint } from '@/app/actions/sms'

export function SmsUsageChart() {
  const [data, setData] = useState<SMSUsageDataPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSMSUsageData(30).then((result) => {
      setData(result)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uso de SMS (ultimos 30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Uso de SMS (ultimos 30 dias)</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px]">
          <p className="text-muted-foreground">Sin datos en este periodo</p>
        </CardContent>
      </Card>
    )
  }

  // Format date for X axis label (e.g. "16 Mar")
  const formatLabel = (date: string) => {
    const d = new Date(date + 'T12:00:00')
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Uso de SMS (ultimos 30 dias)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorSmsCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={formatLabel}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={40}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const item = payload[0].payload as SMSUsageDataPoint
                  const formatCOP = (v: number) =>
                    new Intl.NumberFormat('es-CO', {
                      style: 'currency',
                      currency: 'COP',
                      minimumFractionDigits: 0,
                    }).format(v)
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-3">
                      <p className="font-medium">{formatLabel(item.date)}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.count} SMS enviados
                      </p>
                      <p className="text-sm font-medium">
                        {formatCOP(item.cost)}
                      </p>
                    </div>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                fillOpacity={1}
                fill="url(#colorSmsCount)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
