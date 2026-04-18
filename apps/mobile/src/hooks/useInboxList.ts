/**
 * useInboxList — inbox data for the mobile app.
 *
 * Phase 43 Plan 07. Pairs with useRealtimeInbox for live updates.
 *
 * Flow:
 *   1. Mount: synchronously render from listCachedConversations(workspaceId)
 *      so there is NEVER a blank screen when the app has already been used
 *      against this workspace.
 *   2. Kick a fresh API fetch in parallel; when it returns, upsert into
 *      the sqlite cache and re-read from cache to get the merged state.
 *   3. refresh() forces a fresh API fetch (bound to pull-to-refresh).
 *   4. loadMore() is a placeholder for Plan 12 (search) cursor paging; we
 *      keep the signature stable so the UI call site does not churn.
 *
 * Keyed on workspaceId from useWorkspace(). When the user switches
 * workspaces, the provider in Plan 43-06 calls teardownAllChannels() and
 * the (tabs) navigator remounts via key-based remount, so this hook
 * naturally resets to the new workspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { MobileConversationsListResponseSchema } from '../../../../shared/mobile-api/schemas';
import { mobileApi } from '@/lib/api-client';
import {
  listCachedConversations,
  upsertCachedConversations,
  type CachedConversation,
} from '@/lib/db/conversations-cache';
import { useWorkspace } from '@/lib/workspace/use-workspace';

export interface UseInboxListResult {
  conversations: CachedConversation[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

function toCacheRow(
  c: ReturnType<
    typeof MobileConversationsListResponseSchema.parse
  >['conversations'][number],
  workspaceId: string
): CachedConversation {
  return {
    id: c.id,
    workspaceId,
    contactName: c.contact_name ?? c.contact_profile_name ?? null,
    contactPhone: c.contact_phone ?? null,
    lastMessageBody: c.last_message_body,
    lastMessageAt: c.last_message_at ? Date.parse(c.last_message_at) : null,
    lastCustomerMessageAt: c.last_customer_message_at
      ? Date.parse(c.last_customer_message_at)
      : null,
    unreadCount: c.unread_count,
    tagsJson: c.tags.length > 0 ? JSON.stringify(c.tags) : null,
    pipelineStageId: c.pipeline_stage_id,
    botMode: c.bot_mode,
    botMuteUntil: c.bot_mute_until ? Date.parse(c.bot_mute_until) : null,
    updatedAt: Date.now(),
  };
}

export function useInboxList(): UseInboxListResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const [conversations, setConversations] = useState<CachedConversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard against overlapping fetches (pull-to-refresh while a foreground
  // refetch is in flight). This is separate from `loading` because `loading`
  // drives the pull-to-refresh spinner and MUST reset even if another fetch
  // is pending.
  const inFlight = useRef(false);

  // ---------------------------------------------------------------------------
  // Load from cache (fast offline render).
  // ---------------------------------------------------------------------------

  const loadFromCache = useCallback(async (ws: string) => {
    try {
      const rows = await listCachedConversations(ws);
      setConversations(rows);
    } catch (err) {
      // Cache read failure is non-fatal — log and let the API fetch populate.
      console.warn('[useInboxList] cache read failed', err);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Fetch from API + merge into cache.
  // ---------------------------------------------------------------------------

  const fetchFromApi = useCallback(
    async (ws: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const raw = await mobileApi.get<unknown>(
          '/api/mobile/conversations'
        );
        const parsed = MobileConversationsListResponseSchema.parse(raw);

        const cacheRows = parsed.conversations.map((c) => toCacheRow(c, ws));
        await upsertCachedConversations(ws, cacheRows);

        // Re-read from cache so we always render the merged state (cache
        // might still hold rows from a previous page that the API didn't
        // return this time — they remain visible until explicitly evicted).
        const merged = await listCachedConversations(ws);
        setConversations(merged);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        console.warn('[useInboxList] fetch failed', message);
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Public refresh + loadMore.
  // ---------------------------------------------------------------------------

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    await fetchFromApi(workspaceId);
  }, [workspaceId, fetchFromApi]);

  const loadMore = useCallback(async () => {
    // Placeholder. Cursor-based paging lands with Plan 12 (search); for now
    // the initial page (default 40, max 100) is enough for v1 inboxes.
    // Keeping the signature so the FlashList `onEndReached` call site stays
    // stable and we do not need a contract change later.
  }, []);

  // ---------------------------------------------------------------------------
  // Bootstrap on workspace change.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!workspaceId) return;
    // Fire cache read + API fetch in parallel (not sequential) so the
    // screen paints from cache without waiting for the network.
    void loadFromCache(workspaceId);
    void fetchFromApi(workspaceId);
  }, [workspaceId, loadFromCache, fetchFromApi]);

  return { conversations, loading, error, refresh, loadMore };
}
