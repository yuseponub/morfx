'use client'

// ============================================================================
// useMessages Hook
// Real-time message subscription for a conversation
// ============================================================================

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getConversationMessages } from '@/app/actions/conversations'
import type { Message, TextContent } from '@/lib/whatsapp/types'

// ============================================================================
// Types
// ============================================================================

interface UseMessagesOptions {
  conversationId: string | null
  limit?: number
}

interface UseMessagesReturn {
  /** Messages in chronological order (oldest first) */
  messages: Message[]
  /** Loading state */
  isLoading: boolean
  /** Load more (older) messages */
  loadMore: () => Promise<void>
  /** Whether there are more messages to load */
  hasMore: boolean
  /** Add an optimistic message for instant text display */
  addOptimisticMessage: (text: string) => void
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing messages with real-time updates.
 * Subscribes to new messages for the active conversation.
 *
 * @param options - Hook configuration
 * @returns Message state and controls
 *
 * @example
 * ```tsx
 * const { messages, isLoading, loadMore, hasMore } = useMessages({
 *   conversationId: selectedId,
 * })
 * ```
 */
export function useMessages({
  conversationId,
  limit = 50,
}: UseMessagesOptions): UseMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  // Fetch messages for conversation
  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      return
    }

    setIsLoading(true)
    try {
      const data = await getConversationMessages(conversationId, limit)
      setMessages(data)
      setHasMore(data.length >= limit)
    } catch (error) {
      console.error('Error fetching messages:', error)
      setMessages([])
    } finally {
      setIsLoading(false)
    }
  }, [conversationId, limit])

  // Load more (older) messages
  const loadMore = useCallback(async () => {
    if (!conversationId || !messages.length || !hasMore) return

    const oldestMessage = messages[0]
    if (!oldestMessage) return

    try {
      const olderMessages = await getConversationMessages(
        conversationId,
        limit,
        oldestMessage.timestamp
      )

      if (olderMessages.length > 0) {
        setMessages(prev => [...olderMessages, ...prev])
      }
      setHasMore(olderMessages.length >= limit)
    } catch (error) {
      console.error('Error loading more messages:', error)
    }
  }, [conversationId, messages, limit, hasMore])

  // Fetch on conversation change
  useEffect(() => {
    setHasMore(true)
    fetchMessages()
  }, [fetchMessages])

  // Add an optimistic message for instant text display (client-only)
  const addOptimisticMessage = useCallback((text: string) => {
    if (!conversationId) return

    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      workspace_id: '',
      wamid: null,
      direction: 'outbound',
      type: 'text',
      content: { body: text } as TextContent,
      status: 'sending' as Message['status'],
      status_timestamp: null,
      error_code: null,
      error_message: null,
      media_url: null,
      media_mime_type: null,
      media_filename: null,
      template_name: null,
      sent_by_agent: false,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, optimisticMsg])
  }, [conversationId])

  // Set up Supabase Realtime subscription
  useEffect(() => {
    if (!conversationId) return

    const supabase = createClient()

    // Subscribe to messages for this conversation
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('New message received:', payload)
          const newMessage = payload.new as Message

          // For outbound text messages, try to replace a matching optimistic message
          if (newMessage.direction === 'outbound' && newMessage.type === 'text') {
            const newBody = (newMessage.content as TextContent).body
            setMessages(prev => {
              const optimisticIndex = prev.findIndex(
                msg => msg.id.startsWith('optimistic-') &&
                  msg.type === 'text' &&
                  (msg.content as TextContent).body === newBody
              )
              if (optimisticIndex !== -1) {
                // Replace optimistic message with real one
                return prev.map((msg, i) => i === optimisticIndex ? newMessage : msg)
              }
              // No matching optimistic — append as normal
              return [...prev, newMessage]
            })
          } else {
            // Inbound or non-text — append as before
            setMessages(prev => [...prev, newMessage])
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('Message updated:', payload)
          // Update message in array (for status changes)
          const updatedMessage = payload.new as Message
          setMessages(prev =>
            prev.map(msg =>
              msg.id === updatedMessage.id ? updatedMessage : msg
            )
          )
        }
      )
      .subscribe((status, err) => {
        console.log('Realtime messages status:', status, err || '')
      })

    // Cleanup on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  return {
    messages,
    isLoading,
    loadMore,
    hasMore,
    addOptimisticMessage,
  }
}
