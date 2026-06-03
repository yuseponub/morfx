'use client'

import { useEffect, useRef } from 'react'

/**
 * Capa 2 + Capa 3 — realtime reconnection safety net.
 *
 * The Supabase Realtime socket can die SILENTLY while the channel still reports
 * SUBSCRIBED (root causes 2a token-expiry, 2b tab sleep, 2c network drop). The
 * existing auto-heal only fires on a channel status TRANSITION (CHANNEL_ERROR ->
 * SUBSCRIBED), which never happens for a silently-dead socket (hole 2d). So we
 * reconcile on browser/timer events that DO fire instead of on channel status:
 *
 *   - visibilitychange (when !document.hidden) — returning from a slept tab (2b)
 *   - window 'online'                          — network recovered (2c)
 *   - staleness watchdog (every WATCHDOG_INTERVAL_MS, when the tab is visible) —
 *     safety net for 2a even if setAuth (Plan 02) failed (D-09)
 *
 * Each consumer registers ITS existing cheap re-sync function (D-07):
 *   - use-messages.ts  -> softRefetch (invalidateQueries)
 *   - use-conversations.ts -> fetchConversations
 *
 * The callback is kept in a ref so listeners never tear down on a new closure
 * (mirrors the fetchConversationsRef/scheduleSafetyRefetchRef pattern in
 * use-conversations.ts:288-290).
 *
 * @param onResync  cheap re-sync function (no-op if the consumer has nothing to sync)
 * @param enabled   skip wiring while there is nothing to sync (e.g. no conversation selected)
 */

// Watchdog cadence (D-09): re-sync a visible tab roughly once a minute as a
// defense-in-depth net. Cheap (a single invalidate/server-action) so the
// interval can be aggressive without cost concern.
const WATCHDOG_INTERVAL_MS = 45_000

export function useRealtimeReconnect(onResync: () => void, enabled = true) {
  const onResyncRef = useRef(onResync)
  onResyncRef.current = onResync

  useEffect(() => {
    if (!enabled) return
    if (typeof document === 'undefined') return

    const resync = () => {
      onResyncRef.current()
    }

    // Capa 2 / hole 2b — returning to a previously-hidden tab.
    const onVisibility = () => {
      if (!document.hidden) resync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Capa 2 / hole 2c — network recovered.
    window.addEventListener('online', resync)

    // Capa 3 — staleness watchdog (auto-re-arming, unlike the on-event-only
    // scheduleSafetyRefetch). Only fires while the tab is visible to avoid
    // background churn; the visibilitychange handler covers the hidden->visible
    // catch-up.
    const watchdog = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      resync()
    }, WATCHDOG_INTERVAL_MS)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', resync)
      clearInterval(watchdog)
    }
  }, [enabled])
}
