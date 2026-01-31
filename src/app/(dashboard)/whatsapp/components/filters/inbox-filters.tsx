'use client'

import { cn } from '@/lib/utils'
import type { ConversationFilter } from '@/hooks/use-conversations'

interface InboxFiltersProps {
  value: ConversationFilter
  onChange: (value: ConversationFilter) => void
}

/**
 * Filter options for inbox conversations.
 *
 * Note: Visibility is also controlled by RLS at the database level:
 * - Managers (owner/admin) see all workspace conversations
 * - Agents see only assigned to self or unassigned
 *
 * These filters work within the RLS-visible set:
 * - 'all': All visible conversations
 * - 'unread': Only unread conversations
 * - 'mine': Only conversations assigned to current user
 * - 'unassigned': Only unassigned conversations
 * - 'archived': Only archived conversations
 */
const filters: { value: ConversationFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'unread', label: 'No leidos' },
  { value: 'mine', label: 'Mis chats' },
  { value: 'unassigned', label: 'Sin asignar' },
  { value: 'archived', label: 'Archivados' },
]

/**
 * Tab-style filter for inbox conversations.
 * Matches Phase 6 Kanban tabs aesthetic.
 */
export function InboxFilters({ value, onChange }: InboxFiltersProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg overflow-x-auto">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onChange(filter.value)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap',
            value === filter.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
          )}
        >
          {filter.label}
        </button>
      ))}
    </div>
  )
}
