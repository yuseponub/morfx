/**
 * useBotToggle — optimistic three-state bot toggle hook.
 *
 * Phase 43 Plan 11. Paired with <BotToggle /> + <MuteDurationSheet />.
 *
 * Flow:
 *   1. Mount: read bot_mode + bot_mute_until from the cached_conversations
 *      row (populated by useInboxList / server list endpoint). No blocking
 *      network call — the header paints whatever's already in cache.
 *   2. setBotMode(next): immediately update local state + sqlite cache
 *      (optimistic), POST /api/mobile/conversations/:id/bot-mode with the
 *      new { mode, muteUntil } pair, and revert local state on error.
 *   3. The sqlite cache update uses the existing
 *      `updateCachedConversationBotMode()` helper from Plan 43-03 so the
 *      inbox card's three-state indicator reflects the header change
 *      without waiting for a refetch.
 *
 * Auto-resume: when `bot_mute_until` has already passed, the server's
 * `resolveBotMode` helper coerces mode to 'on' + clears the timestamp on
 * any subsequent read. In the client, we also coerce locally so an app that
 * was backgrounded past the expiry shows 'on' the moment the user opens it.
 *
 * Bogota time is not this hook's concern: `bot_mute_until` is always a UTC
 * ISO string at rest + on the wire. The display layer (BotToggle) formats it
 * for humans via date-fns + the `es` locale.
 */

import { useCallback, useEffect, useState } from 'react';

import {
  MobileBotModeRequestSchema,
  MobileBotModeResponseSchema,
} from '@/lib/api-schemas/bot-mode';
import { mobileApi } from '@/lib/api-client';
import {
  getCachedConversation,
  updateCachedConversationBotMode,
  type BotMode,
} from '@/lib/db/conversations-cache';

export type { BotMode };

export interface UseBotToggleResult {
  mode: BotMode;
  /** Epoch milliseconds when mode='muted', else null. */
  muteUntilMs: number | null;
  /** True while a server write is in flight. */
  pending: boolean;
  /** Last error message, cleared on the next successful write. */
  error: string | null;
  /** Write a new mode. Optimistic — reverts on server error. */
  setBotMode: (args: { mode: BotMode; muteUntilMs: number | null }) => Promise<void>;
}

/**
 * Coerce expired mutes client-side. Mirrors the server `resolveBotMode` so
 * the mobile UI never paints a mute that's already past due.
 */
function coerceExpired(
  mode: BotMode,
  muteUntilMs: number | null
): { mode: BotMode; muteUntilMs: number | null } {
  if (mode !== 'muted') return { mode, muteUntilMs: null };
  if (muteUntilMs === null || muteUntilMs <= Date.now()) {
    return { mode: 'on', muteUntilMs: null };
  }
  return { mode, muteUntilMs };
}

