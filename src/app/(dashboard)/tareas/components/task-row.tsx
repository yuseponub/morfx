'use client'

import * as React from 'react'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { TaskWithDetails } from '@/lib/tasks/types'

interface TaskRowProps {
  task: TaskWithDetails
  isSelected?: boolean
  onClick?: (task: TaskWithDetails) => void
}

/**
 * Status → pill classes (mock tareas.html lines 272-276).
 * 4 states: pending (accent-gold) / progress (accent-verdigris) /
 * wait (accent-indigo) / done (ink-1 invert).
 */
function getStatusPill(
  status: string,
  postponed: boolean
): { label: string; classes: string } {
  if (status === 'completed') {
    return {
      label: 'Completada',
      classes: 'text-[var(--paper-0)] border-[var(--ink-1)] bg-[var(--ink-1)]',
    }
  }
  if (postponed) {
    return {
      label: 'En espera',
      classes:
        'text-[var(--accent-indigo)] border-[var(--accent-indigo)] bg-[color-mix(in_oklch,var(--accent-indigo)_8%,var(--paper-0))]',
    }
  }
  if ((status as unknown as string) === 'in_progress') {
    // Not reachable today but ready for when backend introduces the status.
    return {
      label: 'En proceso',
      classes:
        'text-[var(--accent-verdigris)] border-[var(--accent-verdigris)] bg-[color-mix(in_oklch,var(--accent-verdigris)_8%,var(--paper-0))]',
    }
  }
  return {
    label: 'Pendiente',
    classes:
      'text-[var(--accent-gold)] border-[var(--accent-gold)] bg-[color-mix(in_oklch,var(--accent-gold)_10%,var(--paper-0))]',
  }
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
}

export function TaskRow({ task, isSelected, onClick }: TaskRowProps) {
  const pill = getStatusPill(task.status, (task.postponement_count ?? 0) > 0)
  const dueDate = task.due_date ? parseISO(task.due_date) : null
  const dueLabel = dueDate
    ? isToday(dueDate)
      ? 'Hoy'
      : format(dueDate, 'd MMM', { locale: es })
    : '—'
  const dueTone =
    dueDate && isPast(dueDate) && !isToday(dueDate) && task.status !== 'completed'
      ? 'text-[var(--rubric-2)] font-semibold'
      : 'text-[var(--ink-2)]'

  return (
    <tr
      onClick={() => onClick?.(task)}
      className={cn(
        'cursor-pointer transition-colors',
        isSelected
          ? 'bg-[color-mix(in_oklch,var(--rubric-2)_4%,var(--paper-0))]'
          : 'hover:bg-[var(--paper-2)]'
      )}
      aria-selected={isSelected}
    >
      <td
        className="px-3.5 py-2.5 border-b border-[var(--border)] text-[11px] text-[var(--ink-3)] align-middle"
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        T-{task.id.slice(0, 4).toUpperCase()}
      </td>
      <td
        className="px-3.5 py-2.5 border-b border-[var(--border)] text-[13px] text-[var(--ink-1)] font-semibold max-w-[320px]"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {task.title}
        {task.description && (
          <span
            className="block mt-0.5 text-[12px] italic font-normal text-[var(--ink-3)] truncate"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {task.description}
          </span>
        )}
      </td>
      <td className="px-3.5 py-2.5 border-b border-[var(--border)] align-middle">
        <span
          className={cn(
            'inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.10em] border',
            pill.classes
          )}
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {pill.label}
        </span>
      </td>
      <td
        className="px-3.5 py-2.5 border-b border-[var(--border)] text-[13px] text-[var(--ink-2)] align-middle"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {PRIORITY_LABEL[task.priority] ?? task.priority}
      </td>
      <td
        className="px-3.5 py-2.5 border-b border-[var(--border)] text-[13px] text-[var(--ink-2)] align-middle"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {task.assigned_user?.email.split('@')[0] ?? 'Sin asignar'}
      </td>
      <td
        className={cn(
          'px-3.5 py-2.5 border-b border-[var(--border)] text-[12px] align-middle',
          dueTone
        )}
        style={{ fontFamily: 'var(--font-mono)' }}
      >
        {dueLabel}
      </td>
    </tr>
  )
}
