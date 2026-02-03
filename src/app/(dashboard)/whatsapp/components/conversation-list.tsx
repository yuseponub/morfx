'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useConversations } from '@/hooks/use-conversations'
import { InboxFilters } from './filters/inbox-filters'
import { SearchInput } from './filters/search-input'
import { ConversationItem } from './conversation-item'
import { AvailabilityToggle } from './availability-toggle'
import { NewConversationModal } from './new-conversation-modal'
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
  const [showNewModal, setShowNewModal] = useState(false)

  const {
    conversations,
    ordersByContact,
    query,
    setQuery,
    filter,
    setFilter,
    isLoading,
    hasQuery,
    refresh,
  } = useConversations({
    workspaceId,
    initialConversations,
  })

  // Handle new conversation created
  const handleConversationCreated = async (conversationId: string) => {
    // Refresh the list to include the new conversation
    await refresh()
    // Select the new conversation
    onSelect(conversationId)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with new button and availability toggle */}
      <div className="px-3 py-2 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Conversaciones</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setShowNewModal(true)}
            title="Nueva conversacion"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <AvailabilityToggle />
      </div>

      {/* New conversation modal */}
      <NewConversationModal
        open={showNewModal}
        onOpenChange={setShowNewModal}
        onConversationCreated={handleConversationCreated}
      />

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
            {conversations.map((conversation) => {
              // Get orders for this conversation's contact
              const contactOrders = conversation.contact?.id
                ? ordersByContact.get(conversation.contact.id) || []
                : []

              return (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={selectedId === conversation.id}
                  onSelect={(id) => onSelect(id, conversation)}
                  orders={contactOrders}
                />
              )
            })}
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
