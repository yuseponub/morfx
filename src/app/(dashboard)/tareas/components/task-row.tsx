'use client'

// Placeholder — full implementation lands in Task 3 of ui-redesign-dashboard Plan 04.

import type { TaskWithDetails } from '@/lib/tasks/types'

interface TaskRowProps {
  task: TaskWithDetails
  isSelected?: boolean
  onClick?: (task: TaskWithDetails) => void
}

export function TaskRow(_props: TaskRowProps) {
  return null
}
