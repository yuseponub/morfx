'use client'

import * as React from 'react'
import { LayoutGridIcon, ListIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { cn } from '@/lib/utils'

export type OrderViewMode = 'kanban' | 'list'

interface ViewToggleProps {
  value: OrderViewMode
  onChange: (value: OrderViewMode) => void
  className?: string
}

/**
 * Toggle between Kanban and List views.
 */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
  const v2 = useDashboardV2()

  if (v2) {
    // Editorial segmented control per mock pedidos.html .seg pattern
    return (
      <div
        className={cn(
          'inline-flex border border-[var(--border)] rounded-[3px] overflow-hidden bg-[var(--paper-0)]',
          className
        )}
        role="group"
        aria-label="Modo de vista"
      >
        {(
          [
            { val: 'kanban' as const, icon: LayoutGridIcon, label: 'Tablero' },
            { val: 'list' as const, icon: ListIcon, label: 'Lista' },
          ]
        ).map((opt, i) => {
          const isOn = value === opt.val
          return (
            <button
              key={opt.val}
              type="button"
              onClick={() => onChange(opt.val)}
              aria-pressed={isOn}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors',
                i === 0 && 'border-r border-[var(--border)]',
                isOn
                  ? 'bg-[var(--ink-1)] text-[var(--paper-0)] font-semibold'
                  : 'bg-transparent text-[var(--ink-3)] font-medium hover:text-[var(--ink-1)]'
              )}
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              <opt.icon className="h-3 w-3" />
              {opt.label}
            </button>
          )
        })}
      </div>
    )
  }

  // CURRENT (flag OFF) — preserve verbatim
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(newValue) => {
        if (newValue) {
          onChange(newValue as OrderViewMode)
        }
      }}
      className={cn('bg-muted p-0.5 rounded-md', className)}
    >
      <ToggleGroupItem
        value="kanban"
        aria-label="Vista Kanban"
        className="data-[state=on]:bg-background p-2"
      >
        <LayoutGridIcon className="h-4 w-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        aria-label="Vista Lista"
        className="data-[state=on]:bg-background p-2"
      >
        <ListIcon className="h-4 w-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
