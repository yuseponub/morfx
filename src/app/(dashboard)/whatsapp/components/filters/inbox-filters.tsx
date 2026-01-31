'use client'

import { cn } from '@/lib/utils'
import type { ConversationFilter } from '@/hooks/use-conversations'

interface InboxFiltersProps {
  value: ConversationFilter
  onChange: (value: ConversationFilter) => void
}

const filters: { value: ConversationFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'unread', label: 'No leidos' },
  { value: 'archived', label: 'Archivados' },
]

/**
 * Tab-style filter for inbox conversations.
 * Matches Phase 6 Kanban tabs aesthetic.
 */
export function InboxFilters({ value, onChange }: InboxFiltersProps) {
  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {filters.map((filter) => (
        <button
          key={filter.value}
          onClick={() => onChange(filter.value)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
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
