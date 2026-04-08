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
