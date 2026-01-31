'use client'

import { useRef, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMessages } from '@/hooks/use-messages'
import { ChatHeader } from './chat-header'
import { MessageBubble } from './message-bubble'
import { MessageInput } from './message-input'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'
import { differenceInHours } from 'date-fns'

interface ChatViewProps {
  conversationId: string | null
  conversation: ConversationWithDetails | null
  onTogglePanel: () => void
}

/**
 * Chat view with virtualized message list.
 * Center column of the 3-column layout.
 */
export function ChatView({
  conversationId,
  conversation,
  onTogglePanel,
}: ChatViewProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const scrolledToBottomRef = useRef(true)

  const { messages, isLoading, loadMore, hasMore } = useMessages({
    conversationId,
    limit: 50,
  })

  // Calculate 24h window status
  const isWindowOpen = (() => {
    if (!conversation?.last_customer_message_at) return false
    const hoursSince = differenceInHours(
      new Date(),
      new Date(conversation.last_customer_message_at)
    )
    return hoursSince < 24
  })()

  // Virtual list setup
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrolledToBottomRef.current && messages.length > 0) {
      virtualizer.scrollToIndex(messages.length - 1, { align: 'end' })
    }
  }, [messages.length, virtualizer])

  // Track scroll position to determine if at bottom
  useEffect(() => {
    const container = parentRef.current
    if (!container) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container
      scrolledToBottomRef.current = scrollHeight - scrollTop - clientHeight < 50
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  // Empty state
  if (!conversationId || !conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="text-center text-muted-foreground">
          <div className="mb-4 text-6xl opacity-20">💬</div>
          <p className="text-lg font-medium">Selecciona una conversacion</p>
          <p className="text-sm">Elige una conversacion del panel izquierdo</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Chat header */}
      <ChatHeader
        conversation={conversation}
        onTogglePanel={onTogglePanel}
      />

      {/* Messages container with geometric pattern background */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto chat-background"
        style={{
          contain: 'strict',
        }}
      >
        {/* Load more indicator */}
        {hasMore && (
          <div className="text-center py-4">
            <button
              onClick={loadMore}
              className="text-sm text-muted-foreground hover:text-foreground"
              disabled={isLoading}
            >
              {isLoading ? 'Cargando...' : 'Cargar mensajes anteriores'}
            </button>
          </div>
        )}

        {/* Virtualized message list */}
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MessageBubble
                  message={message}
                  isOwn={message.direction === 'outbound'}
                />
              </div>
            )
          })}
        </div>

        {/* Empty messages state */}
        {messages.length === 0 && !isLoading && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center text-muted-foreground">
              <p className="text-sm">No hay mensajes aun</p>
            </div>
          </div>
        )}
      </div>

      {/* Message input */}
      <MessageInput
        conversationId={conversationId}
        isWindowOpen={isWindowOpen}
        contact={conversation.contact ? {
          id: conversation.contact.id,
          name: conversation.contact.name,
          phone: conversation.contact.phone,
          city: conversation.contact.city,
        } : null}
        onSend={() => {
          // Scroll to bottom after sending
          scrolledToBottomRef.current = true
        }}
      />

      {/* CSS for chat background pattern */}
      <style jsx>{`
        .chat-background {
          background-color: hsl(var(--background));
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  )
}
