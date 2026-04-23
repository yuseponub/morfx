'use client'

// Placeholder — full implementation lands in Task 2 of ui-redesign-dashboard Plan 04.

import type { TaskWithDetails } from '@/lib/tasks/types'

interface TaskKanbanProps {
  tasks: TaskWithDetails[]
  onSelectTask?: (task: TaskWithDetails) => void
  onAddTask?: (status: string) => void
  selectedTaskId?: string | null
}

export function TaskKanban(_props: TaskKanbanProps) {
  return null
}
