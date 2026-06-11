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
import type { Message, TextContent, MediaContent } from '@/lib/whatsapp/types'

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

/** Optimistic media payload for an outbound attachment. `url` is the in-memory
 * object-URL preview (images/videos) or null for types without a visual preview. */
export interface OptimisticMedia {
  type: Message['type']
  url: string | null
  mimeType: string
  filename: string
  caption?: string
}

interface UseMessagesReturn {
  /** Messages in chronological order (oldest first) */
  messages: Message[]
  /** Loading state */
  isLoading: boolean
  /** Error state — true once the message fetch fails after its bounded retry
   *  (F-6 / D-20). chat-view uses this to render an explicit error state with a
   *  manual retry instead of an indistinguishable empty chat. */
  isError: boolean
  /** Manual retry — re-runs the message fetch (wired to the "Reintentar" button
   *  in chat-view's error state, F-6 / D-20). */
  refetch: () => void
  /** Load more (older) messages */
  loadMore: () => Promise<void>
  /** Whether there are more messages to load */
  hasMore: boolean
  /** Add an optimistic message for instant display. Pass `media` for an
   * outbound attachment so the in-memory preview shows instantly (no flicker). */
  addOptimisticMessage: (text: string, media?: OptimisticMedia) => void
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
  const { data: messages = [], isLoading, isError, refetch } = useQuery({
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

  // Soft reconcile: re-fetch the latest page and MERGE it into the cache without
  // clearing it (no spinner). Used by the safety timer + channel error/reconnect +
  // the visibilitychange/online/watchdog re-sync (useRealtimeReconnect below).
  //
  // MERGE, not invalidate→replace (scroll-jump regression fix, 2026-06-04): a plain
  // invalidateQueries re-runs queryFn(limit) and REPLACES the cache with just the
  // latest `limit` rows. When the user had scrolled up and paginated older history
  // via loadMore (list grown past `limit`), that replace shrank the list back to
  // `limit`, the message they were reading vanished from the DOM, and the browser
  // clamped scrollTop to the bottom — yanking a scrolled-up reader down (every 45s
  // watchdog tick, on tab return, etc.). Merging the latest page by id preserves the
  // loaded-older history (so the list never shrinks → scroll stays put) while still
  // reconciling any missed deltas + status updates (latest wins). Realtime INSERT/
  // UPDATE deltas still flow via setQueryData on the channel (unchanged).
  const softRefetch = useCallback(async () => {
    const convId = conversationIdRef.current
    if (!convId) return
    try {
      const latest = await getConversationMessages(convId, limit)
      queryClient.setQueryData<Message[]>(queryKeyRef.current, (prev = []) => {
        if (prev.length === 0) return latest
        // Dedupe by id (latest wins so status changes apply); skip optimistic here.
        const byId = new Map<string, Message>()
        for (const m of prev) {
          if (m.id.startsWith('optimistic-')) continue
          byId.set(m.id, m)
        }
        // Merge latest (DB-truth: status, wamid). For a just-sent media message the
        // cached row still carries the in-memory blob: preview (kept by the realtime
        // reconciler). Preserve that blob instead of letting the DB CDN URL clobber it,
        // else the on-screen <video>/<img> reloads blob:→CDN and flashes a second
        // black box for a frame (40-08 video double). The CDN URL loads on a later
        // fresh mount (reopen / reload). Status + wamid from `latest` still apply.
        for (const m of latest) {
          const existing = byId.get(m.id)
          if (existing && m.type !== 'text' && existing.media_url?.startsWith('blob:')) {
            byId.set(m.id, {
              ...m,
              media_url: existing.media_url,
              content: {
                ...(m.content as MediaContent),
                link: existing.media_url,
              } as MediaContent,
            })
          } else {
            byId.set(m.id, m)
          }
        }
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )
        // Re-attach optimistic (sending) messages the latest page does not yet cover,
        // so a just-sent bubble never blinks out during a reconcile. An optimistic is
        // "covered" once its real row appears in `latest` (matched by content, same as
        // the INSERT reconciler) — then we drop it to avoid a duplicate.
        const contentKey = (m: Message) =>
          m.type === 'text'
            ? `t:${(m.content as TextContent).body}`
            : `m:${m.type}:${(m.content as MediaContent).caption ?? ''}`
        const covered = new Set(latest.map(contentKey))
        const pendingOptimistic = prev.filter(
          m => m.id.startsWith('optimistic-') && !covered.has(contentKey(m))
        )
        return pendingOptimistic.length ? [...merged, ...pendingOptimistic] : merged
      })
    } catch {
      // Fallback: if the latest-page fetch fails, fall back to a reconciling invalidate.
      queryClient.invalidateQueries({ queryKey: queryKeyRef.current })
    }
  }, [queryClient, limit])

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

  // Add an optimistic message for instant display (client-only). For media the
  // in-memory preview (`media.url`) renders immediately so the attachment never
  // blinks to caption-only while the real message round-trips.
  const addOptimisticMessage = useCallback((text: string, media?: OptimisticMedia) => {
    if (!conversationId) return

    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      workspace_id: workspaceId,
      wamid: null,
      direction: 'outbound',
      type: media ? media.type : 'text',
      content: media
        ? ({
            link: media.url ?? undefined,
            caption: media.caption,
            filename: media.filename,
            mimeType: media.mimeType,
          } as MediaContent)
        : ({ body: text } as TextContent),
      status: 'sending' as Message['status'],
      status_timestamp: null,
      error_code: null,
      error_message: null,
      media_url: media ? media.url : null,
      media_mime_type: media ? media.mimeType : null,
      media_filename: media ? media.filename : null,
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

          // For outbound messages (text or media), replace a matching optimistic
          // placeholder so the bubble reconciles in place instead of duplicating.
          if (newMessage.direction === 'outbound') {
            queryClient.setQueryData<Message[]>(
              channelKey,
              (prev = []) => {
                // Idempotency by id: if this exact row is already in the list (a prior
                // softRefetch / initial query landed it BEFORE the realtime INSERT, or a
                // duplicate realtime delivery), replace it in place — NEVER append. Else
                // the just-sent media bubble flashes as TWO boxes (same id) until the next
                // reconcile dedups by id (40-08 audio/video transient double — the
                // refetch-before-realtime race). Keep the in-memory blob: preview if the
                // cached row still carries it (no reload flash).
                const byIdIndex = prev.findIndex(m => m.id === newMessage.id)
                if (byIdIndex !== -1) {
                  const cached = prev[byIdIndex]
                  const keepBlob =
                    newMessage.type !== 'text' &&
                    !!cached.media_url &&
                    cached.media_url.startsWith('blob:')
                  const next: Message = keepBlob
                    ? {
                        ...newMessage,
                        media_url: cached.media_url,
                        content: {
                          ...(newMessage.content as MediaContent),
                          link: cached.media_url ?? undefined,
                        } as MediaContent,
                      }
                    : newMessage
                  return prev.map((m, i) => (i === byIdIndex ? next : m))
                }
                const optimisticIndex = prev.findIndex(msg => {
                  if (!msg.id.startsWith('optimistic-')) return false
                  if (newMessage.type === 'text') {
                    return msg.type === 'text' &&
                      (msg.content as TextContent).body === (newMessage.content as TextContent).body
                  }
                  // Media: match by type + caption ONLY (media_url differs — local
                  // blob preview vs the rehosted CDN URL). media_filename is NOT a
                  // reliable key: the server persists it only for documents, so for
                  // image/audio/video the real row has media_filename=null while the
                  // optimistic carries the picker name → the old key never matched and
                  // the optimistic stuck as a foggy duplicate (40-08 fix, WA + FB).
                  return msg.type === newMessage.type &&
                    (msg.content as MediaContent).caption === (newMessage.content as MediaContent).caption
                })
                if (optimisticIndex === -1) {
                  // No matching optimistic — append as normal
                  return [...prev, newMessage]
                }
                // Adopt the real message's identity/status/wamid, but keep the
                // in-memory blob preview as the displayed source so the image does
                // NOT re-download (and momentarily blank) on swap. A later remount
                // loads the rehosted URL from the DB.
                const optimistic = prev[optimisticIndex]
                const keepLocalPreview =
                  newMessage.type !== 'text' &&
                  !!optimistic.media_url &&
                  optimistic.media_url.startsWith('blob:')
                const reconciled: Message = keepLocalPreview
                  ? {
                      ...newMessage,
                      media_url: optimistic.media_url,
                      content: {
                        ...(newMessage.content as MediaContent),
                        link: optimistic.media_url ?? undefined,
                      } as MediaContent,
                    }
                  : newMessage
                return prev.map((msg, i) => (i === optimisticIndex ? reconciled : msg))
              }
            )
          } else {
            // Inbound — append, but guard against a duplicate id that a softRefetch may
            // have already landed (same refetch-before-realtime race as outbound).
            queryClient.setQueryData<Message[]>(
              channelKey,
              (prev = []) =>
                prev.some(m => m.id === newMessage.id) ? prev : [...prev, newMessage]
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
    isError,
    refetch,
    loadMore,
    hasMore,
    addOptimisticMessage,
    scheduleSafetyRefetch,
  }
}
