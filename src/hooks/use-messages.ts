'use client'

// ============================================================================
// useMessages Hook
// Real-time message subscription for a conversation
// Migrated to TanStack React Query (Capa 4) — React Query owns the message
// cache (instant revisits, stale-while-revalidate); the existing Supabase
// Realtime subscription remains the source of deltas, bridged into the cache
// via queryClient.setQueryData (NOT refetch — Pitfall 7).
//
// Cache correctness contract (debug whatsapp-inbox-messages-stuck, 2026-06-03):
// - The query key is scoped by workspaceId so a conversation fetched under
//   workspace A can never be served/refetched under workspace B after a
//   workspace switch (the switch keeps the singleton browser cache + the same
//   `?c=` conversationId; a workspace-scoped key makes that a cache MISS by
//   construction instead of a cross-tenant leak / stale empty list).
// - The message fetch is a one-shot Server Action RPC, so it uses a bounded
//   retry (1 attempt) instead of the QueryClient default of 3. A transport-level
//   reject on a Vercel cold-start otherwise kept React Query in `pending`
//   through 3 exponential-backoff retries (~7s + per-fetch time), pinning
//   `isLoading=true` and freezing the loading skeletons for 20-50s.
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeReconnect } from '@/hooks/use-realtime-reconnect'
import { getConversationMessages } from '@/app/actions/conversations'
import type { Message, TextContent } from '@/lib/whatsapp/types'

// ============================================================================
// Types
// ============================================================================

interface UseMessagesOptions {
  /** Active workspace id — scopes the cache key so the message list can never
   *  leak across workspaces after a switch (the browser QueryClient is a
   *  singleton and the switch does not clear it). */
  workspaceId: string
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
  /** Schedule a safety refetch (call after sending a message) */
  scheduleSafetyRefetch: () => void
}

// ============================================================================
// Cache key
// ============================================================================

/** Single source of truth for the messages query key. Workspace-scoped so the
 *  cache is isolated per tenant (see header note). */
