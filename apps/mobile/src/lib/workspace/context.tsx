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
  getSelectedWorkspaceId,
  mobileApi,
  setSelectedWorkspaceId,
} from '@/lib/api-client';
import { teardownAllChannels } from '@/lib/realtime/channel-registry';

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

  const bootstrap = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await mobileApi.get<WorkspacesApiResponse>(
        '/api/mobile/workspaces'
      );
      const list = res.workspaces ?? [];
      setMemberships(list);

      // Restore persisted workspace or fall back to first membership.
      const storedId = await getSelectedWorkspaceId();
      const isStillValid = list.some((w) => w.id === storedId);

      let activeId: string | null = null;
      if (storedId && isStillValid) {
        activeId = storedId;
      } else if (list.length > 0) {
        activeId = list[0].id;
        await setSelectedWorkspaceId(activeId);
      }

      setWorkspaceIdState(activeId);
      if (activeId) {
        onWorkspaceChange?.(activeId);
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[WorkspaceProvider] bootstrap failed', msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [onWorkspaceChange]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

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
