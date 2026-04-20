/**
 * useConversationMessages — messages for a single conversation on mobile.
 *
 * Phase 43 Plan 08. Pairs with useRealtimeMessages for live updates.
 *
 * Flow (identical cache-first pattern to useInboxList):
 *   1. Mount: read from listCachedMessages(conversationId) so offline /
 *      warm-start paints immediately with whatever was last persisted.
 *   2. Kick a fresh API fetch in parallel; on success upsert the rows into
 *      the sqlite cache and re-read so the rendered list is the UNION of
 *      (just-fetched page) + (older rows from prior sessions).
 *   3. refresh() forces a fresh API fetch (bound to pull-to-refresh + to
 *      the Realtime / AppState foreground triggers).
 *   4. loadOlder() appends the previous page using the oldest cached
 *      created_at as the `before` cursor; bounded so it never double-fires
 *      during scroll. A null cursor response means end-of-history.
 *   5. Fire-and-forget POST /api/mobile/conversations/:id/mark-read on mount
 *      so the badge on the inbox card resets as soon as the user opens the
 *      thread (matches the web inbox-layout.tsx behavior).
 *
 * Keyed on conversationId + workspaceId. A workspace switch destroys the
 * whole (tabs) tree via Plan 06's key-based remount so this hook naturally
 * resets.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  MobileMessagesListResponseSchema,
  type MobileMessage,
} from '@/lib/api-schemas/messages';
import { mobileApi } from '@/lib/api-client';
import { updateCachedConversationUnread } from '@/lib/db/conversations-cache';
import {
  getLatestCachedTimestamp,
  listCachedMessages,
  upsertCachedMessages,
  type CachedMessage,
  type MessageStatus,
} from '@/lib/db/messages-cache';
import { useWorkspace } from '@/lib/workspace/use-workspace';

const PAGE_LIMIT = 50;

export interface UseConversationMessagesResult {
  messages: CachedMessage[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadOlder: () => Promise<void>;
  /**
   * Re-read the sqlite cache WITHOUT hitting the API. Used right after the
   * composer enqueues an optimistic row so the bubble paints immediately,
   * without waiting for the drain round-trip + Realtime echo.
   */
  refreshFromCache: () => Promise<void>;
  /** True once the API has signaled no more older pages exist. */
  reachedEnd: boolean;
}

// ---------------------------------------------------------------------------
// Wire <-> cache adapter.
// ---------------------------------------------------------------------------

function wireStatusToCache(
  wire: MobileMessage['status'],
  direction: MobileMessage['direction']
): MessageStatus {
  // Inbound messages have no delivery status — store as 'sent' (the only
  // non-pending state that makes sense for a message we've received). The
  // cache's CHECK constraint allows only 'sent' | 'queued' | 'sending' |
  // 'failed', so we normalize here.
  if (direction === 'in') return 'sent';
  if (!wire) return 'sent';
  // Map WhatsApp delivery statuses to the local cache taxonomy:
  //   pending -> sending (still in flight)
  //   failed  -> failed
  //   sent / delivered / read -> sent (terminal-success states)
  if (wire === 'failed') return 'failed';
  if (wire === 'pending') return 'sending';
  return 'sent';
}

