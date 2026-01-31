'use client'

import * as React from 'react'
import {
  EditIcon,
  HistoryIcon,
  MessageSquareIcon,
  PlusIcon,
  TagIcon,
  TrashIcon,
  UserIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Timeline, TimelineItem, formatRelativeDate } from '@/components/ui/timeline'
import {
  formatChanges,
  getActionDescription,
} from '@/app/actions/activity'
import type { ContactActivityWithUser } from '@/lib/custom-fields/types'

interface ActivityTimelineProps {
  contactId: string
  initialActivity: ContactActivityWithUser[]
}

// Activity filter types
type ActivityFilter = 'all' | 'edits' | 'notes' | 'tags'

// Map filter types to action values
const FILTER_ACTIONS: Record<ActivityFilter, string[] | null> = {
  all: null,
  edits: ['created', 'updated', 'deleted'],
  notes: ['note_added', 'note_updated', 'note_deleted'],
  tags: ['tag_added', 'tag_removed'],
}

// Icons for each action type
function getActionIcon(action: string): React.ReactNode {
  switch (action) {
    case 'created':
      return <PlusIcon className="h-4 w-4" />
    case 'updated':
      return <EditIcon className="h-4 w-4" />
    case 'deleted':
      return <TrashIcon className="h-4 w-4" />
    case 'note_added':
    case 'note_updated':
    case 'note_deleted':
      return <MessageSquareIcon className="h-4 w-4" />
    case 'tag_added':
    case 'tag_removed':
      return <TagIcon className="h-4 w-4" />
    default:
      return <HistoryIcon className="h-4 w-4" />
  }
}

export function ActivityTimeline({
  initialActivity,
}: ActivityTimelineProps) {
  const [filter, setFilter] = React.useState<ActivityFilter>('all')

  // Filter activities based on selected filter
  const filteredActivity = React.useMemo(() => {
    if (filter === 'all') return initialActivity

    const allowedActions = FILTER_ACTIONS[filter]
    if (!allowedActions) return initialActivity

    return initialActivity.filter(a => allowedActions.includes(a.action))
  }, [initialActivity, filter])

  // Render activity content based on action type
  const renderActivityContent = (activity: ContactActivityWithUser) => {
    // For 'updated' action, show diff
    if (activity.action === 'updated' && activity.changes) {
      const changes = formatChanges(activity.changes)
      if (changes.length === 0) return null

      return (
        <div className="mt-1 space-y-1">
          {changes.map((change, i) => (
            <p key={i} className="text-xs text-muted-foreground font-mono">
              {change}
            </p>
          ))}
        </div>
      )
    }

    // For note events, show preview
    if (activity.action.startsWith('note_') && activity.metadata?.preview) {
      return (
        <p className="mt-1 text-xs text-muted-foreground italic">
          &quot;{String(activity.metadata.preview)}
          {String(activity.metadata.preview).length >= 100 && '...'}
          &quot;
        </p>
      )
    }

    // For tag events, show tag name
    if ((activity.action === 'tag_added' || activity.action === 'tag_removed') && activity.metadata) {
      const tagName = activity.metadata.tag_name as string | undefined
      const tagColor = activity.metadata.tag_color as string | undefined

      if (tagName) {
        return (
          <div className="mt-1">
            <Badge
              variant="secondary"
              style={tagColor ? { backgroundColor: tagColor + '20', color: tagColor } : undefined}
            >
              {tagName}
            </Badge>
          </div>
        )
      }
    }

    return null
  }

  return (
    <div className="space-y-4">
      {/* Filter toggles */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={filter === 'all' ? 'default' : 'outline'}
          onClick={() => setFilter('all')}
        >
          Todos
        </Button>
        <Button
          size="sm"
          variant={filter === 'edits' ? 'default' : 'outline'}
          onClick={() => setFilter('edits')}
        >
          <EditIcon className="mr-1 h-3 w-3" />
          Ediciones
        </Button>
        <Button
          size="sm"
          variant={filter === 'notes' ? 'default' : 'outline'}
          onClick={() => setFilter('notes')}
        >
          <MessageSquareIcon className="mr-1 h-3 w-3" />
          Notas
        </Button>
        <Button
          size="sm"
          variant={filter === 'tags' ? 'default' : 'outline'}
          onClick={() => setFilter('tags')}
        >
          <TagIcon className="mr-1 h-3 w-3" />
          Tags
        </Button>
      </div>

      {/* Activity timeline */}
      {filteredActivity.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <HistoryIcon className="mx-auto h-12 w-12 mb-3 opacity-50" />
          <p>Sin actividad</p>
          <p className="text-sm">
            {filter === 'all'
              ? 'Este contacto no tiene historial de actividad.'
              : `No hay actividad de tipo "${filter === 'edits' ? 'ediciones' : filter === 'notes' ? 'notas' : 'tags'}".`}
          </p>
        </div>
      ) : (
        <Timeline>
          {filteredActivity.map((activity, index) => (
            <TimelineItem
              key={activity.id}
              icon={getActionIcon(activity.action)}
              title={getActionDescription(activity.action)}
              description={
                activity.user ? (
                  <span className="flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {activity.user.email}
                  </span>
                ) : (
                  <span className="text-xs">Sistema</span>
                )
              }
              date={formatRelativeDate(activity.created_at)}
              isLast={index === filteredActivity.length - 1}
            >
              {renderActivityContent(activity)}
            </TimelineItem>
          ))}
        </Timeline>
      )}

      {/* Load more indicator (if we have exactly 50 items, there might be more) */}
      {filteredActivity.length === 50 && (
        <p className="text-center text-sm text-muted-foreground">
          Mostrando los ultimos 50 eventos
        </p>
      )}
    </div>
  )
}
