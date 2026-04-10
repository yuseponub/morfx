/**
 * Channel registry for Supabase Realtime.
 *
 * Plan 43-06: Every screen that subscribes to a Realtime channel MUST
 * register it here. On workspace switch the provider calls
 * teardownAllChannels() which removes every registered channel from the
 * Supabase client — no stale listeners survive across workspaces.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const channels = new Set<RealtimeChannel>();

/**
 * Register a channel. Returns an unregister function (call it in your
 * useEffect cleanup so the set doesn't grow unbounded).
 */
export function registerChannel(ch: RealtimeChannel): () => void {
  channels.add(ch);
  return () => {
    channels.delete(ch);
  };
}

/**
 * Tear down every registered channel. Called by WorkspaceProvider on
 * workspace switch. Each channel is removed from the Supabase transport
 * layer (unsubscribes + closes WebSocket topic).
 */
export async function teardownAllChannels(): Promise<void> {
  const promises: Promise<string>[] = [];
  for (const ch of channels) {
    promises.push(supabase.removeChannel(ch));
  }
  await Promise.all(promises);
  channels.clear();
}
