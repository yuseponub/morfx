'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Period } from '@/lib/analytics/types'

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
