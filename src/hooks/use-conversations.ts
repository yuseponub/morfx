'use client'

// ============================================================================
// useConversations Hook
// Real-time conversation subscription with KEYSET PAGINATION (F-1)
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
// - Targeted tag fetch on contact_tags change (not full list refetch)
// - Debounced safety-net page-1 soft refetch as eventual consistency backup
//
// PAGINATION (standalone/whatsapp-inbox-reliability plan 05, F-1):
// - Keyset pages of 50 via getConversationsPage (get_conversations_page RPC)
// - SSR seeds page 1 (initialConversations + initialCursor) — NO mount
//   double-fetch (H-2 fix, RESEARCH Q10)
// - Search + ALL filters (unread/mine/unassigned/unanswered/tag/agent) are
//   server-side RPC params (D-05/D-06) — Fuse removed entirely
// - Orders enrichment scoped to loaded pages' contact ids only (D-09)
// - mounted-ref guard on every setState after await (D-17 — AbortController
//   does NOT cancel server actions; zombie fetches no longer land on /tareas)
// - Realtime UPDATE for rows NOT in loaded pages: fetch-by-id + insert by sort
//   when it belongs in the loaded window; ignore when below it (D-07)
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeReconnect } from '@/hooks/use-realtime-reconnect'
import { getConversationsPage, getConversation, getTagsForContact } from '@/app/actions/conversations'
import { getOrdersForContacts } from '@/app/actions/whatsapp'
import type {
  ConversationWithDetails,
  ConversationPageFilters,
  OrderSummary,
} from '@/lib/whatsapp/types'

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
export type ConversationFilter = 'all' | 'unread' | 'mine' | 'unassigned' | 'archived' | 'unanswered'
export type ConversationSort = 'last_message' | 'last_customer_message'
/** Agent filter (formerly client-side in conversation-list — now an RPC param, Q4/P4) */
export type ConversationAgentFilter = 'all' | 'agent-attended'

interface UseConversationsOptions {
  workspaceId: string
  initialConversations?: ConversationWithDetails[]
  /** Opaque keyset cursor for the SSR first page (page.tsx passes it — F-1) */
  initialCursor?: string | null
  /** Whether more pages exist after the SSR first page */
  initialHasMore?: boolean
}

interface UseConversationsReturn {
  /** Loaded conversations (already filtered server-side) */
  conversations: ConversationWithDetails[]
  /** Orders mapped by contact ID (scoped to loaded pages — D-09) */
  ordersByContact: Map<string, OrderSummary[]>
  /** Search query (server-side, debounced) */
  query: string
  /** Update search query */
  setQuery: (query: string) => void
  /** Filter status */
  filter: ConversationFilter
  /** Update filter */
  setFilter: (filter: ConversationFilter) => void
  /** Tag filter (server-side RPC param) */
  tagFilter: string | null
  /** Update tag filter */
  setTagFilter: (tagId: string | null) => void
  /** Agent filter (server-side RPC param) */
  agentFilter: ConversationAgentFilter
  /** Update agent filter */
  setAgentFilter: React.Dispatch<React.SetStateAction<ConversationAgentFilter>>
  /** Loading state (page-1 fetch) */
  isLoading: boolean
  /** Loading the NEXT page (infinite scroll) */
  isLoadingMore: boolean
  /** Whether more pages exist below the loaded window */
  hasMore: boolean
  /** Load the next keyset page (virtualizer bottom sentinel calls this) */
  loadMore: () => Promise<void>
  /** Loading orders state */
  isLoadingOrders: boolean
  /** Whether there's an active search */
  hasQuery: boolean
  /** Refresh conversations (replaces loaded pages with fresh page 1) */
  refresh: () => Promise<void>
  /** Refresh orders only (for emoji indicator updates) */
  refreshOrders: () => Promise<void>
  /** Get a specific conversation by ID (always returns latest data) */
  getConversationById: (id: string) => ConversationWithDetails | undefined
  /** Optimistically mark a conversation as read in local state */
  markAsReadLocally: (conversationId: string) => void
  /** Current sort mode */
  sortMode: ConversationSort
  /** Update sort mode */
  setSortMode: React.Dispatch<React.SetStateAction<ConversationSort>>
}

