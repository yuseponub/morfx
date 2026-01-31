'use client'

// ============================================================================
// useConversations Hook
// Real-time conversation subscription with fuzzy search
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import Fuse, { IFuseOptions } from 'fuse.js'
import { createClient } from '@/lib/supabase/client'
import { getConversations } from '@/app/actions/conversations'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

// ============================================================================
// Types
// ============================================================================

export type ConversationFilter = 'all' | 'unread' | 'archived'

interface UseConversationsOptions {
  workspaceId: string
  initialConversations?: ConversationWithDetails[]
}

interface UseConversationsReturn {
  /** All conversations (filtered by search and status) */
  conversations: ConversationWithDetails[]
  /** Search query */
  query: string
  /** Update search query */
  setQuery: (query: string) => void
  /** Filter status */
  filter: ConversationFilter
  /** Update filter */
  setFilter: (filter: ConversationFilter) => void
  /** Loading state */
  isLoading: boolean
  /** Whether there's an active search */
  hasQuery: boolean
  /** Refresh conversations */
  refresh: () => Promise<void>
}

// ============================================================================
// Fuse.js Configuration for Conversations
// ============================================================================

const conversationSearchOptions: IFuseOptions<ConversationWithDetails> = {
  keys: [
    { name: 'contact.name', weight: 2 },       // Contact name (highest priority)
    { name: 'phone', weight: 1.5 },            // Phone number
    { name: 'last_message_preview', weight: 1 }, // Last message content
    { name: 'tags.name', weight: 0.8 },        // Tag names
  ],
  threshold: 0.4,           // Balance between fuzzy and precision
  distance: 100,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
  includeScore: true,
  findAllMatches: true,
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing conversation list with real-time updates and fuzzy search.
 *
 * @param options - Hook configuration
 * @returns Conversation state and controls
 *
 * @example
 * ```tsx
 * const { conversations, query, setQuery, filter, setFilter } = useConversations({
 *   workspaceId: 'xxx',
 *   initialConversations: [],
 * })
 * ```
 */
export function useConversations({
  workspaceId,
  initialConversations = [],
}: UseConversationsOptions): UseConversationsReturn {
  // State
  const [conversations, setConversations] = useState<ConversationWithDetails[]>(initialConversations)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ConversationFilter>('all')
  const [isLoading, setIsLoading] = useState(!initialConversations.length)

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setIsLoading(true)
    try {
      // Get filter params based on current filter
      const filterParams = filter === 'archived'
        ? { status: 'archived' as const }
        : filter === 'unread'
          ? { status: 'active' as const, is_read: false }
          : { status: 'active' as const }

      const data = await getConversations(filterParams)
      setConversations(data)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  // Initial fetch
  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  // Set up Supabase Realtime subscription
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    // Subscribe to conversations table changes
    const channel = supabase
      .channel(`conversations:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          console.log('Conversation change received:', payload.eventType)
          // Reload conversations on any change
          await fetchConversations()
        }
      )
      .subscribe()

    // Cleanup on unmount
    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, fetchConversations])

  // Memoized Fuse instance
  const fuse = useMemo(
    () => new Fuse(conversations, conversationSearchOptions),
    [conversations]
  )

  // Apply search filter
  const filteredConversations = useMemo(() => {
    const trimmed = query.trim()

    if (!trimmed) {
      return conversations
    }

    return fuse.search(trimmed).map(result => result.item)
  }, [fuse, query, conversations])

  return {
    conversations: filteredConversations,
    query,
    setQuery,
    filter,
    setFilter,
    isLoading,
    hasQuery: query.trim().length > 0,
    refresh: fetchConversations,
  }
}
