/**
 * useRealtimeInbox — Research Pattern 1 from 43-RESEARCH.md.
 *
 * Realtime is best-effort. Reliability comes from the AppState foreground
 * refetch. Both triggers converge on the SAME refresh() callback that
 * useInboxList exposes, so there is no drift between sources.
 *
 * Registers the Supabase channel with the workspace channel-registry so
 * workspace switches tear it down cleanly (Plan 43-06).
 *
 * Background on why we cannot trust Realtime alone on RN:
 *   - supabase/realtime-js #463 (reconnect loops on background/foreground)
 *   - supabase/supabase #29916 (lost updates after TIMED_OUT)
 *   - supabase/realtime #1088 (stuck CLOSED state)
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerChannel } from '@/lib/realtime/channel-registry';
import { supabase } from '@/lib/supabase';
import { useWorkspace } from '@/lib/workspace/use-workspace';

export function useRealtimeInbox(refresh: () => Promise<void> | void): void {
  const workspace = useWorkspace();
  const workspaceId = workspace?.workspaceId ?? null;

  useEffect(() => {
    if (!workspaceId) return;

    // -----------------------------------------------------------------------
    // 1) Realtime channel (best effort).
    // -----------------------------------------------------------------------

    const channel = supabase
      .channel(`inbox:${workspaceId}`)
      .on(
        // Cast because the official type shipped with @supabase/supabase-js
        // for postgres_changes event names is a tagged union. The runtime
        // accepts 'postgres_changes' string — this mirrors the web usage.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    // Workspace switches (Plan 43-06) call teardownAllChannels() which
    // removes every registered channel. Returning the unregister fn here
    // keeps the registry pruned when the hook unmounts normally too.
    const unregister = registerChannel(channel);

    // -----------------------------------------------------------------------
    // 2) AppState foreground refetch fallback (RELIABILITY mechanism).
    // -----------------------------------------------------------------------

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void refresh();
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);

    // -----------------------------------------------------------------------
    // Cleanup.
    // -----------------------------------------------------------------------
    return () => {
      unregister();
      // removeChannel also fires if teardownAllChannels cleared the set,
      // but Supabase no-ops on unknown channels so it's safe to double-call.
      void supabase.removeChannel(channel);
      sub.remove();
    };
  }, [workspaceId, refresh]);
}
