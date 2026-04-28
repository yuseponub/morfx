'use server'

/**
 * Server actions for the production observability debug panel.
 *
 * Every action in this file is gated to the super-user (see
 * `src/lib/auth/super-user.ts`). Non-super-users receive a generic
 * `FORBIDDEN` error with zero information leakage.
 *
 * The response shape is a discriminated union so the UI can cleanly
 * distinguish three conditions that look the same to a naive caller:
 *
 *   1. Feature flag OFF  →  { status: 'disabled' }
 *   2. Flag ON, no data  →  { status: 'ok', turns: [] }
 *   3. Flag ON, has data →  { status: 'ok', turns: [...] }
 *
 * This lets the UI show the actionable message
 * "Observabilidad desactivada — set OBSERVABILITY_ENABLED=true en Vercel"
 * in case (1) while keeping the empty-state copy calm in case (2).
 */

import { isObservabilityEnabled, OBSERVABILITY_FLAG_NAME } from '@/lib/observability'
import {
  listTurnsForConversation,
  getTurnDetail,
  type TurnSummary,
  type TurnDetail,
} from '@/lib/observability/repository'
import { assertSuperUser } from '@/lib/auth/super-user'
import {
  condenseTimeline,
  type CondensedTimelineItem,
} from '@/lib/agent-forensics/condense-timeline'
import { loadSessionSnapshot } from '@/lib/agent-forensics/load-session-snapshot'
import {
  listAuditSessionsForTurn,
  loadAuditSessionById,
  type AuditSessionSummary,
  type FullAuditSession,
} from '@/lib/agent-forensics/audit-session-store'

export type GetTurnsResult =
  | { status: 'disabled'; flagName: string }
  | { status: 'ok'; turns: TurnSummary[] }

/**
 * List turns for a given conversation. Super-user gated.
 *
 * @throws Error('FORBIDDEN') when the caller is not the super-user.
 */
export async function getTurnsByConversationAction(
  conversationId: string,
): Promise<GetTurnsResult> {
  await assertSuperUser()

  if (!isObservabilityEnabled()) {
    return { status: 'disabled', flagName: OBSERVABILITY_FLAG_NAME }
  }

  const turns = await listTurnsForConversation(conversationId, { limit: 200 })
  return { status: 'ok', turns }
}

/**
 * Fetch the full detail of a turn (events + queries + ai calls + prompt
 * versions). Super-user gated.
 *
 * `startedAt` MUST be the value already surfaced by the master pane row —
 * see `getTurnDetail` in the repository for the partition-pruning rationale.
 * Unlike `getTurnsByConversationAction`, this action does NOT return a
 * discriminated union: by the time the user has selected a turn they must
 * have already seen a populated list, so the flag check would only exist
 * to handle the race where the flag is toggled off mid-session. In that
 * case the server action throws and the UI's error state renders.
 *
 * @throws Error('FORBIDDEN') when the caller is not the super-user.
 * @throws When the turn row cannot be found inside the started_at window.
 */
export async function getTurnDetailAction(
  turnId: string,
  startedAt: string,
): Promise<TurnDetail> {
  await assertSuperUser()
  return getTurnDetail(turnId, startedAt)
}

/**
 * Discriminated result for the forensics view (Plan 02 / standalone
 * `agent-forensics-panel`). The UI needs to distinguish the "observability
 * disabled" state (surface env var name) from the "ok" state (render the
 * condensed timeline). Same pattern as `getTurnsByConversationAction`.
 */
export type GetForensicsViewResult =
  | { status: 'disabled'; flagName: string }
  | { status: 'ok'; turn: TurnSummary; condensed: CondensedTimelineItem[] }

/**
 * Return the condensed forensics view for a single turn: the turn summary
 * (including `respondingAgentId` from Plan 01) + the filtered timeline
 * items per the whitelist defined in `condenseTimeline` (D-04 whitelist,
 * D-05 strict query exclusion).
 *
 * Super-user gated (same policy as the rest of this module).
 *
 * @param turnId          Canonical turn id from the master pane selection.
 * @param startedAt       ISO timestamp surfaced by the list; used by
 *                        `getTurnDetail` to partition-prune.
 * @param respondingAgentId
 *                        Passed through to `condenseTimeline`. Reserved
 *                        for per-bot label boosting in future plans — the
 *                        current filter is agent-agnostic.
 *
 * @throws Error('FORBIDDEN') when the caller is not the super-user.
 * @throws When the turn row cannot be found inside the started_at window.
 */
export async function getForensicsViewAction(
  turnId: string,
  startedAt: string,
  respondingAgentId: string | null,
): Promise<GetForensicsViewResult> {
  await assertSuperUser()

  if (!isObservabilityEnabled()) {
    return { status: 'disabled', flagName: OBSERVABILITY_FLAG_NAME }
  }

  const detail = await getTurnDetail(turnId, startedAt)
  const condensed = condenseTimeline(detail, respondingAgentId)
  return { status: 'ok', turn: detail.turn, condensed }
}

/**
 * Return the full `session_state` JSON snapshot for a conversation.
 *
 * Super-user gated (same policy as the rest of this module).
 *
 * D-06 (agent-forensics-panel DISCUSSION-LOG.md): no filtering / no
 * projection. The raw JSON is returned as-is and may contain PII (nombre,
 * telefono, direccion, etc.). This is sent to the same Anthropic API that
 * already processes conversational data in production, so no new leakage
 * vector is introduced. Documented in `src/lib/agent-specs/README.md`
 * §Pitfall 6.
 *
 * A7 LIMITATION: `session_state` is mutated in-place by the agent — for a
 * HISTORICAL turn this returns the CURRENT state (possibly mutated by later
 * turns). The UI labels this "snapshot actual, no historico".
 *
 * @throws Error('FORBIDDEN') when the caller is not the super-user.
 */
export async function getSessionSnapshotAction(
  conversationId: string,
): Promise<{ snapshot: unknown; sessionId: string | null }> {
  await assertSuperUser()
  return loadSessionSnapshot(conversationId)
}

/**
 * Plan 05 EXTENSION — list previous audit sessions for a turn, used by the
 * AuditorTab v2 history dropdown.
 *
 * Returns metadata-only summaries (no `messages` JSONB, no `system_prompt`)
 * sorted by `updated_at DESC` so the most-recently touched audit (including
 * audits with recent follow-ups) bubbles to the top.
 *
 * Super-user gated. The underlying store uses `createRawAdminClient()`
 * (bypass RLS) — same admin pattern as `getSessionSnapshotAction`. Caller
 * has already authenticated as the platform owner; the data shipped is
 * inert metadata of audits the same caller already created.
 *
 * @throws Error('FORBIDDEN') when the caller is not the super-user.
 */
export async function listAuditSessionsAction(
  turnId: string,
): Promise<AuditSessionSummary[]> {
  await assertSuperUser()
  return listAuditSessionsForTurn(turnId)
}

/**
 * Plan 05 EXTENSION — load a full audit session by id (chat history +
 * system prompt + meta), used by the dropdown's "click to restore" flow.
 *
 * Returns `null` when the row does not exist; the UI decides UX (toast +
 * remove from list, or refetch).
 *
 * Super-user gated.
 *
 * @throws Error('FORBIDDEN') when the caller is not the super-user.
 */
export async function loadAuditSessionAction(
  id: string,
): Promise<FullAuditSession | null> {
  await assertSuperUser()
  return loadAuditSessionById(id)
}
