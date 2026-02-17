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
//
// PERFORMANCE (standalone/whatsapp-performance plan 01):
// - 1 consolidated realtime channel (down from 4)
// - Surgical state updates on conversation UPDATE (no full refetch)
// - Targeted tag fetch on conversation_tags change (not full list refetch)
// - Debounced safety-net full refetch as eventual consistency backup
// ============================================================================

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Fuse, { IFuseOptions } from 'fuse.js'
import { createClient } from '@/lib/supabase/client'
import { getConversations, getConversation, getConversationTags } from '@/app/actions/conversations'
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
// Helpers
// ============================================================================

/** Sort conversations by last_message_at descending (newest first) */
function sortByLastMessage(convs: ConversationWithDetails[]): ConversationWithDetails[] {
  return [...convs].sort((a, b) =>
    new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime()
  )
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

  // ---- Refs for avoiding stale closures in realtime callbacks ----

  // Track latest conversations state (used by realtime handlers)
  const conversationsRef = useRef<ConversationWithDetails[]>(conversations)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])

  // Track contact IDs for orders refresh (used by orders handler)
  const contactIdsRef = useRef<string[]>([])
  useEffect(() => {
    contactIdsRef.current = conversations
      .map(c => c.contact?.id)
      .filter((id): id is string => !!id)
  }, [conversations])

  // Track whether initial load has completed (for orders loading)
  const hasInitiallyLoadedRef = useRef(false)

  // Safety-net debounced full refetch timer
  const safetyRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Load orders for all contacts in batch — only on initial conversations load
  // Orders are separate data that don't change when conversations update.
  // They refresh only on: 1) initial load, 2) explicit refreshOrders() call (realtime order INSERT, stage change)
  useEffect(() => {
    // Only trigger on transition from loading to loaded (initial load complete)
    if (isLoading || hasInitiallyLoadedRef.current) return
    if (conversations.length === 0) return

    hasInitiallyLoadedRef.current = true

    async function loadOrders() {
      const contactIds = conversations
        .map(c => c.contact?.id)
        .filter((id): id is string => !!id)

      if (contactIds.length === 0) {
        setOrdersByContact(new Map())
        return
      }

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

    loadOrders()
  }, [conversations, isLoading])

  // Reset hasInitiallyLoaded when filter changes (so orders reload for new filter set)
  useEffect(() => {
    hasInitiallyLoadedRef.current = false
  }, [filter, currentUserId])

  // Schedule a debounced safety-net full refetch (30s after last surgical update)
  // Ensures eventual consistency if any surgical update was incomplete
  const scheduleSafetyRefetch = useCallback(() => {
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    safetyRefetchTimer.current = setTimeout(() => {
      fetchConversations()
    }, 30_000)
  }, [fetchConversations])

  // ============================================================================
  // Consolidated Realtime Channel
  // Single channel with 4 .on() listeners replaces 4 separate channels
  // ============================================================================
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    const channel = supabase
      .channel(`inbox:${workspaceId}`)
      // ---- conversations table: surgical updates ----
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async (payload) => {
          const { eventType } = payload
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRow = payload.new as Record<string, any>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRow = payload.old as Record<string, any>

          if (eventType === 'UPDATE') {
            // Surgical update: spread flat columns from payload onto existing conversation
            // Preserves join data (contact, tags, contactTags) which aren't in the payload
            setConversations(prev => {
              const idx = prev.findIndex(c => c.id === newRow.id)
              if (idx === -1) return prev // Not in our list (filtered out by status/assignment)

              const existing = prev[idx]
              const updated = [...prev]
              updated[idx] = {
                ...existing,
                // Only spread flat conversation columns, preserving join data
                ...Object.fromEntries(
                  Object.entries(newRow).filter(([key]) =>
                    key !== 'contact' && key !== 'tags' && key !== 'contactTags' && key !== 'conversation_tags'
                  )
                ),
              } as ConversationWithDetails

              return sortByLastMessage(updated)
            })
            scheduleSafetyRefetch()
          } else if (eventType === 'INSERT') {
            // New conversation — need contact + tag join data, fetch just this one
            const conv = await getConversation(newRow.id)
            if (conv) {
              setConversations(prev => {
                // Avoid duplicates (in case safety refetch already added it)
                if (prev.some(c => c.id === conv.id)) return prev
                return sortByLastMessage([conv, ...prev])
              })
            }
            scheduleSafetyRefetch()
          } else if (eventType === 'DELETE') {
            setConversations(prev => prev.filter(c => c.id !== oldRow.id))
            scheduleSafetyRefetch()
          }
        }
      )
      // ---- conversation_tags table: targeted tag fetch ----
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_tags',
        },
        async (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const convId = (payload.new as any)?.conversation_id || (payload.old as any)?.conversation_id
          if (!convId) return

          // Only process if this conversation is in our list
          const isOurs = conversationsRef.current.some(c => c.id === convId)
          if (!isOurs) return

          // Fetch only the tags for this specific conversation
          const tags = await getConversationTags(convId)
          setConversations(prev =>
            prev.map(c => c.id === convId ? { ...c, tags } : c)
          )
          scheduleSafetyRefetch()
        }
      )
      // ---- contact_tags table: debounced full refetch (rare event) ----
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_tags',
        },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contactId = (payload.new as any)?.contact_id || (payload.old as any)?.contact_id
          if (!contactId) return

          // Only process if any conversation in our list has this contact
          const hasAffected = conversationsRef.current.some(c => c.contact?.id === contactId)
          if (!hasAffected) return

          // Contact tag changes are rare — trigger debounced full refetch
          // This is simpler and acceptable for an infrequent event
          scheduleSafetyRefetch()
        }
      )
      // ---- orders table: refresh order emojis ----
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async () => {
          // Use ref to get latest contact IDs (avoids stale closure)
          const ids = contactIdsRef.current
          if (ids.length === 0) return
          const uniqueIds = [...new Set(ids)]
          try {
            const orders = await getOrdersForContacts(uniqueIds)
            setOrdersByContact(orders)
          } catch (error) {
            console.error('Error refreshing orders:', error)
          }
        }
      )
      .subscribe((status, err) => {
        if (err) console.error('Realtime inbox channel error:', err)
      })

    // Cleanup on unmount or workspaceId change
    return () => {
      supabase.removeChannel(channel)
      if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    }
  }, [workspaceId, scheduleSafetyRefetch])

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
  // Uses ref to avoid stale closure
  const refreshOrders = useCallback(async () => {
    const ids = contactIdsRef.current
    if (ids.length === 0) return

    const uniqueIds = [...new Set(ids)]
    try {
      const orders = await getOrdersForContacts(uniqueIds)
      setOrdersByContact(orders)
    } catch (error) {
      console.error('Error refreshing orders:', error)
    }
  }, [])

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
