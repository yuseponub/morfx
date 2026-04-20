/**
 * useTemplates — cache-first fetch of the workspace's APPROVED WhatsApp
 * templates for the mobile TemplatePicker (Plan 43-14).
 *
 * Pattern mirrors useQuickReplies (Plan 09): AsyncStorage paint-first,
 * API refresh in parallel, upsert cache on success, only surface error if
 * the cache was empty. Templates change rarely (Meta approval cycle) so the
 * cache is particularly valuable here — a disconnected user tapping the
 * template button still sees the last known list.
 *
 * Storage:
 *   - Cached under `mobile:templates:${workspaceId}` in AsyncStorage as a
 *     JSON array. Payload is small (typical workspace has under 30 approved
 *     templates), no need for sqlite.
 *   - Cache is effectively flushed on workspace switch because the key is
 *     workspace-scoped AND the (tabs) Stack.Screen remounts on workspaceId
 *     change (Plan 06).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { mobileApi, MobileApiError } from '@/lib/api-client';
import {
  MobileTemplatesListResponseSchema,
  type MobileTemplate,
} from '@/lib/api-schemas/templates';
import { useWorkspace } from '@/lib/workspace/use-workspace';

const CACHE_KEY_PREFIX = 'mobile:templates:';

function cacheKey(workspaceId: string): string {
  return `${CACHE_KEY_PREFIX}${workspaceId}`;
}

async function readCache(
  workspaceId: string
): Promise<MobileTemplate[] | null> {
  const raw = await AsyncStorage.getItem(cacheKey(workspaceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    // Cheap validation — shape drift between versions would still render
    // without crashing. The full Zod parse happens on the API path.
    return parsed as MobileTemplate[];
  } catch {
    return null;
  }
}

async function writeCache(
  workspaceId: string,
  list: MobileTemplate[]
): Promise<void> {
  await AsyncStorage.setItem(cacheKey(workspaceId), JSON.stringify(list));
}

export interface UseTemplatesResult {
  templates: MobileTemplate[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTemplates(): UseTemplatesResult {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  const [templates, setTemplates] = useState<MobileTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const hasRenderedFromSource = useRef<boolean>(false);

  const fetchFromApi = useCallback(async (ws: string): Promise<void> => {
    try {
      setError(null);
      const raw = await mobileApi.get<unknown>('/api/mobile/templates');
      const parsed = MobileTemplatesListResponseSchema.parse(raw);
      setTemplates(parsed.templates);
      hasRenderedFromSource.current = true;
      await writeCache(ws, parsed.templates);
    } catch (err) {
      if (!hasRenderedFromSource.current) {
        const msg =
          err instanceof MobileApiError
            ? `API ${err.status}`
            : err instanceof Error
              ? err.message
              : 'Error al cargar templates';
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    await fetchFromApi(workspaceId);
  }, [workspaceId, fetchFromApi]);

  useEffect(() => {
    if (!workspaceId) {
      setTemplates([]);
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
        setTemplates(cached);
        hasRenderedFromSource.current = true;
      }
      // 2. API fetch in parallel.
      await fetchFromApi(workspaceId);
    })();

    return () => {
      mounted = false;
    };
  }, [workspaceId, fetchFromApi]);

  return { templates, loading, error, refresh };
}
