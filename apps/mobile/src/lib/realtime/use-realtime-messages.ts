/**
 * useRealtimeMessages — Research Pattern 1 for the chat detail screen.
 *
 * Phase 43 Plan 08. Same dual-trigger pattern as useRealtimeInbox:
 *
 *   Supabase Realtime channel (best effort)        AppState change -> 'active'
 *   messages:${conversationId}                     (reliability mechanism)
 *   postgres_changes INSERT on messages                    |
 *   filter: conversation_id=eq.${conversationId}           |
 *                 \                                       /
 *                  ------> refresh() from useConversationMessages
 *
 * refresh() re-fetches the latest page, upserts into sqlite, and re-reads
 * the cache so the rendered list reflects the UNION of cached history +
 * whatever the server just returned.
 *
 * Cleanup registers through channel-registry so workspace switches
 * (Plan 43-06) tear it down cleanly.
 *
 * Why we cannot trust Supabase Realtime alone on RN (same reasoning as the
 * inbox hook — see use-realtime-inbox.ts):
 *   - supabase/realtime-js #463 (reconnect loops)
 *   - supabase/supabase #29916 (lost updates after TIMED_OUT)
 *   - supabase/realtime #1088 (stuck CLOSED state)
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { registerChannel } from '@/lib/realtime/channel-registry';
import { supabase } from '@/lib/supabase';

export function useRealtimeMessages(
  conversationId: string | null,
  refresh: () => Promise<void> | void
): void {
  useEffect(() => {
    if (!conversationId) return;

    // -----------------------------------------------------------------------
    // 1) Realtime channel (best effort).
    // -----------------------------------------------------------------------

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        // Cast mirrors the web + useRealtimeInbox usage; the runtime accepts
        // the 'postgres_changes' string even though the TS overloads want a
        // tagged-union literal.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void refresh();
        }
      )
      .on(
        // Also listen for status transitions on outbound messages
        // (pending -> sent -> delivered -> read) so the bubble status icon
        // updates live without the user having to foreground the app.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

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
      void supabase.removeChannel(channel);
      sub.remove();
    };
  }, [conversationId, refresh]);
}