// ============================================================================
// Helpers
// ============================================================================

/** Sort conversations by the given sort mode descending (newest first) */
function sortConversations(convs: ConversationWithDetails[], mode: ConversationSort): ConversationWithDetails[] {
  const field = mode === 'last_customer_message' ? 'last_customer_message_at' : 'last_message_at'
  return [...convs].sort((a, b) =>
    new Date(b[field] || 0).getTime() - new Date(a[field] || 0).getTime()
  )
}

/**
 * Client-side fallback cursor encode from the SSR seed's last row — used ONLY
 * when page.tsx did not provide `initialCursor`. Same shape the server encodes:
 * base64 of { sort, sortIsNull, id }.
 */
function encodeCursorFromSeed(
  rows: ConversationWithDetails[],
  mode: ConversationSort
): string | null {
  const last = rows[rows.length - 1]
  if (!last) return null
  const field = mode === 'last_customer_message' ? 'last_customer_message_at' : 'last_message_at'
  const sort = last[field] ?? null
  try {
    return btoa(JSON.stringify({ sort, sortIsNull: sort === null, id: last.id }))
  } catch {
    return null
  }
}

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing the conversation list with real-time updates and
 * server-side keyset pagination + search/filters.
 *
 * @param options - Hook configuration
 * @returns Conversation state and controls
 *
 * @example
 * ```tsx
 * const { conversations, loadMore, hasMore, query, setQuery } = useConversations({
 *   workspaceId: 'xxx',
 *   initialConversations: [],   // SSR page 1
 *   initialCursor: '...',       // SSR page-1 cursor
 *   initialHasMore: true,
 * })
 * ```
 */
