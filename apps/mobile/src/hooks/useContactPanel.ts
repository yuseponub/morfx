/**
 * useContactPanel — cache-first data source for the in-chat CRM drawer.
 *
 * Phase 43 Plan 10b.
 *
 * Mirrors the reliability pattern of the web `contact-panel.tsx` — a single
 * hook concentrates:
 *   1. Cache-first paint from AsyncStorage (same pattern as useQuickReplies,
 *      useInboxList, WorkspaceProvider bootstrap).
 *   2. Parallel fetch of contact + recent orders + pipeline stages + tags.
 *   3. Supabase Realtime channel `panel-realtime:${conversationId}`
 *      (INSERT on orders, UPDATE on conversations) — BEST-EFFORT.
 *   4. AppState foreground refetch — RELIABILITY (WebSocket missed events).
 *   5. 30-second polling — RELIABILITY (fallback when both channels fail).
 *
 * Cache keys (AsyncStorage, workspace-scoped):
 *   mobile:contactPanel:${conversationId}       -> MobileContactPanelResponse
 *   mobile:recentOrders:${conversationId}       -> MobileRecentOrdersResponse
 *   mobile:pipelineStages:${workspaceId}        -> MobilePipelineStage[]
 *   mobile:tagsList:${workspaceId}              -> MobileTag[]
 *
 * Error is only surfaced if BOTH the cache was empty AND the fetch failed.
 * If the cache had data, stale data is always preferred over a blank screen
 * — same principle as the inbox hook.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { mobileApi, MobileApiError } from '@/lib/api-client';
import {
  MobileContactPanelResponseSchema,
  MobilePipelineStagesResponseSchema,
  MobileRecentOrdersResponseSchema,
  MobileTagsResponseSchema,
  type MobileContactPanelResponse,
  type MobileOrder,
  type MobilePipelineStage,
  type MobileTag,
} from '@/lib/api-schemas/contact-panel';
import { registerChannel } from '@/lib/realtime/channel-registry';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace/use-workspace';

const POLL_INTERVAL_MS = 30_000;

const PANEL_CACHE_KEY = (conversationId: string) =>
  `mobile:contactPanel:${conversationId}`;
const ORDERS_CACHE_KEY = (conversationId: string) =>
  `mobile:recentOrders:${conversationId}`;
const STAGES_CACHE_KEY = (workspaceId: string) =>
  `mobile:pipelineStages:${workspaceId}`;
const TAGS_CACHE_KEY = (workspaceId: string) =>
  `mobile:tagsList:${workspaceId}`;

export interface UseContactPanelResult {
  panel: MobileContactPanelResponse | null;
  orders: MobileOrder[];
  stages: MobilePipelineStage[];
  tags: MobileTag[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /**
   * Apply an optimistic local mutation to the in-memory state. Lets child
   * components reflect a write instantly without waiting for the next fetch
   * round-trip. If the server write fails, the caller passes a revert
   * function back through the onError handler.
   */
  setPanel: (updater: (prev: MobileContactPanelResponse | null) => MobileContactPanelResponse | null) => void;
  setOrders: (updater: (prev: MobileOrder[]) => MobileOrder[]) => void;
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export function useContactPanel(
  conversationId: string | null
): UseContactPanelResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const [panel, setPanelState] = useState<MobileContactPanelResponse | null>(
    null
  );
  const [orders, setOrdersState] = useState<MobileOrder[]>([]);
  const [stages, setStages] = useState<MobilePipelineStage[]>([]);
  const [tags, setTags] = useState<MobileTag[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const hasRenderedSomething = useRef<boolean>(false);
  const inFlight = useRef<boolean>(false);

  // ---------------------------------------------------------------------------
  // Fetch implementation (parallel reads, independent error handling).
  // ---------------------------------------------------------------------------

  const fetchAll = useCallback(
    async (ws: string, convId: string): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        setError(null);

        const [panelRaw, ordersRaw, stagesRaw, tagsRaw] = await Promise.allSettled([
          mobileApi.get<unknown>(
            `/api/mobile/conversations/${encodeURIComponent(convId)}/contact`
          ),
          mobileApi.get<unknown>(
            `/api/mobile/conversations/${encodeURIComponent(convId)}/orders`
          ),
          mobileApi.get<unknown>('/api/mobile/pipeline-stages'),
          mobileApi.get<unknown>('/api/mobile/tags'),
        ]);

        // Panel (contact + window). The drawer can function without the
        // others — but without panel there's nothing to render, so a failure
        // here surfaces the error IF the cache was empty.
        if (panelRaw.status === 'fulfilled') {
          const parsed = MobileContactPanelResponseSchema.parse(panelRaw.value);
          setPanelState(parsed);
          hasRenderedSomething.current = true;
          await writeJson(PANEL_CACHE_KEY(convId), parsed);
        } else if (!hasRenderedSomething.current) {
          const err = panelRaw.reason;
          const msg =
            err instanceof MobileApiError
              ? err.status === 404
                ? 'Conversación no encontrada'
                : `API ${err.status}`
              : err instanceof Error
                ? err.message
                : 'Error al cargar el panel';
          setError(msg);
        }

        // Recent orders.
        if (ordersRaw.status === 'fulfilled') {
          const parsed = MobileRecentOrdersResponseSchema.parse(ordersRaw.value);
          setOrdersState(parsed.orders);
          await writeJson(ORDERS_CACHE_KEY(convId), parsed);
        }

        // Pipeline stages (workspace-scoped cache).
        if (stagesRaw.status === 'fulfilled') {
          const parsed = MobilePipelineStagesResponseSchema.parse(stagesRaw.value);
          setStages(parsed.stages);
          await writeJson(STAGES_CACHE_KEY(ws), parsed.stages);
        }

        // Tags list (workspace-scoped cache).
        if (tagsRaw.status === 'fulfilled') {
          const parsed = MobileTagsResponseSchema.parse(tagsRaw.value);
          setTags(parsed.tags);
          await writeJson(TAGS_CACHE_KEY(ws), parsed.tags);
        }
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    },
    []
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!workspaceId || !conversationId) return;
    await fetchAll(workspaceId, conversationId);
  }, [workspaceId, conversationId, fetchAll]);

  // ---------------------------------------------------------------------------
  // Cache-first bootstrap + initial fetch.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!workspaceId || !conversationId) {
      setLoading(false);
      return;
    }

    let mounted = true;
    hasRenderedSomething.current = false;
    setLoading(true);

    (async () => {
      // 1. Cache-first paint.
      const [cachedPanel, cachedOrders, cachedStages, cachedTags] = await Promise.all([
        readJson<MobileContactPanelResponse>(PANEL_CACHE_KEY(conversationId)),
        readJson<{ orders: MobileOrder[] }>(ORDERS_CACHE_KEY(conversationId)),
        readJson<MobilePipelineStage[]>(STAGES_CACHE_KEY(workspaceId)),
        readJson<MobileTag[]>(TAGS_CACHE_KEY(workspaceId)),
      ]);

      if (!mounted) return;

      if (cachedPanel) {
        setPanelState(cachedPanel);
        hasRenderedSomething.current = true;
      }
      if (cachedOrders?.orders) setOrdersState(cachedOrders.orders);
      if (cachedStages) setStages(cachedStages);
      if (cachedTags) setTags(cachedTags);

      // 2. Fetch in parallel (updates cache on success).
      await fetchAll(workspaceId, conversationId);
    })();

    return () => {
      mounted = false;
    };
  }, [workspaceId, conversationId, fetchAll]);

  // ---------------------------------------------------------------------------
  // Reliability triggers: Realtime + AppState + polling (Research Pattern 1).
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!conversationId) return;

    // Realtime (best-effort) — matches the web panel-realtime pattern:
    //   channel = `panel-realtime:${conversationId}`
    //   INSERT on orders (contact_id filter would require contactId; we
    //     subscribe to conversation UPDATE + rely on refresh() to fan out
    //     to the orders endpoint)
    //   UPDATE on conversations
    const channel = supabase
      .channel(`panel-realtime:${conversationId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `id=eq.${conversationId}`,
      }, () => {
        void refresh();
      })
      .subscribe();

    const unregister = registerChannel(channel);

    // AppState reliability fallback.
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void refresh();
    };
    const appSub = AppState.addEventListener('change', onAppState);

    // 30s polling reliability fallback.
    const interval = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => {
      unregister();
      void supabase.removeChannel(channel);
      appSub.remove();
      clearInterval(interval);
    };
  }, [conversationId, refresh]);

  // ---------------------------------------------------------------------------
  // Optimistic setters.
  // ---------------------------------------------------------------------------

  const setPanel = useCallback(
    (
      updater: (
        prev: MobileContactPanelResponse | null
      ) => MobileContactPanelResponse | null
    ) => {
      setPanelState((prev) => updater(prev));
    },
    []
  );

  const setOrders = useCallback(
    (updater: (prev: MobileOrder[]) => MobileOrder[]) => {
      setOrdersState((prev) => updater(prev));
    },
    []
  );

  return {
    panel,
    orders,
    stages,
    tags,
    loading,
    error,
    refresh,
    setPanel,
    setOrders,
  };
}
