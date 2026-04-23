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
}

/**
 * Toggle between Kanban and List views.
 */
export function ViewToggle({ value, onChange, className }: ViewToggleProps) {
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
