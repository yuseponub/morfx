'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import { useConversations } from '@/hooks/use-conversations'
import { InboxFilters } from './filters/inbox-filters'
import { SearchInput } from './filters/search-input'
import { ConversationItem } from './conversation-item'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

interface ConversationListProps {
  workspaceId: string
  initialConversations: ConversationWithDetails[]
  selectedId: string | null
  onSelect: (id: string | null, conversation?: ConversationWithDetails) => void
}

/**
 * Conversation list with search and filters.
 * Uses real-time subscription via useConversations hook.
 */
export function ConversationList({
  workspaceId,
  initialConversations,
  selectedId,
  onSelect,
}: ConversationListProps) {
  const {
    conversations,
    query,
    setQuery,
    filter,
    setFilter,
    isLoading,
    hasQuery,
  } = useConversations({
    workspaceId,
    initialConversations,
  })

  return (
    <div className="flex flex-col h-full">
      {/* Filters */}
      <div className="p-3 border-b space-y-3">
        <InboxFilters value={filter} onChange={setFilter} />
        <SearchInput value={query} onChange={setQuery} />
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading && !initialConversations.length ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <p className="text-muted-foreground">
              {hasQuery
                ? 'No se encontraron conversaciones'
                : filter === 'unread'
                  ? 'No hay mensajes sin leer'
                  : filter === 'mine'
                    ? 'No tienes chats asignados'
                    : filter === 'unassigned'
                      ? 'No hay chats sin asignar'
                      : filter === 'archived'
                        ? 'No hay conversaciones archivadas'
                        : 'No hay conversaciones aun'
              }
            </p>
          </div>
        ) : (
          <div>
            {conversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedId === conversation.id}
                onSelect={(id) => onSelect(id, conversation)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Results count when searching */}
      {hasQuery && conversations.length > 0 && (
        <div className="p-2 border-t text-xs text-muted-foreground text-center">
          {conversations.length} resultado{conversations.length !== 1 && 's'}
        </div>
      )}
    </div>
  )
}
