/**
 * WorkspaceContext — single source of truth for the active workspace.
 *
 * Plan 43-06: mounted BELOW auth check in the root layout. On login the
 * provider fetches the user's workspace memberships via the mobile API,
 * restores the last-used workspace from AsyncStorage, and falls back to
 * the first membership if the stored id is no longer valid.
 *
 * Switching workspace:
 *   1. Tears down all Realtime channels (channel-registry).
 *   2. Persists the new id to AsyncStorage (api-client).
 *   3. Updates React state — the parent layout uses workspaceId as a
 *      React `key` on the tab navigator so the entire tab tree remounts
 *      with clean state. No router.replace needed.
 */

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  getCachedWorkspaceMemberships,
  getSelectedWorkspaceId,
  mobileApi,
  setCachedWorkspaceMemberships,
  setSelectedWorkspaceId,
} from '@/lib/api-client';
import { registerForPushNotifications } from '@/lib/notifications';
import { teardownAllChannels } from '@/lib/realtime/channel-registry';
import { supabase } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceMembership {
  id: string;
  name: string;
  slug: string | null;
}

export interface WorkspaceContextValue {
  /** Currently active workspace id (null only during initial load). */
  workspaceId: string | null;
  /** Human-readable name of the active workspace. */
  workspaceName: string | null;
  /** All workspaces the user belongs to. */
  memberships: WorkspaceMembership[];
  /** Switch to a different workspace. */
  setWorkspaceId: (id: string) => Promise<void>;
  /** Re-fetch the membership list from the server. */
  refresh: () => Promise<void>;
  /** True while the initial fetch is in progress. */
  isLoading: boolean;
  /** Error message if bootstrap failed (debug). */
  error: string | null;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(
  null
);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface WorkspaceProviderProps {
  children: React.ReactNode;
  /** Callback fired after workspace changes — parent uses this to get the
   *  new id for the React key remount. */
  onWorkspaceChange?: (id: string) => void;
}

interface WorkspacesApiResponse {
  workspaces: WorkspaceMembership[];
}

export function WorkspaceProvider({
  children,
  onWorkspaceChange,
}: WorkspaceProviderProps) {
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derive workspace name from memberships + current id.
  const workspaceName = useMemo(() => {
    if (!workspaceId) return null;
    return memberships.find((m) => m.id === workspaceId)?.name ?? null;
  }, [workspaceId, memberships]);

  // -- Fetch memberships + restore last-used workspace ----------------------

  // Resolve the active workspace from a given membership list — restore the
  // persisted selection if still valid, otherwise fall back to the first.
  const resolveActiveId = useCallback(
    async (list: WorkspaceMembership[]): Promise<string | null> => {
      const storedId = await getSelectedWorkspaceId();
      const isStillValid = list.some((w) => w.id === storedId);
      if (storedId && isStillValid) return storedId;
      if (list.length > 0) {
        await setSelectedWorkspaceId(list[0].id);
        return list[0].id;
      }
      return null;
    },
    []
  );

  const bootstrap = useCallback(async () => {
    setIsLoading(true);

    // 1. Cache-first: hydrate from AsyncStorage so the UI can render offline.
    //    This prevents the "WS Error: Network request failed" screen when the
    //    app cold-starts without connectivity (Plan 43-07 Task 4 regression).
    const cachedList = await getCachedWorkspaceMemberships();
    if (cachedList && cachedList.length > 0) {
      setMemberships(cachedList);
      const activeId = await resolveActiveId(cachedList);
      setWorkspaceIdState(activeId);
      if (activeId) onWorkspaceChange?.(activeId);
      setIsLoading(false); // Let the UI render immediately from cache.
    }

    // 2. Fire the API fetch in parallel. On success, refresh cache + state.
    //    On failure, keep whatever the cache already gave us and only surface
    //    an error if we have no cache to fall back on.
    try {
      const res = await mobileApi.get<WorkspacesApiResponse>(
        '/api/mobile/workspaces'
      );
      const list = res.workspaces ?? [];
      setMemberships(list);
      await setCachedWorkspaceMemberships(list);

      const activeId = await resolveActiveId(list);
      setWorkspaceIdState(activeId);
      if (activeId) onWorkspaceChange?.(activeId);
      setError(null);
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn('[WorkspaceProvider] bootstrap fetch failed', msg);
      // Only propagate the error if there is no cached list to render from.
      if (!cachedList || cachedList.length === 0) {
        setError(msg);
      }
    } finally {
      setIsLoading(false);
    }
  }, [onWorkspaceChange, resolveActiveId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // -- Register for push notifications whenever workspaceId changes ---------
  // Phase 43 Plan 13. iOS short-circuits inside registerForPushNotifications.
  // Android: requests permission, fetches ExpoPushToken, POSTs to
  // /api/mobile/push/register. Safe to call on every workspace switch —
  // server upserts on (user,workspace,platform,token).
  useEffect(() => {
    if (!workspaceId) return;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId) return;
        await registerForPushNotifications({ userId, workspaceId });
      } catch (err) {
        console.warn('[WorkspaceProvider] push registration failed', err);
      }
    })();
  }, [workspaceId]);

  // -- Switch workspace -----------------------------------------------------

  const switchWorkspace = useCallback(
    async (id: string) => {
      if (id === workspaceId) return;

      // 1. Tear down all Realtime channels from the old workspace.
      await teardownAllChannels();

      // 2. Persist new selection.
      await setSelectedWorkspaceId(id);

      // 3. Update state — parent will remount tab tree via key change.
      setWorkspaceIdState(id);
      onWorkspaceChange?.(id);
    },
    [workspaceId, onWorkspaceChange]
  );

  // -- Context value --------------------------------------------------------

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId,
      workspaceName,
      memberships,
      setWorkspaceId: switchWorkspace,
      refresh: bootstrap,
      isLoading,
      error,
    }),
    [workspaceId, workspaceName, memberships, switchWorkspace, bootstrap, isLoading, error]
  );

  return React.createElement(WorkspaceContext.Provider, { value }, children);
}
