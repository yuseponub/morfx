// src/lib/agents/timer-guard.ts
// Phase 42 — shared defensive check: does this session still accept timer work?
// See .planning/phases/42-session-lifecycle/42-CONTEXT.md §3.4 for rationale.

import { createAdminClient } from '@/lib/supabase/admin'
import type { Logger } from 'pino'

export type TimerGuardResult =
  | { ok: true }
  | { ok: false; status: string | 'not_found' }

/**
 * Defensive check at the start of every Inngest timer handler that operates
 * on a sessionId. Returns {ok: true} if the session is still 'active', or
 * {ok: false, status} if the session was closed / handed_off / deleted and
 * the handler should abort.
 *
 * Read-only query — no domain layer involvement (Regla 3 applies only to mutations).
 * Uses a one-column select by primary key for minimum overhead.
 */
export async function checkSessionActive(sessionId: string): Promise<TimerGuardResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_sessions')
    .select('status')
    .eq('id', sessionId)
    .single()

  if (error || !data) {
    return { ok: false, status: 'not_found' }
  }
  if (data.status !== 'active') {
    return { ok: false, status: data.status }
  }
  return { ok: true }
}

/**
 * Convenience: run the check, log at info level if aborted, return boolean.
 * Handlers can use either this or checkSessionActive directly.
 */
export async function guardTimerHandler(
  sessionId: string,
  logger: Logger,
  handlerName: string
): Promise<boolean> {
  const result = await checkSessionActive(sessionId)
  if (!result.ok) {
    logger.info(
      { sessionId, handlerName, observedStatus: result.status },
      'Timer handler aborted: session no longer active'
    )
    return false
  }
  return true
}
