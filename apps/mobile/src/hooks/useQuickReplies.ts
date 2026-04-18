/**
 * useQuickReplies — cache-first fetch of the workspace's saved quick
 * replies for the / slash-command autocomplete in the composer.
 *
 * Phase 43 Plan 09.
 *
 * Pattern mirrors useInboxList (Plan 07) and WorkspaceProvider's offline
 * bootstrap (commit 2583892): read AsyncStorage -> render immediately ->
 * API fetch in parallel -> upsert cache on success -> only surface error
 * if the cache was empty.
 *
 * Storage:
 *   - Cached under `mobile:quickReplies:${workspaceId}` in AsyncStorage
 *     as a JSON array. Small payload (typical workspace has under 50
 *     quick replies), no need for sqlite.
 *   - Cache is flushed implicitly on workspace switch because the key
 *     is workspace-scoped and the (tabs) Stack.Screen remounts on
 *     workspaceId change (Plan 06).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { mobileApi, MobileApiError } from '@/lib/api-client';
import {
  MobileQuickRepliesListResponseSchema,
  type MobileQuickReply,
} from '@/lib/api-schemas/quick-replies';
import { useWorkspace } from '@/lib/workspace/use-workspace';

const CACHE_KEY_PREFIX = 'mobile:quickReplies:';

function cacheKey(workspaceId: string): string {
  return `${CACHE_KEY_PREFIX}${workspaceId}`;
}

async function readCache(workspaceId: string): Promise<MobileQuickReply[] | null> {
  const raw = await AsyncStorage.getItem(cacheKey(workspaceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Cheap validation — shape drift between versions would still render
    // without crashing. The full Zod parse happens on the API path.
    return parsed as MobileQuickReply[];
  } catch {
    return null;
  }
}

async function writeCache(
  workspaceId: string,
  list: MobileQuickReply[]
): Promise<void> {
  await AsyncStorage.setItem(cacheKey(workspaceId), JSON.stringify(list));
}

export interface UseQuickRepliesResult {
  quickReplies: MobileQuickReply[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useQuickReplies(): UseQuickRepliesResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const [quickReplies, setQuickReplies] = useState<MobileQuickReply[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const hasRenderedFromSource = useRef<boolean>(false);

  const fetchFromApi = useCallback(
    async (ws: string): Promise<void> => {
      try {
        setError(null);
        const raw = await mobileApi.get<unknown>('/api/mobile/quick-replies');
        const parsed = MobileQuickRepliesListResponseSchema.parse(raw);
        setQuickReplies(parsed.quickReplies);
        hasRenderedFromSource.current = true;
        await writeCache(ws, parsed.quickReplies);
      } catch (err) {
        // Only surface the error if we rendered NOTHING so far. If the
        // cache already populated the list, keep showing it — offline
        // autocomplete is better than an empty dropdown.
        if (!hasRenderedFromSource.current) {
          const msg =
            err instanceof MobileApiError
              ? `API ${err.status}`
              : err instanceof Error
                ? err.message
                : 'Error al cargar respuestas rápidas';
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    await fetchFromApi(workspaceId);
  }, [workspaceId, fetchFromApi]);

  useEffect(() => {
    if (!workspaceId) {
      setQuickReplies([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    hasRenderedFromSource.current = false;

    // 1. Cache-first paint.
    (async () => {
      const cached = await readCache(workspaceId);
      if (!mounted) return;
      if (cached && cached.length > 0) {
        setQuickReplies(cached);
        hasRenderedFromSource.current = true;
      }
      // 2. API fetch in parallel.
      await fetchFromApi(workspaceId);
    })();

    return () => {
      mounted = false;
    };
  }, [workspaceId, fetchFromApi]);

  return { quickReplies, loading, error, refresh };
}
