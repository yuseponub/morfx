'use client'

import * as React from 'react'
import { isPast, parseISO, formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  UserIcon,
  MessageSquareIcon,
  PackageIcon,
  AlarmClockIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TaskWithDetails } from '@/lib/tasks/types'

interface TaskCardProps {
  task: TaskWithDetails
  isSelected?: boolean
  onClick?: (task: TaskWithDetails) => void
}

// Priority → pri-stripe color (mock tareas.html lines 96-99)
function getPriStripeColor(priority: string): string {
  switch (priority) {
    case 'high':
      return 'var(--rubric-2)'
    case 'medium':
      return 'var(--accent-gold)'
    case 'low':
      return 'var(--ink-4)'
    default:
      return 'var(--ink-4)'
  }
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

// SLA tone based on due_date urgency (mock .task-foot .sla danger/warn/ok)
function getSlaStyling(dueDate: string | null, isCompleted: boolean):
  | { tone: 'danger' | 'warn' | 'ok'; label: string }
  | null {
  if (!dueDate || isCompleted) return null
  const d = parseISO(dueDate)
  const now = Date.now()
  if (isPast(d)) {
    return {
      tone: 'danger' as const,
      label: `Vencida ${formatDistanceToNow(d, { locale: es, addSuffix: false })}`,
    }
  }
  const msUntil = d.getTime() - now
  const distance = formatDistanceToNow(d, { locale: es, addSuffix: false })
  if (msUntil < 4 * 60 * 60 * 1000) {
    return { tone: 'warn' as const, label: `SLA: ${distance}` }
  }
  return { tone: 'ok' as const, label: distance }
}

// Task type → label color per mock .task-hd .type (crm/ops/human)
function getTypeColor(name?: string | null): string {
  const lower = (name ?? '').toLowerCase()
  if (lower.includes('lead') || lower.includes('venta') || lower.includes('crm')) {
    return 'var(--accent-indigo)'
  }
  if (lower.includes('logist') || lower.includes('ops') || lower.includes('oper')) {
    return 'var(--accent-verdigris)'
  }
  if (lower.includes('escala') || lower.includes('agente') || lower.includes('bot')) {
    return 'var(--rubric-2)'
  }
  return 'var(--ink-2)'
}

export function TaskCard({ task, isSelected = false, onClick }: TaskCardProps) {
  const sla = getSlaStyling(task.due_date, task.status === 'completed')
  const typeColor = getTypeColor(task.task_type?.name)
  const assigneeLabel = task.assigned_user?.email?.split('@')[0] ?? null

  const handleActivate = () => {
    onClick?.(task)
  }

  return (
    <article
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleActivate()
        }
      }}
      className={cn(
        'relative bg-[var(--paper-0)] border border-[var(--ink-1)] cursor-pointer transition-shadow',
        'shadow-[0_1px_0_var(--ink-1),0_4px_12px_-10px_oklch(0.2_0.04_60_/_0.25)]',
        'hover:shadow-[0_1px_0_var(--ink-1),0_8px_20px_-12px_oklch(0.2_0.04_60_/_0.35)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rubric-2)]',
        isSelected && 'outline outline-2 outline-offset-2 outline-[var(--rubric-2)]'
      )}
      role="button"
      tabIndex={0}
      aria-label={`Tarea: ${task.title}`}
    >
      {/* Priority stripe (mock .task .pri-stripe) */}
      <span
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ background: getPriStripeColor(task.priority) }}
        aria-hidden
      />

      {/* Header: id + type (mock .task-hd) */}
      <div className="flex items-baseline gap-2 px-3 pt-2.5 pb-1.5 pl-3.5 border-b border-dotted border-[var(--border)]">
        <span
          className="text-[10px] font-medium text-[var(--ink-3)]"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          T-{task.id.slice(0, 4).toUpperCase()}
        </span>
        {task.task_type?.name && (
          <span
            className="ml-auto text-[9px] font-bold uppercase tracking-[0.12em]"
            style={{ fontFamily: 'var(--font-sans)', color: typeColor }}
          >
            {task.task_type.name}
          </span>
        )}
      </div>

      {/* Body: title + excerpt + meta (mock .task-body) */}
      <div className="px-3 py-2 pl-3.5">
        <div
          className="text-[15px] font-bold leading-[1.3] tracking-[-0.01em] text-[var(--ink-1)]"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {task.title}
        </div>
        {task.description && (
          <div
            className="mt-1 text-[12px] italic leading-[1.5] text-[var(--ink-2)]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {task.description}
          </div>
        )}
        <div
          className="flex flex-wrap gap-x-2 gap-y-1 mt-2 text-[10px] items-center"
          style={{ fontFamily: 'var(--font-sans)', color: 'var(--ink-3)' }}
        >
          {assigneeLabel && (
            <span
              className="inline-flex items-center gap-1"
              style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
            >
              <UserIcon className="h-[11px] w-[11px] opacity-70" />
              {assigneeLabel}
            </span>
          )}
          {task.contact?.name && (
            <>
              {assigneeLabel && <span className="text-[var(--ink-5)]">·</span>}
              <span
                className="inline-flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
              >
                <UserIcon className="h-[11px] w-[11px] opacity-70" />
                {task.contact.name}
              </span>
            </>
          )}
          {task.conversation && (
            <>
              <span className="text-[var(--ink-5)]">·</span>
              <span
                className="inline-flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
              >
                <MessageSquareIcon className="h-[11px] w-[11px] opacity-70" />
                conv
              </span>
            </>
          )}
          {task.order && (
            <>
              <span className="text-[var(--ink-5)]">·</span>
              <span
                className="inline-flex items-center gap-1"
                style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
              >
                <PackageIcon className="h-[11px] w-[11px] opacity-70" />
                pedido
              </span>
            </>
          )}
        </div>
      </div>

      {/* Foot: avatar + assignee + sla (mock .task-foot) */}
      <div className="flex items-center gap-2 px-3 pb-2.5 pt-2 pl-3.5 border-t border-dotted border-[var(--border)] bg-[var(--paper-1)]">
        <div className="inline-flex">
          {task.assigned_user ? (
            <div
              className="w-[22px] h-[22px] rounded-full bg-[var(--paper-3)] border-[1.5px] border-[var(--paper-0)] grid place-items-center"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '10px',
                fontWeight: 700,
                color: 'var(--ink-1)',
              }}
            >
              {getInitials(assigneeLabel ?? '?')}
            </div>
          ) : (
            <div
              className="w-[22px] h-[22px] rounded-full border-[1.5px] grid place-items-center"
              style={{
                background: 'color-mix(in oklch, var(--rubric-2) 20%, var(--paper-0))',
                color: 'var(--rubric-2)',
                borderColor: 'var(--rubric-2)',
                fontFamily: 'var(--font-display)',
                fontSize: '10px',
                fontWeight: 700,
              }}
            >
              ?
            </div>
          )}
        </div>
        <span
          className="text-[11px] italic"
          style={{
            fontFamily: 'var(--font-sans)',
            color: 'var(--ink-3)',
            fontWeight: 500,
          }}
        >
          {assigneeLabel ?? 'Sin asignar'}
        </span>
        {sla && (
          <span
            className={cn(
              'ml-auto text-[10px] inline-flex items-center gap-1',
              sla.tone === 'danger' && 'text-[var(--rubric-2)] font-bold',
              sla.tone === 'warn' && 'text-[var(--accent-gold)] font-semibold',
              sla.tone === 'ok' && 'text-[var(--semantic-success)]'
            )}
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            <AlarmClockIcon className="h-[11px] w-[11px]" />
            {sla.label}
          </span>
        )}
      </div>
    </article>
  )
}
