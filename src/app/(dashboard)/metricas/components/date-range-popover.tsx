'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { cn } from '@/lib/utils'

export interface DateRangeValue {
  start: string // ISO YYYY-MM-DD
  end: string // ISO YYYY-MM-DD
}

interface DateRangePopoverProps {
  value: DateRangeValue | null
  onChange: (range: DateRangeValue) => void
  disabled?: boolean
}

export function DateRangePopover({
  value,
  onChange,
  disabled,
}: DateRangePopoverProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>(() =>
    value
      ? { from: parseISO(value.start), to: parseISO(value.end) }
      : undefined
  )

  const label = value
    ? `${format(parseISO(value.start), 'd MMM', { locale: es })} - ${format(
        parseISO(value.end),
        'd MMM',
        { locale: es }
      )}`
    : 'Rango personalizado'

  const canApply =
    !!draft?.from && !!draft?.to && draft.to.getTime() >= draft.from.getTime()

  const handleApply = () => {
    if (!draft?.from || !draft?.to) return
    if (draft.to.getTime() < draft.from.getTime()) return
    onChange({
      start: format(draft.from, 'yyyy-MM-dd'),
      end: format(draft.to, 'yyyy-MM-dd'),
    })
    setOpen(false)
  }

  const handleCancel = () => {
    // Reset draft to committed value
    setDraft(
      value
        ? { from: parseISO(value.start), to: parseISO(value.end) }
        : undefined
    )
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          // On open, seed draft from committed value
          setDraft(
            value
              ? { from: parseISO(value.start), to: parseISO(value.end) }
              : undefined
          )
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={value ? 'default' : 'outline'}
          size="sm"
          disabled={disabled}
          className={cn('rounded-md justify-start text-left font-normal')}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={draft}
          onSelect={setDraft}
          numberOfMonths={2}
          locale={es}
          initialFocus
        />
        <div className="flex justify-end gap-2 p-3 border-t">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={!canApply}
          >
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
