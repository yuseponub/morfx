'use client'

import * as React from 'react'
import { LayoutGridIcon, ListIcon } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

export type OrderViewMode = 'kanban' | 'list'

interface ViewToggleProps {
  value: OrderViewMode
  onChange: (value: OrderViewMode) => void
  className?: string
  /** Editorial v3 render branch (standalone ui-redesign-editorial-core, Plan 03). */
  v3?: boolean
}

/**
 * Toggle between Kanban and List views.
 */
export function ViewToggle({ value, onChange, className, v3 = false }: ViewToggleProps) {
  // Editorial v3: `.vtoggle` (Tabla / Tablero), active `.on` = ink fill (UI-SPEC §6.3).
  // Same onChange wiring as the legacy ToggleGroup — markup/className only.
  if (v3) {
    return (
      <div className={cn('vtoggle', className)}>
        <button
          type="button"
          className={cn(value === 'list' && 'on')}
          onClick={() => onChange('list')}
          aria-pressed={value === 'list'}
        >
          Tabla
        </button>
        <button
          type="button"
          className={cn(value === 'kanban' && 'on')}
          onClick={() => onChange('kanban')}
          aria-pressed={value === 'kanban'}
        >
          Tablero
        </button>
      </div>
    )
  }

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
