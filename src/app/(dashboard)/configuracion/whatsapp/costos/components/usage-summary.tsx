'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, DollarSign, TrendingUp, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CostCategory } from '@/app/actions/usage'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface UsageSummaryProps {
  totalMessages: number
  totalCost: number
  byCategory: Record<CostCategory, { count: number; cost: number }>
  limit: number | null
  percentUsed: number | null
  v2?: boolean
}

export function UsageSummary({
  totalMessages,
  totalCost,
  limit,
  percentUsed,
  v2: v2Prop,
}: UsageSummaryProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook

  const formatCurrency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    })

  if (v2) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {/* Total Mensajes */}
        <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Total Mensajes</div>
            <MessageSquare className="h-4 w-4 text-[var(--ink-3)]" />
          </div>
          <div className="text-[28px] font-bold tracking-[-0.01em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            {totalMessages.toLocaleString()}
          </div>
          <p className="text-[11px] text-[var(--ink-3)] mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
            Mensajes enviados en el periodo
          </p>
        </div>

        {/* Costo Total */}
        <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Costo Total</div>
            <DollarSign className="h-4 w-4 text-[var(--ink-3)]" />
          </div>
          <div className="text-[28px] font-bold tracking-[-0.01em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>
            {formatCurrency(totalCost)}
          </div>
          <p className="text-[11px] text-[var(--ink-3)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
            Costo estimado en USD
          </p>
        </div>

        {/* Limite Mensual */}
        <div className="border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Limite Mensual</div>
            {percentUsed !== null && percentUsed >= 80 ? (
              <AlertCircle className="h-4 w-4 text-[oklch(0.55_0.14_70)]" />
            ) : (
              <TrendingUp className="h-4 w-4 text-[var(--ink-3)]" />
            )}
          </div>
          {limit ? (
            <>
              <div
                className={cn(
                  'text-[28px] font-bold tracking-[-0.01em]',
                  percentUsed && percentUsed >= 100
                    ? 'text-[oklch(0.45_0.14_28)]'
                    : percentUsed && percentUsed >= 80
                      ? 'text-[oklch(0.45_0.14_70)]'
                      : 'text-[var(--ink-1)]'
                )}
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {percentUsed?.toFixed(0)}%
              </div>
              <div className="mt-2 h-1.5 bg-[var(--paper-3)] border border-[var(--border)] rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all',
                    percentUsed && percentUsed >= 100
                      ? 'bg-[oklch(0.55_0.18_28)]'
                      : percentUsed && percentUsed >= 80
                        ? 'bg-[oklch(0.55_0.14_70)]'
                        : 'bg-[var(--ink-1)]'
                  )}
                  style={{ width: `${Math.min(percentUsed || 0, 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-[var(--ink-3)] mt-1" style={{ fontFamily: 'var(--font-mono)' }}>
                {formatCurrency(totalCost)} de {formatCurrency(limit)}
              </p>
            </>
          ) : (
            <>
              <div className="text-[28px] font-bold tracking-[-0.01em] text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>Sin limite</div>
              <p className="text-[11px] text-[var(--ink-3)] mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
                Contacta soporte para configurar
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

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