function wireToCacheRow(m: MobileMessage): CachedMessage {
  const createdMs = Date.parse(m.created_at);
  return {
    id: m.id,
    conversationId: m.conversation_id,
    workspaceId: m.workspace_id,
    body: m.body,
    mediaUri: m.media_url,
    mediaType: m.media_type,
    direction: m.direction,
    status: wireStatusToCache(m.status, m.direction),
    idempotencyKey: m.idempotency_key,
    serverId: m.id, // server-returned rows always have the canonical server id
    createdAt: Number.isNaN(createdMs) ? Date.now() : createdMs,
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Hook.
// ---------------------------------------------------------------------------

export function useConversationMessages(
  conversationId: string | null
): UseConversationMessagesResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const [messages, setMessages] = useState<CachedMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);

  // Overlap guards (separate refs so pull-to-refresh can coexist with
  // loadOlder without stepping on each other).
  const refreshInFlight = useRef(false);
  const olderInFlight = useRef(false);
  // Remember if we've already fired the mark-read POST for this mount so
  // the effect re-running (strict mode double-mount, workspace change, etc.)
  // doesn't spam the endpoint.
  const markedReadFor = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Cache read.
  // -------------------------------------------------------------------------

  const loadFromCache = useCallback(async (convId: string) => {
    try {
      const rows = await listCachedMessages(convId, PAGE_LIMIT * 4);
      setMessages(rows);
    } catch (err) {
      console.warn('[useConversationMessages] cache read failed', err);
    }
  }, []);

  // Public wrapper — re-read the cache for the currently-bound conversation.
  // Used by the composer to paint the optimistic bubble synchronously.
  const refreshFromCache = useCallback(async () => {
    if (!conversationId) return;
    await loadFromCache(conversationId);
  }, [conversationId, loadFromCache]);

  // -------------------------------------------------------------------------
  // Fresh fetch.
  // -------------------------------------------------------------------------

  const fetchLatest = useCallback(
    async (convId: string) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const raw = await mobileApi.get<unknown>(
          `/api/mobile/conversations/${encodeURIComponent(convId)}/messages`
        );
        const parsed = MobileMessagesListResponseSchema.parse(raw);
        const cacheRows = parsed.messages.map(wireToCacheRow);
        await upsertCachedMessages(cacheRows);
        // Re-read from cache so we render the UNION of (fresh page) +
        // (older rows from prior sessions / loadOlder pagination).
        const merged = await listCachedMessages(convId, PAGE_LIMIT * 4);
        setMessages(merged);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.warn('[useConversationMessages] fetch failed', message);
      } finally {
        refreshInFlight.current = false;
        setLoading(false);
      }
    },
    []
  );

  // -------------------------------------------------------------------------
  // Load older page.
  // -------------------------------------------------------------------------

  const loadOlder = useCallback(async () => {
    if (!conversationId) return;
    if (olderInFlight.current) return;
    if (reachedEnd) return;
    olderInFlight.current = true;
    try {
      // Oldest cached created_at -> use its ISO string as the before cursor.
      // If the cache is empty there is no older data to ask for; bail.
      const latestMs = await getLatestCachedTimestamp(conversationId);
      if (latestMs === null) return;
      // We want messages OLDER than the oldest cached row, not newest — so
      // find the minimum explicitly.
      const current = await listCachedMessages(conversationId, 1000);
      if (current.length === 0) return;
      const oldest = current[current.length - 1];
      if (!oldest) return;
      const beforeIso = new Date(oldest.createdAt).toISOString();
      const url =
        `/api/mobile/conversations/${encodeURIComponent(conversationId)}/messages` +
        `?before=${encodeURIComponent(beforeIso)}&limit=${PAGE_LIMIT}`;
      const raw = await mobileApi.get<unknown>(url);
      const parsed = MobileMessagesListResponseSchema.parse(raw);
      if (parsed.messages.length === 0) {
        setReachedEnd(true);
        return;
      }
      const cacheRows = parsed.messages.map(wireToCacheRow);
      await upsertCachedMessages(cacheRows);
      const merged = await listCachedMessages(conversationId, PAGE_LIMIT * 4);
      setMessages(merged);
      if (parsed.next_cursor === null && parsed.messages.length < PAGE_LIMIT) {
        setReachedEnd(true);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn('[useConversationMessages] loadOlder failed', message);
    } finally {
      olderInFlight.current = false;
    }
  }, [conversationId, reachedEnd]);

  // -------------------------------------------------------------------------
  // Public refresh (re-export of fetchLatest with the current convId bound).
  // -------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    await fetchLatest(conversationId);
  }, [conversationId, fetchLatest]);

  // -------------------------------------------------------------------------
  // Mark-read fire-and-forget on mount.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!conversationId || !workspaceId) return;
    if (markedReadFor.current === conversationId) return;
    markedReadFor.current = conversationId;
    // Deliberately not awaited — the user sees the cached messages while
    // this POST flies. Failure is non-fatal (badge stays until next
    // realtime update or app foreground triggers a conversations refetch).
    mobileApi
      .post(
        `/api/mobile/conversations/${encodeURIComponent(conversationId)}/mark-read`
      )
      .then(async () => {
        // Optimistic local clear of the unread badge so the inbox card
        // reflects reality when the user navigates back, without waiting
        // for Realtime UPDATE (best-effort) or the next foreground refetch.
        try {
          await updateCachedConversationUnread(
            conversationId,
            workspaceId,
            0
          );
        } catch (err) {
          console.warn(
            '[useConversationMessages] local unread clear failed',
            err
          );
        }
      })
      .catch((err) => {
        console.warn('[useConversationMessages] mark-read failed', err);
      });
  }, [conversationId, workspaceId]);

  // -------------------------------------------------------------------------
  // Bootstrap.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!conversationId || !workspaceId) return;
    // Reset "reached end" if we remount for a new conversation.
    setReachedEnd(false);
    setMessages([]);
    // Cache read + API fetch in parallel (not sequential).
    void loadFromCache(conversationId);
    void fetchLatest(conversationId);
  }, [conversationId, workspaceId, loadFromCache, fetchLatest]);

  return {
    messages,
    loading,
    error,
    refresh,
    refreshFromCache,
    loadOlder,
    reachedEnd,
  };
}
