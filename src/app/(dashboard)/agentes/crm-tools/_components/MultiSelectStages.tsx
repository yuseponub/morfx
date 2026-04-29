'use client'

/**
 * MultiSelectStages — inline multi-select variant for /agentes/crm-tools.
 *
 * Standalone crm-query-tools Wave 4 (Plan 05).
 *
 * Why inline (not the routing-editor MultiSelect)?
 *   The routing-editor MultiSelect (src/app/(dashboard)/agentes/routing/editor/
 *   _components/MultiSelect.tsx) accepts plain `string[]` of labels — it stores
 *   the LABEL as the value. We need to store stage UUIDs while displaying
 *   stage names. Refactoring the routing-editor variant is out of scope; this
 *   inline variant accepts `{value, label}[]` pairs grouped by pipeline.
 */

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface StageOption {
  value: string // stage UUID
  label: string // stage display name
}

export interface StageGroup {
  label: string // pipeline name
  options: StageOption[]
}

interface Props {
  value: string[] // selected stage UUIDs
  onChange: (next: string[]) => void
  groups: StageGroup[]
  placeholder?: string
}

export function MultiSelectStages({
  value,
  onChange,
  groups,
  placeholder = 'Selecciona stages...',
}: Props) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => new Set(value), [value])
  const allOptions = useMemo(
    () => groups.flatMap((g) => g.options),
    [groups],
  )

  const labelById = useMemo(() => {
    const m = new Map<string, string>()
    for (const o of allOptions) m.set(o.value, o.label)
    return m
  }, [allOptions])

  const toggle = (uuid: string) => {
    if (selected.has(uuid)) onChange(value.filter((v) => v !== uuid))
    else onChange([...value, uuid])
  }

  const triggerLabel =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value.map((v) => labelById.get(v) ?? v).join(', ')
        : `${value.length} stages seleccionados`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Stages activos"
          className="w-full justify-between"
        >
          <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <div className="max-h-[400px] overflow-y-auto p-2">
          {groups.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No hay pipelines en este workspace.</p>
          )}
          {groups.map((g) => (
            <div key={g.label} className="mb-3 last:mb-0">
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <div className="flex flex-col gap-0.5">
                {g.options.map((opt) => {
                  const isSelected = selected.has(opt.value)
                  return (
                    <label
                      key={opt.value}
                      role="checkbox"
                      aria-checked={isSelected}
                      aria-label={opt.label}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(opt.value)}
                      />
                      <span className="flex-1">{opt.label}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
