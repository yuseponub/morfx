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
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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
  const v2 = useDashboardV2()
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

  const portalContainer =
    v2 && typeof document !== 'undefined'
      ? ((document.querySelector('.theme-editorial') as HTMLElement | null) ??
        undefined)
      : undefined

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
        {v2 ? (
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'inline-flex items-center justify-start gap-2 px-3 py-1.5 text-[12px] font-medium transition-colors',
              'border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-1)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              value
                ? 'bg-[var(--ink-1)] text-[var(--paper-0)]'
                : 'bg-[var(--paper-0)] text-[var(--ink-1)] hover:bg-[var(--paper-3)]'
            )}
            style={{ fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-3)' }}
          >
            <CalendarIcon className="h-[14px] w-[14px]" />
            {label}
          </button>
        ) : (
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
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="end"
        portalContainer={portalContainer}
      >
        <Calendar
          mode="range"
          selected={draft}
          onSelect={setDraft}
          numberOfMonths={2}
          locale={es}
          initialFocus
        />
        <div
          className={cn(
            'flex justify-end gap-2 p-3',
            v2 ? 'border-t border-[var(--ink-1)]' : 'border-t'
          )}
        >
          {v2 ? (
            <>
              <button
                type="button"
                onClick={handleCancel}
                className="px-3 py-1.5 text-[12px] font-medium text-[var(--ink-2)] hover:text-[var(--ink-1)] transition-colors"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!canApply}
                className="px-3 py-1.5 text-[12px] font-semibold bg-[var(--ink-1)] text-[var(--paper-0)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                style={{ fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-3)' }}
              >
                Aplicar
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
