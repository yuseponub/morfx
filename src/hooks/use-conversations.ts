'use client'

// ============================================================================
// useConversations Hook
// Real-time conversation subscription with fuzzy search
//
// VISIBILITY RULES (enforced by RLS at database level):
// - Managers (owner/admin) see all workspace conversations
// - Agents see only conversations assigned to them or unassigned
//
// No additional filtering needed in this hook - RLS handles visibility.
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react'
import Fuse, { IFuseOptions } from 'fuse.js'
import { createClient } from '@/lib/supabase/client'
import { getConversations } from '@/app/actions/conversations'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

// ============================================================================
// Types
// ============================================================================

/**
 * Filter types for conversation inbox.
 * - 'all': All visible conversations (RLS determines actual visibility)
 * - 'unread': Only unread conversations
 * - 'mine': Only conversations assigned to current user
 * - 'unassigned': Only unassigned conversations
 * - 'archived': Only archived conversations
 */
export type ConversationFilter = 'all' | 'unread' | 'mine' | 'unassigned' | 'archived'

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Get current user ID for 'mine' filter
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUserId(user?.id || null)
    })
  }, [])

  // Fetch conversations
  // RLS handles visibility at DB level (managers see all, agents see assigned+unassigned)
  // These filters further refine the results within what RLS allows
  const fetchConversations = useCallback(async () => {
    setIsLoading(true)
    try {
      // Build filter params based on current filter
      // Note: RLS already limits visibility - these filters refine within visible set
      let filterParams: {
        status?: 'active' | 'archived'
        is_read?: boolean
        assigned_to?: string | null
      } = {}

      switch (filter) {
        case 'archived':
          filterParams = { status: 'archived' }
          break
        case 'unread':
          filterParams = { status: 'active', is_read: false }
          break
        case 'mine':
          // Show only conversations assigned to current user
          filterParams = { status: 'active', assigned_to: currentUserId || undefined }
          break
        case 'unassigned':
          // Show only unassigned conversations
          filterParams = { status: 'active', assigned_to: null }
          break
        default: // 'all'
          filterParams = { status: 'active' }
      }

      const data = await getConversations(filterParams)
      setConversations(data)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }, [filter, currentUserId])

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
      .subscribe((status, err) => {
        console.log('Realtime conversations status:', status, err || '')
      })

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
