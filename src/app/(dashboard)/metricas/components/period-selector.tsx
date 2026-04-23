'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Period } from '@/lib/metricas-conversaciones/types'
import { DateRangePopover, type DateRangeValue } from './date-range-popover'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  disabled?: boolean
}

const presets: { value: Exclude<Period, object>; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7days', label: 'Ultimos 7 dias' },
  { value: '30days', label: 'Ultimos 30 dias' },
]

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  const v2 = useDashboardV2()

  const customRange: DateRangeValue | null =
    typeof value === 'object' && value !== null ? value : null

  if (v2) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="inline-flex border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)] overflow-hidden"
          style={{ borderRadius: 'var(--radius-3)' }}
          role="group"
          aria-label="Seleccionar periodo"
        >
          {presets.map((preset) => {
            const isActive = typeof value === 'string' && value === preset.value
            return (
              <button
                key={preset.value}
                type="button"
                disabled={disabled}
                onClick={() => onChange(preset.value)}
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
                {preset.label}
              </button>
            )
          })}
        </div>
        <DateRangePopover
          value={customRange}
          onChange={(range) => onChange(range)}
          disabled={disabled}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 p-1 bg-muted rounded-lg">
        {presets.map((preset) => {
          const isActive = typeof value === 'string' && value === preset.value
          return (
            <Button
              key={preset.value}
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={() => onChange(preset.value)}
              className={cn('rounded-md', isActive && 'bg-background shadow-sm')}
            >
              {preset.label}
            </Button>
          )
        })}
      </div>
      <DateRangePopover
        value={customRange}
        onChange={(range) => onChange(range)}
        disabled={disabled}
      />
    </div>
  )
}
