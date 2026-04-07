'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Period } from '@/lib/metricas-conversaciones/types'

interface PeriodSelectorProps {
  value: Period
  onChange: (period: Period) => void
  disabled?: boolean
}

// Only preset periods are shown here. Custom range picker is added in Plan 03.
const presets: { value: Exclude<Period, object>; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7days', label: 'Ultimos 7 dias' },
  { value: '30days', label: 'Ultimos 30 dias' },
]

export function PeriodSelector({ value, onChange, disabled }: PeriodSelectorProps) {
  return (
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
      {/* Custom range slot — implemented in Plan 03 */}
    </div>
  )
}
