'use client'

import * as React from 'react'
import { PlusIcon } from 'lucide-react'
import { TaskCard } from './task-card'
import type { TaskWithDetails } from '@/lib/tasks/types'

interface TaskKanbanProps {
  tasks: TaskWithDetails[]
  onSelectTask?: (task: TaskWithDetails) => void
  onAddTask?: (status: string) => void
  selectedTaskId?: string | null
}

/**
 * 4-column kanban grouped by status (mock tareas.html §kanban).
 *
 * TaskStatus enum currently: 'pending' | 'completed' (no 'in_progress').
 * We keep 4 columns for mock fidelity; 'En proceso' stays visually empty
 * until backend introduces the status (documented in 04-SUMMARY.md).
 * 'En espera' filters by `postponement_count > 0` (pending tasks that
 * have been postponed).
 */
interface ColumnDef {
  id: 'pending' | 'in_progress' | 'waiting' | 'completed'
  label: string
  swatch: string // CSS color var
  filter: (t: TaskWithDetails) => boolean
}

const COLUMNS: ColumnDef[] = [
  {
    id: 'pending',
    label: 'Pendiente',
    swatch: 'var(--accent-gold)',
    filter: (t) =>
      t.status === 'pending' && (t.postponement_count ?? 0) === 0,
  },
  {
    id: 'in_progress',
    label: 'En proceso',
    swatch: 'var(--accent-verdigris)',
    // TaskStatus doesn't include 'in_progress' today — column stays empty.
    // When backend introduces it, match (t.status as string) === 'in_progress'.
    filter: (t) => (t.status as unknown as string) === 'in_progress',
  },
  {
    id: 'waiting',
    label: 'En espera',
    swatch: 'var(--accent-indigo)',
    filter: (t) =>
      t.status === 'pending' && (t.postponement_count ?? 0) > 0,
  },
  {
    id: 'completed',
    label: 'Completada',
    swatch: 'var(--ink-1)',
    filter: (t) => t.status === 'completed',
  },
]

export function TaskKanban({
  tasks,
  onSelectTask,
  onAddTask,
  selectedTaskId,
}: TaskKanbanProps) {
  const grouped = React.useMemo(() => {
    return COLUMNS.map((col) => ({ ...col, items: tasks.filter(col.filter) }))
  }, [tasks])

  return (
    <div className="overflow-auto pb-4">
      <div
        className="grid gap-3.5 min-h-[400px]"
        style={{ gridTemplateColumns: 'repeat(4, minmax(260px, 1fr))' }}
      >
        {grouped.map((col) => (
          <div
            key={col.id}
            className="bg-[var(--paper-2)] border border-[var(--border)] flex flex-col min-h-full"
          >
            {/* Column header: sticky (mock .col-hd) */}
            <div className="px-3.5 py-2.5 border-b border-[var(--border)] bg-[var(--paper-1)] flex items-center gap-2 sticky top-0 z-[1]">
              <span
                className="w-2.5 h-2.5 border border-[var(--ink-1)] flex-shrink-0"
                style={{ background: col.swatch }}
                aria-hidden
              />
              <h3
                className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--ink-1)] m-0"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {col.label}
              </h3>
              <span
                className="ml-auto text-[11px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                · {col.items.length}
              </span>
              {onAddTask && (
                <button
                  type="button"
                  onClick={() => onAddTask(col.id)}
                  className="border-0 bg-transparent cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink-1)] p-1 inline-flex"
                  aria-label={`Agregar tarea en ${col.label}`}
                >
                  <PlusIcon className="h-[14px] w-[14px]" />
                </button>
              )}
            </div>

            {/* Column body (mock .col-body) */}
            <div className="flex-1 p-2.5 flex flex-col gap-2.5 overflow-y-auto">
              {col.items.length === 0 ? (
                <p
                  className="text-[12px] text-center py-6"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    color: 'var(--ink-3)',
                  }}
                >
                  Sin tareas en {col.label.toLowerCase()}.
                </p>
              ) : (
                col.items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    isSelected={selectedTaskId === task.id}
                    onClick={onSelectTask}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
