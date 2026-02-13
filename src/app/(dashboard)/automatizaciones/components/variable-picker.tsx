'use client'

import { VARIABLE_CATALOG } from '@/lib/automations/constants'
import type { TriggerType } from '@/lib/automations/types'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Braces } from 'lucide-react'
import { useState } from 'react'

// ============================================================================
// Types
// ============================================================================

interface VariablePickerProps {
  triggerType: TriggerType
  onInsert: (variable: string) => void
  className?: string
}

// ============================================================================
// Component
// ============================================================================

export function VariablePicker({ triggerType, onInsert, className }: VariablePickerProps) {
  const [open, setOpen] = useState(false)
  const variables: readonly { path: string; label: string }[] =
    VARIABLE_CATALOG[triggerType as keyof typeof VARIABLE_CATALOG] ?? []

  if (!variables.length) return null

  function handleSelect(path: string) {
    onInsert(`{{${path}}}`)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={className}
          title="Insertar variable"
        >
          <Braces className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b">
          <p className="text-sm font-medium">Variables disponibles</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Click para insertar en el campo
          </p>
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {variables.map((v) => (
            <button
              key={v.path}
              type="button"
              onClick={() => handleSelect(v.path)}
              className="w-full text-left px-3 py-2 text-sm rounded-sm hover:bg-accent transition-colors"
            >
              <span className="font-mono text-xs text-primary">
                {'{{'}
                {v.path}
                {'}}'}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {v.label}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
