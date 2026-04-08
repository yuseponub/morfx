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
  type TurnSummary,
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
