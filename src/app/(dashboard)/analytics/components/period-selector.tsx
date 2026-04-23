'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Period } from '@/lib/analytics/types'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  disabled?: boolean
}

const periods: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7days', label: '7 dias' },
  { value: '30days', label: '30 dias' },
  { value: 'month', label: 'Este mes' },
]

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  const v2 = useDashboardV2()

  if (v2) {
    return (
      <div
        className="inline-flex border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden"
        style={{ borderRadius: 'var(--radius-3)' }}
        role="group"
        aria-label="Seleccionar periodo"
      >
        {periods.map((period) => {
          const isActive = value === period.value
          return (
            <button
              key={period.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(period.value)}
              className={cn(
                'px-3 py-1.5 text-[12px] font-semibold border-r border-[var(--ink-1)] last:border-r-0 transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--ink-1)]',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                isActive
                  ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
                  : 'bg-[var(--paper-0)] text-[var(--ink-2)] hover:bg-[var(--paper-3)]'
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
              aria-pressed={isActive}
            >
              {period.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex gap-1 p-1 bg-muted rounded-lg">
      {periods.map((period) => (
        <Button
          key={period.value}
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange(period.value)}
          className={cn(
            'rounded-md',
            value === period.value && 'bg-background shadow-sm'
          )}
        >
          {period.label}
        </Button>
      ))}
    </div>
  )
}
