/**
 * Reaction Mapper
 * Phase 32: Media Processing - Plan 01
 *
 * Pure emoji-to-action mapper for WhatsApp reactions.
 * Zero dependencies, zero API calls, zero latency.
 *
 * Mapping from CONTEXT.md decisions:
 * - Thumbs up, heart -> "ok" (passthrough to classifier)
 * - Laughing -> "jaja" (passthrough to classifier)
 * - Folded hands -> "gracias" (passthrough to classifier)
 * - Crying, angry -> notify host (no handoff)
 * - Everything else -> ignore silently
 */

import type { MediaGateResult } from './types'

/**
 * Action produced by mapping a reaction emoji.
 * - text: Convert to text equivalent and pass through normal pipeline
 * - notify_host: Alert human agent but keep bot active
 * - ignore: Silently discard the reaction
 */
export type ReactionAction =
  | { type: 'text'; text: string }
  | { type: 'notify_host'; reason: string }
  | { type: 'ignore' }

/**
 * Static map of known emoji to their action.
 * Keys are exact Unicode emoji strings.
 *
 * Note: Heart emoji has two variants:
 * - U+2764 U+FE0F (with variation selector, most clients)
 * - U+2764 (plain, some clients send this)
 * Both are mapped to avoid missed reactions.
 */
export const REACTION_MAP: Record<string, ReactionAction> = {
  // Positive / affirmative
  '\u{1F44D}': { type: 'text', text: 'ok' },          // Thumbs up
  '\u2764\uFE0F': { type: 'text', text: 'ok' },        // Red heart (with variation selector)
  '\u2764': { type: 'text', text: 'ok' },               // Red heart (plain, some clients)

  // Expressive
  '\u{1F602}': { type: 'text', text: 'jaja' },          // Face with tears of joy
  '\u{1F64F}': { type: 'text', text: 'gracias' },       // Folded hands / prayer

  // Negative (notify host, don't handoff)
  '\u{1F622}': { type: 'notify_host', reason: 'Reaccion triste del cliente' },   // Crying face
  '\u{1F621}': { type: 'notify_host', reason: 'Reaccion de enojo del cliente' }, // Angry face
}

/**
 * Map a reaction emoji to its corresponding action.
 * Returns { type: 'ignore' } for unmapped emoji.
 */
export function mapReaction(emoji: string): ReactionAction {
  return REACTION_MAP[emoji] ?? { type: 'ignore' }
}

/**
 * Convert a ReactionAction to a MediaGateResult for the pipeline.
 * - text -> passthrough (continue to intent detection with text equivalent)
 * - notify_host -> notify_host (alert human, bot stays)
 * - ignore -> ignore (silently discard)
 */
export function reactionToMediaGateResult(action: ReactionAction): MediaGateResult {
  switch (action.type) {
    case 'text':
      return { action: 'passthrough', text: action.text }
    case 'notify_host':
      return { action: 'notify_host', reason: action.reason }
    case 'ignore':
      return { action: 'ignore' }
  }
}