export function useConversations({
  workspaceId,
  initialConversations = [],
  initialCursor,
  initialHasMore,
}: UseConversationsOptions): UseConversationsReturn {
  // State
  const [conversations, setConversations] = useState<ConversationWithDetails[]>(initialConversations)
  const [ordersByContact, setOrdersByContact] = useState<Map<string, OrderSummary[]>>(new Map())
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filter, setFilter] = useState<ConversationFilter>('all')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [agentFilter, setAgentFilter] = useState<ConversationAgentFilter>('all')
  const [isLoading, setIsLoading] = useState(!initialConversations.length)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(
    initialHasMore ?? (initialConversations.length >= PAGE_SIZE)
  )
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  const [sortMode, setSortMode] = useState<ConversationSort>('last_customer_message')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // ---- Refs for avoiding stale closures in realtime callbacks ----

  // D-17: mounted guard. Server actions can't be aborted (no fetch signal
  // exposed) — every setState after an await checks this ref so zombie
  // responses are DISCARDED instead of re-rendering a different module.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // "Latest wins" token for page-1 fetches (rapid filter switches)
  const reqIdRef = useRef(0)

  // Opaque keyset cursor of the LAST loaded row (loadMore pages down from it).
  // Seeded from SSR (initialCursor) or client-side fallback encode (H-2 fix).
  const cursorRef = useRef<string | null>(
    initialCursor !== undefined
      ? initialCursor
      : encodeCursorFromSeed(initialConversations, 'last_customer_message')
  )

  // Track latest conversations state (used by realtime handlers)
  const conversationsRef = useRef<ConversationWithDetails[]>(conversations)
  useEffect(() => { conversationsRef.current = conversations }, [conversations])

  // Track latest sort mode (used by realtime handlers to re-sort)
  const sortModeRef = useRef<ConversationSort>(sortMode)
  useEffect(() => { sortModeRef.current = sortMode }, [sortMode])

  // Track hasMore for the D-07 "belongs in loaded window" realtime decision
  const hasMoreRef = useRef(hasMore)
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  // Track contact IDs of LOADED pages for orders refresh (D-09 page-scoped)
  const contactIdsRef = useRef<string[]>([])
  useEffect(() => {
    contactIdsRef.current = conversations
      .map(c => c.contact?.id)
      .filter((id): id is string => !!id)
  }, [conversations])

  // Track whether initial load has completed (for orders loading)
  const hasInitiallyLoadedRef = useRef(false)

  // Safety-net debounced page-1 soft refetch timer
  const safetyRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ref for scheduleSafetyRefetch — avoids including it in realtime useEffect deps
  // which caused channel teardown/recreation on every filter or currentUserId change
  const scheduleSafetyRefetchRef = useRef<() => void>(() => {})

  // Ref for the page-1 soft refetch — used by reconnect handler + subscribe callback
  const softRefetchRef = useRef<() => void>(() => {})

  // Get current user ID for 'mine' filter
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!mountedRef.current) return
      setCurrentUserId(user?.id || null)
    })
  }, [])

  // Debounce the search query before issuing server-side fetches (D-05)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  // Build the server-side filter params for the current UI state (D-06).
  // RLS already limits visibility — these refine within the visible set.
  const buildFilterParams = useCallback((): ConversationPageFilters => {
    let params: ConversationPageFilters = {}

    switch (filter) {
      case 'archived':
        params = { status: 'archived' }
        break
      case 'unread':
        params = { status: 'active', is_read: false }
        break
      case 'mine':
        // Show only conversations assigned to current user
        params = { status: 'active', assigned_to: currentUserId || undefined }
        break
      case 'unassigned':
        // Show only unassigned conversations
        params = { status: 'active', assigned_to: null }
        break
      case 'unanswered':
        params = { status: 'active', unanswered: true }
        break
      default: // 'all'
        params = { status: 'active' }
    }

    params.sortBy = sortMode
    if (debouncedQuery.trim()) params.search = debouncedQuery.trim()
    if (tagFilter) params.tag_id = tagFilter
    if (agentFilter === 'agent-attended') params.agent_attended = true

    return params
  }, [filter, currentUserId, sortMode, debouncedQuery, tagFilter, agentFilter])

  // Latest filter params for async handlers (loadMore, softRefetch)
  const filterParamsRef = useRef<ConversationPageFilters>({})
  useEffect(() => { filterParamsRef.current = buildFilterParams() }, [buildFilterParams])

  // Fetch page 1 and REPLACE loaded pages (mount after no-seed, filter change)
  const fetchFirstPage = useCallback(async () => {
    setIsLoading(true)
    const myReq = ++reqIdRef.current
    try {
      const page = await getConversationsPage(buildFilterParams(), null)
      if (!mountedRef.current || myReq !== reqIdRef.current) return
      cursorRef.current = page.nextCursor
      setHasMore(page.hasMore)
      setConversations(page.conversations)
    } catch (error) {
      console.error('Error fetching conversations:', error)
    } finally {
      if (mountedRef.current && myReq === reqIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [buildFilterParams])

  const fetchFirstPageRef = useRef(fetchFirstPage)
  useEffect(() => { fetchFirstPageRef.current = fetchFirstPage }, [fetchFirstPage])

  // Fetch key: any change resets to page 1 + clears loaded pages (Q4 — each
  // filter combination defines its own keyset window). currentUserId only
  // participates when filter==='mine' — its async resolution must NOT trigger
  // a page-1 refetch on 'all' (that was part of the H-2 mount double-fetch).
  const fetchKey = JSON.stringify({
    filter,
    userId: filter === 'mine' ? currentUserId : null,
    sortMode,
    q: debouncedQuery.trim(),
    tag: tagFilter,
    agent: agentFilter,
  })

  // SSR seed (H-2 fix, RESEARCH Q10): initialConversations IS page 1 already
  // loaded — skip the mount fetch entirely when seeded. Every later fetchKey
  // change resets to page 1.
  const didConsumeSeedRef = useRef(false)
  useEffect(() => {
    if (!didConsumeSeedRef.current) {
      didConsumeSeedRef.current = true
      if (initialConversations.length > 0) return // seeded — no mount fetch
    }
    hasInitiallyLoadedRef.current = false // orders reload for the new filter set
    fetchFirstPageRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey])

  // Load the next keyset page + its orders (infinite scroll — D-09 page-scoped)
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore || isLoading) return
    if (!cursorRef.current) return
    const myReq = reqIdRef.current // discard if a page-1 replace started meanwhile
    setIsLoadingMore(true)
    try {
      const page = await getConversationsPage(filterParamsRef.current, cursorRef.current)
      if (!mountedRef.current || myReq !== reqIdRef.current) return
      cursorRef.current = page.nextCursor
      setHasMore(page.hasMore)
      setConversations(prev => {
        // Dedupe by id: realtime may have prepended a row the page also contains (P10)
        const byId = new Map(prev.map(c => [c.id, c]))
        const appended = [...prev]
        for (const c of page.conversations) {
          if (!byId.has(c.id)) {
            appended.push(c)
            byId.set(c.id, c)
          }
        }
        return appended
      })

      // Orders for the NEW page's contacts only — merge, never refetch the map (D-09)
      const newContactIds = [...new Set(
        page.conversations
          .map(c => c.contact?.id)
          .filter((id): id is string => !!id)
      )]
      if (newContactIds.length > 0) {
        const orders = await getOrdersForContacts(newContactIds)
        if (!mountedRef.current || myReq !== reqIdRef.current) return
        setOrdersByContact(prev => new Map([...prev, ...orders]))
      }
    } catch (error) {
      console.error('Error loading more conversations:', error)
    } finally {
      if (mountedRef.current) setIsLoadingMore(false)
    }
  }, [hasMore, isLoadingMore, isLoading])

  // Page-1 soft refetch: merge-by-id, latest wins, NO isLoading, NO array
  // replacement (mirror of use-messages.ts softRefetch — D-14 contract).
  // Keeps loaded pages intact (the tail cursor is untouched by a head merge).
  const softRefetchPage1 = useCallback(async () => {
    const myReq = reqIdRef.current
    try {
      const page = await getConversationsPage(filterParamsRef.current, null)
      if (!mountedRef.current || myReq !== reqIdRef.current) return
      if (conversationsRef.current.length === 0) {
        cursorRef.current = page.nextCursor
        setHasMore(page.hasMore)
        setConversations(page.conversations)
        return
      }
      setConversations(prev => {
        const byId = new Map(prev.map(c => [c.id, c]))
        for (const c of page.conversations) byId.set(c.id, c) // latest wins
        return sortConversations(Array.from(byId.values()), sortModeRef.current)
      })
    } catch {
      // silent — eventually consistent; realtime is the primary path
    }
  }, [])

  // Load orders for loaded-page contacts in batch — only on initial page load.
  // Orders are separate data that don't change when conversations update.
  // They refresh on: 1) page-1 load, 2) loadMore (new page merge), 3) explicit
  // refreshOrders() call (realtime order INSERT, stage change)
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
        if (!mountedRef.current) return // D-17 zombie guard
        setOrdersByContact(orders)
      } catch (error) {
        console.error('Error loading orders:', error)
      } finally {
        if (mountedRef.current) setIsLoadingOrders(false)
      }
    }

    loadOrders()
  }, [conversations, isLoading])

  // Schedule a debounced safety-net page-1 soft refetch (10s after last
  // surgical update). Ensures eventual consistency if any surgical update was
  // incomplete. NOTE: merges page 1 by id — never replaces loaded pages.
  // (Coalescing — fire-once without re-arming — is plan 06 / D-15.)
  const scheduleSafetyRefetch = useCallback(() => {
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    safetyRefetchTimer.current = setTimeout(() => {
      softRefetchPage1()
    }, 10_000)
  }, [softRefetchPage1])

  // Keep refs in sync — used by realtime handlers to avoid stale closure
  useEffect(() => { scheduleSafetyRefetchRef.current = scheduleSafetyRefetch }, [scheduleSafetyRefetch])
  useEffect(() => { softRefetchRef.current = softRefetchPage1 }, [softRefetchPage1])

  // Capa 2 + Capa 3 — re-sync the inbox/badge (useState model) on the browser
  // events that fire when the socket dies silently (visibilitychange/online) +
  // staleness watchdog. Closes hole 2d (no channel status transition needed).
  // With paging this is a page-1 MERGE (keeps the loaded window), not a full refetch.
  useRealtimeReconnect(softRefetchPage1)

  // ============================================================================
  // Consolidated Realtime Channel
  // Single channel with 4 .on() listeners (conversations, contact_tags, contacts, orders)
  // ============================================================================
  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()
    // channel is assigned inside the async IIFE below
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    ;(async () => {
      // Token-before-subscribe (CONFIRMED primary fix): guarantee the shared
      // Realtime socket holds the USER JWT before the first phx_join, else RLS
      // (is_workspace_member(auth.uid())) drops every event while the channel
      // still reports SUBSCRIBED. The singleton already primes a NO-ARG setAuth
      // at creation (client.ts, callback/auto-refresh mode); this explicit
      // setAuth(token) is the defensive form for a hard load where the cookie
      // session is still hydrating (Pitfall 1). RealtimeAuthProvider re-asserts
      // a no-arg refresh on every TOKEN_REFRESHED, so the brief manual-token
      // window here is harmless (Pitfall 4). NEVER log the token.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token)
      }
      if (cancelled) return

      channel = supabase
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

          console.log(`[realtime:inbox] conversation ${eventType}`, newRow.id, { unread: newRow.unread_count, is_read: newRow.is_read })

          if (eventType === 'UPDATE') {
            const idx = conversationsRef.current.findIndex(c => c.id === newRow.id)

            if (idx === -1) {
              // D-07: the updated conversation is NOT in the loaded pages.
              // If it would sort ABOVE the loaded window's tail it belongs on
              // an already-loaded page → fetch by id + insert by sort.
              // If it sorts BELOW the tail it lives in an unloaded page →
              // ignore (it appears when the user scrolls there).
              const sortField = sortModeRef.current === 'last_customer_message'
                ? 'last_customer_message_at'
                : 'last_message_at'
              const loaded = conversationsRef.current
              const tail = loaded[loaded.length - 1]
              const newVal = newRow[sortField] ? new Date(newRow[sortField]).getTime() : 0
              const tailVal = tail?.[sortField] ? new Date(tail[sortField] as string).getTime() : 0
              const belongsInWindow = !hasMoreRef.current || !tail || newVal >= tailVal
              if (!belongsInWindow) return

              const conv = await getConversation(newRow.id)
              if (!conv || !mountedRef.current) return // D-17 zombie guard
              setConversations(prev => {
                // Dedupe: a safety refetch may have inserted it meanwhile
                if (prev.some(c => c.id === conv.id)) {
                  return sortConversations(
                    prev.map(c => (c.id === conv.id ? conv : c)),
                    sortModeRef.current
                  )
                }
                return sortConversations([conv, ...prev], sortModeRef.current)
              })
              scheduleSafetyRefetchRef.current()
              return
            }

            // Surgical update: spread flat columns from payload onto existing conversation
            // Preserves join data (contact, tags) which aren't in the payload
            setConversations(prev => {
              const i = prev.findIndex(c => c.id === newRow.id)
              if (i === -1) {
                return prev
              }

              const existing = prev[i]

              const updated = [...prev]
              updated[i] = {
                ...existing,
                // Only spread flat conversation columns, preserving join data
                ...Object.fromEntries(
                  Object.entries(newRow).filter(([key]) =>
                    key !== 'contact' && key !== 'tags'
                  )
                ),
              } as ConversationWithDetails

              return sortConversations(updated, sortModeRef.current)
            })
            scheduleSafetyRefetchRef.current()
          } else if (eventType === 'INSERT') {
            // New conversation — need contact + tag join data, fetch just this one
            const conv = await getConversation(newRow.id)
            if (!mountedRef.current) return // D-17 zombie guard
            if (conv) {
              setConversations(prev => {
                // Avoid duplicates (in case safety refetch already added it)
                if (prev.some(c => c.id === conv.id)) return prev
                return sortConversations([conv, ...prev], sortModeRef.current)
              })
            }
            scheduleSafetyRefetchRef.current()
          } else if (eventType === 'DELETE') {
            setConversations(prev => prev.filter(c => c.id !== oldRow.id))
            scheduleSafetyRefetchRef.current()
          }
        }
      )
      // ---- contact_tags table: targeted tag fetch ----
      // Added to supabase_realtime publication in migration 20260317100000
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contact_tags',
        },
        async (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const contactId = (payload.new as any)?.contact_id || (payload.old as any)?.contact_id
          if (!contactId) return

          // Find conversations linked to this contact
          const affected = conversationsRef.current.filter(c => c.contact_id === contactId)
          if (affected.length === 0) return

          // Fetch updated tags for this contact
          const tags = await getTagsForContact(contactId)
          if (!mountedRef.current) return // D-17 zombie guard

          // Update all conversations linked to this contact
          setConversations(prev =>
            prev.map(c => c.contact_id === contactId ? { ...c, tags } : c)
          )
          scheduleSafetyRefetchRef.current()
        }
      )
      // ---- contacts table: is_client changes ----
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contacts',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const newRow = payload.new as Record<string, any>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const oldRow = payload.old as Record<string, any>

          // Only react to is_client changes
          if (newRow.is_client === oldRow.is_client) return

          const contactId = newRow.id
          if (!contactId) return

          const hasAffected = conversationsRef.current.some(c => c.contact?.id === contactId)
          if (!hasAffected) return

          setConversations(prev =>
            prev.map(c => {
              if (c.contact?.id !== contactId) return c
              return { ...c, contact: { ...c.contact!, is_client: newRow.is_client } }
            })
          )
        }
      )
      // ---- orders table: refresh order emojis on INSERT and UPDATE (stage changes) ----
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        async () => {
          // Use ref to get latest LOADED-PAGE contact IDs (D-09 — ≈50-150, not 1000)
          const ids = contactIdsRef.current
          if (ids.length === 0) return
          const uniqueIds = [...new Set(ids)]
          try {
            const orders = await getOrdersForContacts(uniqueIds)
            if (!mountedRef.current) return // D-17 zombie guard
            setOrdersByContact(orders)
          } catch (error) {
            console.error('Error refreshing orders:', error)
          }
        }
      )
      .subscribe((() => {
        let previousStatus = ''
        return (status: string, err?: Error) => {
          console.log(`[realtime:inbox] status: ${status}`, err || '')

          // Refetch on reconnection (SUBSCRIBED after a drop) or on error
          if (status === 'CHANNEL_ERROR') {
            console.log('[realtime:inbox] channel error — scheduling safety refetch')
            scheduleSafetyRefetchRef.current()
          } else if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
            console.log('[realtime:inbox] reconnected — soft-refetching page 1')
            softRefetchRef.current()
          }
          previousStatus = status
        }
      })())
    })()

    // Cleanup on unmount or workspaceId change only
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
      if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId])

  // Get conversation by ID from the loaded list
  const getConversationById = useCallback((id: string) => {
    return conversations.find(c => c.id === id)
  }, [conversations])

  // Optimistically mark a conversation as read in local state
  const markAsReadLocally = useCallback((conversationId: string) => {
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, is_read: true, unread_count: 0 } : c
    ))
  }, [])

  // Refresh orders only (for emoji indicator updates after stage change)
  // Uses ref to avoid stale closure — scoped to loaded pages (D-09)
  const refreshOrders = useCallback(async () => {
    const ids = contactIdsRef.current
    if (ids.length === 0) return

    const uniqueIds = [...new Set(ids)]
    try {
      const orders = await getOrdersForContacts(uniqueIds)
      if (!mountedRef.current) return // D-17 zombie guard
      setOrdersByContact(orders)
    } catch (error) {
      console.error('Error refreshing orders:', error)
    }
  }, [])

  return {
    conversations,
    ordersByContact,
    query,
    setQuery,
    filter,
    setFilter,
    tagFilter,
    setTagFilter,
    agentFilter,
    setAgentFilter,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
    isLoadingOrders,
    hasQuery: query.trim().length > 0,
    refresh: fetchFirstPage,
    refreshOrders,
    getConversationById,
    markAsReadLocally,
    sortMode,
    setSortMode,
  }
}
