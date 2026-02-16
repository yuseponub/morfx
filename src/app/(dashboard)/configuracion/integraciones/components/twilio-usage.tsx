'use client'

// ============================================================================
// Phase 20: Twilio SMS Usage Dashboard
// Shows SMS stats, daily chart, and recent message table
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  getSmsUsage,
  getSmsUsageChart,
  type SmsUsageData,
  type SmsChartData,
} from '@/app/actions/integrations'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  MessageSquare,
  DollarSign,
  Clock,
  Loader2,
} from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

type Period = 'day' | 'week' | 'month'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'day', label: 'Dia' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
]

const STATUS_COLORS: Record<string, string> = {
  delivered: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  sent: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  undelivered: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  queued: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  sending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
}

const STATUS_LABELS: Record<string, string> = {
  delivered: 'Entregado',
  sent: 'Enviado',
  failed: 'Fallido',
  undelivered: 'No entregado',
  queued: 'En cola',
  sending: 'Enviando',
}

export function TwilioUsage() {
  const [period, setPeriod] = useState<Period>('week')
  const [usage, setUsage] = useState<SmsUsageData | null>(null)
  const [chartData, setChartData] = useState<SmsChartData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const loadData = useCallback(async (p: Period) => {
    setIsLoading(true)
    try {
      const [usageData, chart] = await Promise.all([
        getSmsUsage(p),
        p !== 'day' ? getSmsUsageChart(p as 'week' | 'month') : Promise.resolve([]),
      ])
      setUsage(usageData)
      setChartData(chart)
    } catch {
      toast.error('Error al cargar datos de uso')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(period)
  }, [period, loadData])

  const formatCurrency = (value: number) =>
    '$' + value.toFixed(4)

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  if (isLoading && !usage) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Uso de SMS</h3>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              variant="ghost"
              size="sm"
              onClick={() => setPeriod(p.value)}
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

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">SMS Enviados</CardTitle>
            <MessageSquare className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(usage?.totalSent || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              En el periodo seleccionado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Total (USD)</CardTitle>
            <DollarSign className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(usage?.totalCost || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Costo reportado por Twilio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-teal-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(usage?.pendingCost || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              Esperando costo de Twilio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart (only for week/month) */}
      {period !== 'day' && chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SMS por Dia</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData.map((d) => ({
                    ...d,
                    displayDate: new Date(d.date).toLocaleDateString('es-CO', {
                      month: 'short',
                      day: 'numeric',
                    }),
                  }))}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorSmsCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="displayDate"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v.toLocaleString()}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload
                        return (
                          <div className="bg-background border rounded-lg shadow-lg p-3">
                            <p className="text-sm font-medium">{item.displayDate}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.count.toLocaleString()} SMS
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(item.cost)} USD
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#0d9488"
                    fillOpacity={1}
                    fill="url(#colorSmsCount)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {period !== 'day' && chartData.length === 0 && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">SMS por Dia</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[200px]">
            <p className="text-muted-foreground">Sin datos en este periodo</p>
          </CardContent>
        </Card>
      )}

      {/* Recent Messages Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensajes Recientes</CardTitle>
        </CardHeader>
        <CardContent>
          {usage && usage.messages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">Destino</th>
                    <th className="text-left py-2 px-2 font-medium">Mensaje</th>
                    <th className="text-left py-2 px-2 font-medium">Estado</th>
                    <th className="text-right py-2 px-2 font-medium">Costo</th>
                    <th className="text-right py-2 px-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.messages.map((msg) => (
                    <tr key={msg.id} className="border-b last:border-0">
                      <td className="py-2 px-2 font-mono text-xs">
                        {msg.to_number}
                      </td>
                      <td className="py-2 px-2 max-w-[200px] truncate text-muted-foreground">
                        {msg.body}
                      </td>
                      <td className="py-2 px-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-xs',
                            STATUS_COLORS[msg.status] || STATUS_COLORS.queued
                          )}
                        >
                          {STATUS_LABELS[msg.status] || msg.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-xs">
                        {msg.price !== null ? (
                          formatCurrency(msg.price)
                        ) : (
                          <span className="text-muted-foreground">Pendiente</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(msg.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">
                No hay mensajes SMS en este periodo
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