export function useBotToggle(
  conversationId: string | null,
  workspaceId: string | null
): UseBotToggleResult {
  const [mode, setMode] = useState<BotMode>('on');
  const [muteUntilMs, setMuteUntilMs] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Initial load from sqlite cache. If the conversation row is present, use
  // its bot_mode + bot_mute_until. Otherwise stay on defaults ('on', null) —
  // the next list refetch or realtime event will populate the cache.
  // -------------------------------------------------------------------------

  useEffect(() => {
    let mounted = true;
    if (!conversationId || !workspaceId) return;
    (async () => {
      try {
        const convo = await getCachedConversation(conversationId, workspaceId);
        if (!mounted) return;
        const nextMode: BotMode = convo?.botMode ?? 'on';
        const nextUntil: number | null = convo?.botMuteUntil ?? null;
        const coerced = coerceExpired(nextMode, nextUntil);
        setMode(coerced.mode);
        setMuteUntilMs(coerced.muteUntilMs);
      } catch (err) {
        // Non-fatal — keep defaults.
        console.warn('[useBotToggle] cache read failed', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [conversationId, workspaceId]);

  // -------------------------------------------------------------------------
  // Re-coerce on a 30s tick so a mute that expires while the screen is open
  // flips to 'on' without waiting for the next refetch. Cheap: only computes
  // when mode is 'muted'. No timer when mode is 'on' | 'off'.
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (mode !== 'muted' || muteUntilMs === null) return;
    const msUntil = muteUntilMs - Date.now();
    if (msUntil <= 0) {
      setMode('on');
      setMuteUntilMs(null);
      return;
    }
    // Cap at 60s so we don't keep a long-running timeout around — re-run on
    // every render. Bounded above by 60s means worst-case the UI is stale
    // for up to 60s past expiry, which is fine (the server coerces on read).
    const ticker = setTimeout(
      () => {
        setMode((curr) => (curr === 'muted' ? 'on' : curr));
        setMuteUntilMs(null);
      },
      Math.min(msUntil, 60_000)
    );
    return () => clearTimeout(ticker);
  }, [mode, muteUntilMs]);

  // -------------------------------------------------------------------------
  // setBotMode — optimistic write.
  // -------------------------------------------------------------------------

  const writeBotMode = useCallback(
    async (args: { mode: BotMode; muteUntilMs: number | null }) => {
      if (!conversationId || !workspaceId) return;

      const prevMode = mode;
      const prevMuteUntilMs = muteUntilMs;

      // Client-side invariant checks — fail fast before the round-trip.
      if (args.mode === 'muted') {
        if (args.muteUntilMs === null || args.muteUntilMs <= Date.now()) {
          setError('muteUntil debe estar en el futuro');
          return;
        }
      } else if (args.muteUntilMs !== null) {
        setError('muteUntil debe ser null cuando mode es on/off');
        return;
      }

      // Optimistic local update.
      setMode(args.mode);
      setMuteUntilMs(args.muteUntilMs);
      setError(null);
      setPending(true);

      // Update sqlite cache so the inbox card reflects the change.
      try {
        await updateCachedConversationBotMode(
          conversationId,
          workspaceId,
          args.mode,
          args.muteUntilMs
        );
      } catch (err) {
        // Non-fatal — DB cache will be reconciled by the next list refetch.
        console.warn('[useBotToggle] cache write failed', err);
      }

      // Send the write to the server.
      const muteUntilIso =
        args.muteUntilMs !== null
          ? new Date(args.muteUntilMs).toISOString()
          : null;

      const reqBody = MobileBotModeRequestSchema.parse({
        mode: args.mode,
        muteUntil: muteUntilIso,
      });

      try {
        const raw = await mobileApi.post<unknown>(
          `/api/mobile/conversations/${encodeURIComponent(conversationId)}/bot-mode`,
          reqBody
        );
        const parsed = MobileBotModeResponseSchema.parse(raw);
        // Re-sync from server response (auth-of-truth — the server may have
        // coerced an expired mute to 'on' on the way through).
        const serverMuteMs = parsed.bot_mute_until
          ? Date.parse(parsed.bot_mute_until)
          : null;
        const final = coerceExpired(
          parsed.bot_mode,
          Number.isNaN(serverMuteMs as number) ? null : serverMuteMs
        );
        setMode(final.mode);
        setMuteUntilMs(final.muteUntilMs);
        // Reconcile cache with the server's view.
        try {
          await updateCachedConversationBotMode(
            conversationId,
            workspaceId,
            final.mode,
            final.muteUntilMs
          );
        } catch (err) {
          console.warn('[useBotToggle] cache reconcile failed', err);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        // Revert optimistic state.
        setMode(prevMode);
        setMuteUntilMs(prevMuteUntilMs);
        try {
          await updateCachedConversationBotMode(
            conversationId,
            workspaceId,
            prevMode,
            prevMuteUntilMs
          );
        } catch (cacheErr) {
          console.warn('[useBotToggle] cache revert failed', cacheErr);
        }
      } finally {
        setPending(false);
      }
    },
    [conversationId, workspaceId, mode, muteUntilMs]
  );

  return {
    mode,
    muteUntilMs,
    pending,
    error,
    setBotMode: writeBotMode,
  };
}
