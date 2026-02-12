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
import { getOrdersForContacts } from '@/app/actions/whatsapp'
import type { ConversationWithDetails, OrderSummary } from '@/lib/whatsapp/types'

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
  /** Orders mapped by contact ID */
  ordersByContact: Map<string, OrderSummary[]>
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
  /** Loading orders state */
  isLoadingOrders: boolean
  /** Whether there's an active search */
  hasQuery: boolean
  /** Refresh conversations */
  refresh: () => Promise<void>
  /** Refresh orders only (for emoji indicator updates) */
  refreshOrders: () => Promise<void>
  /** Get a specific conversation by ID (always returns latest data) */
  getConversationById: (id: string) => ConversationWithDetails | undefined
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
  const [ordersByContact, setOrdersByContact] = useState<Map<string, OrderSummary[]>>(new Map())
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ConversationFilter>('all')
  const [isLoading, setIsLoading] = useState(!initialConversations.length)
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
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

  // Load orders for all contacts in batch after conversations load
  useEffect(() => {
    async function loadOrders() {
      // Get unique contact IDs from conversations
      const contactIds = conversations
        .map(c => c.contact?.id)
        .filter((id): id is string => !!id)

      if (contactIds.length === 0) {
        setOrdersByContact(new Map())
        return
      }

      // Deduplicate
      const uniqueContactIds = [...new Set(contactIds)]

      setIsLoadingOrders(true)
      try {
        const orders = await getOrdersForContacts(uniqueContactIds)
        setOrdersByContact(orders)
      } catch (error) {
        console.error('Error loading orders:', error)
      } finally {
        setIsLoadingOrders(false)
      }
    }

    // Only load orders after initial conversations load
    if (!isLoading && conversations.length > 0) {
      loadOrders()
    }
  }, [conversations, isLoading])

  // Set up Supabase Realtime subscriptions
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    // Subscribe to conversations table changes
    const conversationsChannel = supabase
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

    // Subscribe to conversation_tags changes (for tag sync)
    // Note: conversation_tags is a junction table without workspace_id
    // RLS ensures we only see tags for conversations in our workspace
    const tagsChannel = supabase
      .channel(`conversation_tags:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_tags',
        },
        async () => {
          console.log('Conversation tags change received')
          await fetchConversations()
        }
      )
      .subscribe()

    // Subscribe to contact_tags changes (for inherited tag sync)
    const contactTagsChannel = supabase
      .channel(`contact_tags:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_tags',
        },
        async () => {
          console.log('Contact tags change received')
          await fetchConversations()
        }
      )
      .subscribe()

    // Subscribe to orders changes (for emoji indicators in conversation list)
    const ordersChannel = supabase
      .channel(`orders:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async () => {
          // Re-fetch orders for emoji indicators
          const contactIds = conversations
            .map(c => c.contact?.id)
            .filter((id): id is string => !!id)
          if (contactIds.length === 0) return
          const uniqueContactIds = [...new Set(contactIds)]
          try {
            const orders = await getOrdersForContacts(uniqueContactIds)
            setOrdersByContact(orders)
          } catch (error) {
            console.error('Error refreshing orders:', error)
          }
        }
      )
      .subscribe()

    // Cleanup on unmount
    return () => {
      supabase.removeChannel(conversationsChannel)
      supabase.removeChannel(tagsChannel)
      supabase.removeChannel(contactTagsChannel)
      supabase.removeChannel(ordersChannel)
    }
  }, [workspaceId, fetchConversations, conversations])

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

  // Get conversation by ID from the unfiltered list
  const getConversationById = useCallback((id: string) => {
    return conversations.find(c => c.id === id)
  }, [conversations])

  // Refresh orders only (for emoji indicator updates after stage change)
  const refreshOrders = useCallback(async () => {
    const contactIds = conversations
      .map(c => c.contact?.id)
      .filter((id): id is string => !!id)

    if (contactIds.length === 0) return

    const uniqueContactIds = [...new Set(contactIds)]
    try {
      const orders = await getOrdersForContacts(uniqueContactIds)
      setOrdersByContact(orders)
    } catch (error) {
      console.error('Error refreshing orders:', error)
    }
  }, [conversations])

  return {
    conversations: filteredConversations,
    ordersByContact,
    query,
    setQuery,
    filter,
    setFilter,
    isLoading,
    isLoadingOrders,
    hasQuery: query.trim().length > 0,
    refresh: fetchConversations,
    refreshOrders,
    getConversationById,
  }
}
