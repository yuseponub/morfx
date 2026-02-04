'use client'

import * as React from 'react'
import {
  PlusCircleIcon,
  PencilIcon,
  CheckCircleIcon,
  RotateCcwIcon,
  CalendarIcon,
  MessageSquareIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { Timeline, TimelineItem, formatRelativeDate } from '@/components/ui/timeline'
import { formatTaskChanges } from '@/app/actions/task-activity'
import type { TaskActivityWithUser, TaskActivityAction } from '@/lib/tasks/types'

// Icon mapping for activity types
const ACTION_ICONS: Record<TaskActivityAction, typeof PlusCircleIcon> = {
  created: PlusCircleIcon,
  updated: PencilIcon,
  completed: CheckCircleIcon,
  reopened: RotateCcwIcon,
  due_date_changed: CalendarIcon,
  deleted: Trash2Icon,
  note_added: MessageSquareIcon,
  note_updated: PencilIcon,
  note_deleted: Trash2Icon,
}

// Spanish labels
const ACTION_LABELS: Record<TaskActivityAction, string> = {
  created: 'Tarea creada',
  updated: 'Tarea actualizada',
  completed: 'Tarea completada',
  reopened: 'Tarea reabierta',
  due_date_changed: 'Fecha limite cambiada',
  deleted: 'Tarea eliminada',
  note_added: 'Nota agregada',
  note_updated: 'Nota editada',
  note_deleted: 'Nota eliminada',
}

interface TaskHistoryTimelineProps {
  activities: TaskActivityWithUser[]
}

export function TaskHistoryTimeline({ activities }: TaskHistoryTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <RotateCcwIcon className="mx-auto h-12 w-12 mb-3 opacity-50" />
        <p>Sin historial</p>
        <p className="text-sm">Los cambios en esta tarea apareceran aqui.</p>
      </div>
    )
  }

  return (
    <Timeline>
      {activities.map((activity, index) => {
        const Icon = ACTION_ICONS[activity.action] || PencilIcon
        const label = ACTION_LABELS[activity.action] || activity.action

        return (
          <TimelineItem
            key={activity.id}
            icon={<Icon className="h-4 w-4" />}
            title={
              <span className="flex items-center gap-2">
                {label}
                {activity.user && (
                  <span className="text-muted-foreground text-xs flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {activity.user.email}
                  </span>
                )}
              </span>
            }
            date={formatRelativeDate(activity.created_at)}
            isLast={index === activities.length - 1}
          >
            <>
              {/* Show changes for update actions */}
              {activity.changes && Object.keys(activity.changes).length > 0 ? (
                <ActivityChanges changes={activity.changes} />
              ) : null}
              {/* Show note preview for note actions */}
              {activity.metadata?.preview ? (
                <p className="text-sm text-muted-foreground italic">
                  &quot;{String(activity.metadata.preview)}&quot;
                </p>
              ) : null}
            </>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}

// Helper component for displaying field changes
function ActivityChanges({ changes }: { changes: Record<string, { old: unknown; new: unknown }> }) {
  const [formatted, setFormatted] = React.useState<string[]>([])

  React.useEffect(() => {
    formatTaskChanges(changes).then(setFormatted)
  }, [changes])

  if (formatted.length === 0) return null

  return (
    <ul className="text-sm text-muted-foreground space-y-1">
      {formatted.map((change, i) => (
        <li key={i} className="font-mono text-xs">
          {change}
        </li>
      ))}
    </ul>
  )
}
