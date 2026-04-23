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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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
  const v2 = useDashboardV2()
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
          className={cn(
            className,
            v2 && 'text-[var(--ink-3)] hover:text-[var(--rubric-2)] hover:bg-[var(--paper-3)]'
          )}
          title="Insertar variable"
        >
          <Braces className={cn('size-4', v2 && 'text-[var(--rubric-2)]')} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className={cn(
          'w-72 p-0',
          v2 && 'bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]'
        )}
      >
        <div
          className={cn(
            'p-3',
            v2 ? 'border-b border-[var(--ink-1)] bg-[var(--paper-2)]' : 'border-b'
          )}
        >
          <p
            className={cn(
              v2
                ? 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]'
                : 'text-sm font-medium'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            Variables disponibles
          </p>
          <p
            className={cn(
              'mt-0.5',
              v2 ? 'text-[11px] italic text-[var(--ink-3)]' : 'text-xs text-muted-foreground'
            )}
            style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
          >
            Click para insertar en el campo
          </p>
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {variables.map((v) => (
            <button
              key={v.path}
              type="button"
              onClick={() => handleSelect(v.path)}
              className={cn(
                'w-full text-left px-3 py-2 transition-colors',
                v2 ? 'hover:bg-[var(--paper-3)]' : 'text-sm rounded-sm hover:bg-accent'
              )}
            >
              <span
                className={cn(
                  v2
                    ? 'text-[11px] text-[var(--rubric-2)]'
                    : 'font-mono text-xs text-primary'
                )}
                style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
              >
                {'{{'}
                {v.path}
                {'}}'}
              </span>
              <span
                className={cn(
                  'block mt-0.5',
                  v2
                    ? 'text-[11px] italic text-[var(--ink-3)]'
                    : 'text-xs text-muted-foreground'
                )}
                style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
              >
                {v.label}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
