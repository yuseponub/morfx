'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Period = 'today' | '7days' | '30days' | 'month'

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
}

const periods: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7days', label: '7 dias' },
  { value: '30days', label: '30 dias' },
  { value: 'month', label: 'Este mes' },
]

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
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
