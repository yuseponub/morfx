'use client'

// ============================================================================
// MultiSelect — checkbox-list inside a popover for `in` / `notIn` /
// `arrayContainsAny` / `arrayContainsAll` operators in ConditionBuilder.
//
// Value is always a string[]. Trigger button shows "N seleccionados" o el
// primer item si solo hay 1. Inside the popover, checkboxes per option.
// Optionally groups options by header label (used for stage names grouped by
// pipeline name).
// ============================================================================

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface MultiSelectGroup {
  /** Optional group header (e.g., pipeline name). null = ungrouped. */
  label: string | null
  options: string[]
}

interface Props {
  value: string[]
  onChange: (next: string[]) => void
  /** Flat options (used when groups is undefined). */
  options?: string[]
  /** Grouped options — overrides `options` if provided. */
  groups?: MultiSelectGroup[]
  placeholder?: string
}

export function MultiSelect({
  value,
  onChange,
  options,
  groups,
  placeholder = 'Selecciona...',
}: Props) {
  const [open, setOpen] = useState(false)

  const selectedSet = useMemo(() => new Set(value), [value])

  const toggle = (option: string) => {
    if (selectedSet.has(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      onChange([...value, option])
    }
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange([])
  }

  const triggerLabel =
    value.length === 0
      ? placeholder
      : value.length === 1
        ? value[0]
        : `${value.length} seleccionados`

  const renderOptionRow = (opt: string, indent = false) => {
    const checked = selectedSet.has(opt)
    return (
      <button
        type="button"
        key={opt}
        onClick={() => toggle(opt)}
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground text-left',
          indent && 'pl-5',
        )}
      >
        <Checkbox checked={checked} className="pointer-events-none" />
        <span className="flex-1 truncate">{opt}</span>
        {checked && <Check className="h-4 w-4 opacity-70" />}
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              'truncate',
              value.length === 0 && 'text-muted-foreground',
            )}
          >
            {triggerLabel}
          </span>
          <span className="flex items-center gap-1">
            {value.length > 0 && (
              <X
                className="h-3.5 w-3.5 opacity-50 hover:opacity-100"
                onClick={clear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 max-h-[320px] overflow-y-auto">
        {groups
          ? groups.map((g) => (
              <div key={g.label ?? '__ungrouped__'} className="mb-1">
                {g.label && (
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.label}
                  </div>
                )}
                {g.options.map((opt) => renderOptionRow(opt, !!g.label))}
              </div>
            ))
          : (options ?? []).map((opt) => renderOptionRow(opt))}
        {!groups && (options ?? []).length === 0 && (
          <div className="px-2 py-1 text-sm text-muted-foreground">
            Sin opciones disponibles.
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
