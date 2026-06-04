/**
 * Messenger 24h window / HUMAN_AGENT tag gate (D-09).
 * Phase 40 Plan 06 (Wave 4) — GREEN implementation of the Wave-1 RED contract.
 *
 * PURE policy helper (no I/O) consulted by the facebook `meta_direct` send path
 * before sending (40-PATTERNS.md §messages.ts D-09 gate). The action computes
 * `hoursSinceCustomerMessage` + reads the Human Agent feature flag, then asks this
 * helper for the single send decision:
 *
 *   resolveMessengerWindowSend({ hoursSinceCustomerMessage, featureGranted })
 *     → { messaging_type: 'RESPONSE' }                       when hoursSince < 24
 *     → { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' } when 24 ≤ hoursSince < 168 AND featureGranted
 *     → { blocked: true, error: <spanish> }                  when 24 ≤ hoursSince < 168 AND !featureGranted
 *     → { blocked: true, error: <spanish> }                  when hoursSince ≥ 168 (> 7 days)
 *
 * Notes:
 *   - 24h–7d sends require the Meta "Human Agent" App-Review feature (RESEARCH Open Q1 / Pitfall 2),
 *     surfaced via the `META_HUMAN_AGENT_ENABLED` flag the action reads → `featureGranted`. Until
 *     granted → BLOCK with a clear Spanish message (T-40-06-01/02 mitigation — never a silent drop).
 *   - The DEAD tags (CONFIRMED_EVENT_UPDATE/ACCOUNT_UPDATE/POST_PURCHASE_UPDATE, dead since 2026-04-27)
 *     are never produced; the only tag this gate can yield is HUMAN_AGENT.
 *   - This gate ONLY governs meta_direct facebook; the ManyChat facebook path is unaffected (Regla 6)
 *     — the action does not route manychat sends through this helper.
 */

/** D-09 window boundaries (hours). 24h session window; 168h = 7-day HUMAN_AGENT window. */
const SESSION_WINDOW_HOURS = 24
const HUMAN_AGENT_WINDOW_HOURS = 7 * 24 // 168

export interface MessengerWindowInput {
  /** Hours elapsed since the customer's last inbound message. Use Infinity when unknown/never. */
  hoursSinceCustomerMessage: number
  /** Whether the Meta "Human Agent" App-Review feature is granted (META_HUMAN_AGENT_ENABLED). */
  featureGranted: boolean
}

export type MessengerWindowDecision =
  | { messaging_type: 'RESPONSE' }
  | { messaging_type: 'MESSAGE_TAG'; tag: 'HUMAN_AGENT' }
  | { blocked: true; error: string }

/** Clear Spanish block message — never a silent drop (T-40-06-01). */
const BLOCK_MESSAGE =
  'Ventana de 24h cerrada. Activa el permiso Human Agent o espera a que el cliente escriba.'

/**
 * Resolve the Messenger send decision for a facebook meta_direct send (D-09).
 * Pure: no I/O, deterministic from its inputs.
 */
export function resolveMessengerWindowSend(
  input: MessengerWindowInput
): MessengerWindowDecision {
  const { hoursSinceCustomerMessage, featureGranted } = input

  // Inside the 24h session window → free-form RESPONSE, no tag.
  if (hoursSinceCustomerMessage < SESSION_WINDOW_HOURS) {
    return { messaging_type: 'RESPONSE' }
  }

  // 24h–7d → only compliant path is the HUMAN_AGENT tag, and only when the feature is granted.
  if (hoursSinceCustomerMessage < HUMAN_AGENT_WINDOW_HOURS && featureGranted) {
    return { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
  }

  // 24h–7d without the feature, OR beyond 7 days → block with a clear Spanish message.
  return { blocked: true, error: BLOCK_MESSAGE }
}