function messagesKey(workspaceId: string, conversationId: string) {
  return ['messages', workspaceId, conversationId] as const
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing messages with real-time updates.
 * Subscribes to new messages for the active conversation.
 * Includes safety refetch for unreliable realtime delivery.
 *
 * State ownership: TanStack React Query (queryKey ['messages', workspaceId,
 * conversationId]) — revisiting an already-seen conversation is instant
 * (served from cache, stale-while-revalidate) instead of a fresh re-fetch that
 * clears the list. Realtime INSERT/UPDATE deltas are applied via setQueryData
 * (immutable, no refetch); the safety refetch + channel-error/reconnect
 * reconciliation use invalidateQueries (single reconciling refetch — Pitfall 7).
 */
export function useMessages({
  workspaceId,
  conversationId,
  limit = 50,
}: UseMessagesOptions): UseMessagesReturn {
  const queryClient = useQueryClient()

  // Stable, workspace-scoped key reused by the query + every cache mutation
  // below. conversationId may be null (no selection) — guarded by `enabled`.
  const queryKey = useMemo(
    () => messagesKey(workspaceId, conversationId ?? ''),
    [workspaceId, conversationId]
  )

  // React Query owns the message cache. `enabled` guards the null conversation.
  // staleTime/gcTime come from the QueryClient defaults (get-query-client.ts);
  // `retry` is capped at 1 here (vs the default 3) because this is a one-shot
  // Server Action — 3 exponential-backoff retries froze the loading skeletons
  // for 20-50s on Vercel cold-starts (debug whatsapp-inbox-messages-stuck).
  const { data: messages = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => getConversationMessages(conversationId!, limit),
    enabled: !!conversationId,
    retry: 1,
  })

  // hasMore is derived state owned per-conversation: it starts true and is set
  // to false once a page (initial fetch or loadMore) returns < limit rows.
  const [hasMore, setHasMore] = useState(true)

  // Refs for safety refetch + stable handlers
  const safetyRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryKeyRef = useRef(queryKey)
  useEffect(() => { queryKeyRef.current = queryKey }, [queryKey])
  const conversationIdRef = useRef(conversationId)
  useEffect(() => { conversationIdRef.current = conversationId }, [conversationId])

  // Reset hasMore whenever the conversation changes. The initial-fetch heuristic
  // below refines it once the first page lands for this conversation.
  useEffect(() => {
    setHasMore(true)
  }, [conversationId])

  // Initial-fetch hasMore heuristic: once the first page for this conversation
  // lands, hasMore = (page length >= limit). We only apply this for a "fresh"
  // first page (when we have not yet paginated), keyed per conversation so
  // loadMore is never clobbered by a later cache mutation.
  const initializedConvRef = useRef<string | null>(null)
  useEffect(() => {
    if (!conversationId) return
    if (isLoading) return
    if (initializedConvRef.current === conversationId) return
    // First settled page for this conversation.
    initializedConvRef.current = conversationId
    setHasMore(messages.length >= limit)
  }, [conversationId, isLoading, messages.length, limit])

  // Soft reconcile: re-fetch the latest page and reconcile via the cache without
  // clearing it (no spinner). Used by the safety timer + channel error/reconnect.
  // Implemented as a single reconciling invalidate (Pitfall 7 permitted case).
  const softRefetch = useCallback(() => {
    if (!conversationIdRef.current) return
    queryClient.invalidateQueries({ queryKey: queryKeyRef.current })
  }, [queryClient])

  // Capa 2 + Capa 3 — re-sync the open chat (React Query cache) on the browser
  // events that fire when the socket dies silently (visibilitychange/online) +
  // staleness watchdog. Gated on conversationId so listeners/watchdog are only
  // wired while a chat is open (softRefetch already no-ops otherwise).
  useRealtimeReconnect(softRefetch, !!conversationId)

  // Schedule a safety refetch after 3 seconds (call after sending a message)
  const scheduleSafetyRefetch = useCallback(() => {
    if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    safetyRefetchTimer.current = setTimeout(() => {
      softRefetch()
    }, 3_000)
  }, [softRefetch])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (safetyRefetchTimer.current) clearTimeout(safetyRefetchTimer.current)
    }
  }, [])

  // Load more (older) messages — prepend to the cache.
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
        queryClient.setQueryData<Message[]>(
          queryKey,
          (prev = []) => [...olderMessages, ...prev]
        )
      }
      setHasMore(olderMessages.length >= limit)
    } catch (error) {
      console.error('Error loading more messages:', error)
    }
  }, [conversationId, messages, limit, hasMore, queryClient, queryKey])

  // Add an optimistic message for instant text display (client-only)
  const addOptimisticMessage = useCallback((text: string) => {
    if (!conversationId) return

    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      workspace_id: workspaceId,
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
      transcription: null,
      template_name: null,
      sent_by_agent: false,
      timestamp: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }

    queryClient.setQueryData<Message[]>(
      queryKey,
      (prev = []) => [...prev, optimisticMsg]
    )
  }, [conversationId, workspaceId, queryClient, queryKey])

  // Set up Supabase Realtime subscription
  useEffect(() => {
    if (!conversationId) return

    const supabase = createClient()
    let previousStatus = ''
    const channelKey = messagesKey(workspaceId, conversationId)
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    ;(async () => {
      // Token-before-subscribe (CONFIRMED primary fix) — same as use-conversations.ts.
      // Guarantee the USER JWT is on the shared socket before the first phx_join,
      // else RLS drops every message event while the channel reports SUBSCRIBED.
      // Explicit setAuth(token) is the defensive form for a hydrating cookie
      // session (Pitfall 1); the singleton's no-arg prime + RealtimeAuthProvider
      // keep auto-refresh intact (Pitfall 4). NEVER log the token.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token)
      }
      if (cancelled) return

      // Subscribe to messages for this conversation
      channel = supabase
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
            queryClient.setQueryData<Message[]>(
              channelKey,
              (prev = []) => {
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
              }
            )
          } else {
            // Inbound or non-text — append as before
            queryClient.setQueryData<Message[]>(
              channelKey,
              (prev = []) => [...prev, newMessage]
            )
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
          // Update message in array (for status changes)
          const updatedMessage = payload.new as Message
          queryClient.setQueryData<Message[]>(
            channelKey,
            (prev = []) =>
              prev.map(msg =>
                msg.id === updatedMessage.id ? updatedMessage : msg
              )
          )
        }
      )
      .subscribe((status, err) => {
        console.log(`[realtime:messages] ${conversationId.slice(0, 8)} status: ${status}`, err || '')

        if (status === 'CHANNEL_ERROR') {
          // On error, schedule a refetch (single reconciling invalidate — Pitfall 7)
          console.log('[realtime:messages] channel error — scheduling refetch')
          softRefetch()
        } else if (status === 'SUBSCRIBED' && previousStatus && previousStatus !== 'SUBSCRIBED') {
          // Reconnected after a drop — immediate refetch (reconciling invalidate)
          console.log('[realtime:messages] reconnected — refetching')
          softRefetch()
        }
        previousStatus = status
      })
    })()

    // Cleanup on unmount
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [conversationId, workspaceId, softRefetch, queryClient])

  return {
    messages,
    isLoading,
    loadMore,
    hasMore,
    addOptimisticMessage,
    scheduleSafetyRefetch,
  }
}
