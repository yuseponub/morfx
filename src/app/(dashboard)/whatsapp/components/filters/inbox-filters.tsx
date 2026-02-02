'use client'

import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal } from 'lucide-react'
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
const mainFilters: { value: ConversationFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'unread', label: 'No leidos' },
  { value: 'archived', label: 'Archivados' },
]

const moreFilters: { value: ConversationFilter; label: string }[] = [
  { value: 'mine', label: 'Mis chats' },
  { value: 'unassigned', label: 'Sin asignar' },
]

/**
 * Tab-style filter for inbox conversations.
 * Main filters as tabs + dropdown for secondary filters.
 */
export function InboxFilters({ value, onChange }: InboxFiltersProps) {
  // Check if current value is in "more" filters
  const isMoreFilterActive = moreFilters.some(f => f.value === value)
  const activeMoreFilter = moreFilters.find(f => f.value === value)

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {/* Main filter tabs */}
      {mainFilters.map((filter) => (
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

      {/* More filters dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              'px-2 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1',
              isMoreFilterActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            {isMoreFilterActive ? activeMoreFilter?.label : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {moreFilters.map((filter) => (
            <DropdownMenuItem
              key={filter.value}
              onClick={() => onChange(filter.value)}
              className={cn(
                value === filter.value && 'bg-accent'
              )}
            >
              {filter.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
