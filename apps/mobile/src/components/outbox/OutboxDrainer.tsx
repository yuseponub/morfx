/**
 * OutboxDrainer — invisible effect that triggers `drainOutbox()` on the
 * two transitions that matter:
 *
 *   1. Network connectivity transitions from offline -> online (via
 *      @react-native-community/netinfo).
 *   2. AppState transitions to 'active' (foreground), via React Native's
 *      AppState API.
 *
 * Research Pitfall 4 (see 43-RESEARCH.md): a single trigger is not enough.
 * Android can keep a zombie WiFi state that reports "online" while
 * actually dropping packets; iOS may miss the NetInfo event under heavy
 * thermal throttling. Dual trigger + the module-level mutex inside
 * drainOutbox guarantee: we try often and we never double-fire.
 *
 * Drains are also initiated from inside `useSendMessage` right after
 * enqueue — so the immediate-path works even if both listeners happen to
 * be quiet (first app launch, no AppState change).
 *
 * This component renders nothing — mount it once under the root layout.
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { drainOutbox } from '@/lib/db/outbox';

export function OutboxDrainer(): null {
  // Track previous state so we only drain on the interesting transitions.
  const wasOnline = useRef<boolean | null>(null);
  const lastAppState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    // Fire once on mount so a cold launch with pending rows + already-online
    // devices doesn't have to wait for an event.
    void drainOutbox();

    const netSub = NetInfo.addEventListener((state: NetInfoState) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      const prev = wasOnline.current;
      wasOnline.current = online;
      // Trigger only on the offline -> online transition (or first detect).
      if (online && prev !== true) {
        void drainOutbox();
      }
    });

    const appSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const prev = lastAppState.current;
      lastAppState.current = next;
      if (next === 'active' && prev !== 'active') {
        void drainOutbox();
      }
    });

    return () => {
      netSub();
      appSub.remove();
    };
  }, []);

  return null;
}
