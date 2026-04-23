'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

export type Period = 'today' | '7days' | '30days' | 'month'

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  v2?: boolean
}

const periods: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7days', label: '7 dias' },
  { value: '30days', label: '30 dias' },
  { value: 'month', label: 'Este mes' },
]

export function PeriodSelector({ value, onChange, v2: v2Prop }: PeriodSelectorProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook

  if (v2) {
    return (
      <div className="flex gap-4" role="tablist">
        {periods.map((period) => {
          const isActive = value === period.value
          return (
            <button
              key={period.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(period.value)}
              className={cn(
                'pb-1 text-[13px] transition-colors',
                isActive
                  ? 'font-semibold text-[var(--ink-1)] border-b-2 border-[var(--ink-1)]'
                  : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-1)] border-b-2 border-transparent'
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
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
