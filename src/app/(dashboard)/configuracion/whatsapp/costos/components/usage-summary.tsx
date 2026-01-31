'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, DollarSign, TrendingUp, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CostCategory } from '@/app/actions/usage'

interface UsageSummaryProps {
  totalMessages: number
  totalCost: number
  byCategory: Record<CostCategory, { count: number; cost: number }>
  limit: number | null
  percentUsed: number | null
}

export function UsageSummary({
  totalMessages,
  totalCost,
  limit,
  percentUsed,
}: UsageSummaryProps) {
  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    })

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Mensajes</CardTitle>
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {totalMessages.toLocaleString()}
          </div>
          <p className="text-xs text-muted-foreground">
            Mensajes enviados en el periodo
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalCost)}</div>
          <p className="text-xs text-muted-foreground">Costo estimado en USD</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Limite Mensual</CardTitle>
          {percentUsed !== null && percentUsed >= 80 ? (
            <AlertCircle className="h-4 w-4 text-orange-500" />
          ) : (
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          )}
        </CardHeader>
        <CardContent>
          {limit ? (
            <>
              <div className="text-2xl font-bold">
                {percentUsed?.toFixed(0)}%
              </div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    percentUsed && percentUsed >= 100
                      ? 'bg-red-500'
                      : percentUsed && percentUsed >= 80
                        ? 'bg-orange-500'
                        : 'bg-primary'
                  )}
                  style={{ width: `${Math.min(percentUsed || 0, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(totalCost)} de {formatCurrency(limit)}
              </p>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold">Sin limite</div>
              <p className="text-xs text-muted-foreground">
                Contacta soporte para configurar
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
