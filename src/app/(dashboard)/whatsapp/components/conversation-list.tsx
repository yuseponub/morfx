'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Bot, Plus } from 'lucide-react'
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
  /** Called when selected conversation data changes via realtime */
  onSelectedUpdated?: (conversation: ConversationWithDetails) => void
  /** Callback to expose refreshOrders function to parent */
  onRefreshOrdersReady?: (refreshOrders: () => Promise<void>) => void
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
  onSelectedUpdated,
  onRefreshOrdersReady,
}: ConversationListProps) {
  const [showNewModal, setShowNewModal] = useState(false)
  const [agentFilter, setAgentFilter] = useState<'all' | 'agent-attended'>('all')

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
    refreshOrders,
    getConversationById,
    markAsReadLocally,
  } = useConversations({
    workspaceId,
    initialConversations,
  })

  // Expose refreshOrders to parent
  useEffect(() => {
    onRefreshOrdersReady?.(refreshOrders)
  }, [onRefreshOrdersReady, refreshOrders])

  // Sync selected conversation when realtime updates arrive
  // This ensures the chat header shows current window status
  const prevConversationsRef = useRef(conversations)
  useEffect(() => {
    if (!selectedId || !onSelectedUpdated) return

    // Find selected in updated conversations
    const updated = getConversationById(selectedId)
    if (!updated) return

    // Find in previous conversations to compare
    const prev = prevConversationsRef.current.find(c => c.id === selectedId)

    // If key fields changed, notify parent
    if (prev && (
      prev.last_customer_message_at !== updated.last_customer_message_at ||
      prev.last_message_at !== updated.last_message_at ||
      prev.is_read !== updated.is_read ||
      JSON.stringify(prev.tags) !== JSON.stringify(updated.tags)
    )) {
      onSelectedUpdated(updated)
    }

    prevConversationsRef.current = conversations
  }, [conversations, selectedId, onSelectedUpdated, getConversationById])

  // Handle new conversation created
  const handleConversationCreated = async (conversationId: string) => {
    // Refresh the list to include the new conversation
    await refresh()
    // Select the new conversation
    onSelect(conversationId)
  }

  // Apply agent filter after existing search/filter logic
  const filteredConversations = useMemo(() => {
    if (agentFilter === 'all') return conversations
    // Show conversations where agent is explicitly enabled (true)
    // agent_conversational !== false means: true or null (inheriting global)
    return conversations.filter(c => c.agent_conversational !== false)
  }, [conversations, agentFilter])

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
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <InboxFilters value={filter} onChange={setFilter} />
          </div>
          {/* Agent filter toggle */}
          <Button
            variant={agentFilter === 'agent-attended' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={() => setAgentFilter(prev => prev === 'all' ? 'agent-attended' : 'all')}
            title={agentFilter === 'agent-attended' ? 'Mostrando solo con agente' : 'Filtrar por agente'}
          >
            <Bot className="h-4 w-4" />
          </Button>
        </div>
        <SearchInput value={query} onChange={setQuery} />
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading && !initialConversations.length ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <p className="text-muted-foreground">
              {agentFilter === 'agent-attended'
                ? 'No hay conversaciones con agente activo'
                : hasQuery
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
            {filteredConversations.map((conversation) => {
              // Get orders for this conversation's contact
              const contactOrders = conversation.contact?.id
                ? ordersByContact.get(conversation.contact.id) || []
                : []

              return (
                <ConversationItem
                  key={conversation.id}
                  conversation={conversation}
                  isSelected={selectedId === conversation.id}
                  onSelect={(id) => {
                    markAsReadLocally(id)
                    onSelect(id, conversation)
                  }}
                  orders={contactOrders}
                />
              )
            })}
          </div>
        )}
      </ScrollArea>

      {/* Results count when searching or filtering */}
      {(hasQuery || agentFilter === 'agent-attended') && filteredConversations.length > 0 && (
        <div className="p-2 border-t text-xs text-muted-foreground text-center">
          {filteredConversations.length} resultado{filteredConversations.length !== 1 && 's'}
        </div>
      )}
    </div>
  )
}
