/**
 * Character-based typing delay calculator.
 *
 * Converts a message's character count into a human-like "typing" delay
 * using a logarithmic curve. Short messages get a brief pause (~2s) while
 * longer messages ramp up to a 12s cap at 250 characters.
 *
 * Formula:
 *   delay = MIN + (MAX - MIN) * ln(1 + chars/K) / ln(1 + CAP/K)
 *
 * The logarithmic shape means the first ~50 characters add delay quickly,
 * then growth decelerates -- matching how humans type: you think about
 * what to say (fixed cost) then type at roughly constant speed.
 *
 * @example
 * ```ts
 * import { calculateCharDelay } from '@/lib/agents/somnio/char-delay';
 *
 * const message = 'Hola, tu pedido ya fue despachado!';
 * const delayMs = calculateCharDelay(message.length); // ~3500ms
 * await sleep(delayMs);
 * ```
 *
 * @module char-delay
 */

/** Minimum delay in milliseconds (even for 1-character messages). */
export const MIN_DELAY_MS = 2000;

/** Maximum delay in milliseconds (cap for long messages). */
export const MAX_DELAY_MS = 12000;

/** Character count at which the maximum delay is reached. */
export const CHAR_CAP = 250;

/**
 * Curve shape parameter. Lower values produce a more aggressive
 * logarithmic curve (faster initial ramp). Adjust after observing
 * production behavior -- not configurable at runtime.
 */
export const K = 30;

/**
 * Calculate a human-like typing delay based on message character count.
 *
 * @param charCount - Number of characters in the message.
 * @returns Delay in integer milliseconds, clamped to [MIN_DELAY_MS, MAX_DELAY_MS].
 */
export function calculateCharDelay(charCount: number): number {
  // Guard: non-positive, NaN, or non-finite -> minimum delay
  if (!Number.isFinite(charCount) || charCount <= 0) {
    return MIN_DELAY_MS;
  }

  // Clamp to cap so messages beyond CHAR_CAP don't exceed MAX_DELAY_MS
  const clamped = Math.min(charCount, CHAR_CAP);

  // Logarithmic interpolation between MIN and MAX
  const ratio = Math.log(1 + clamped / K) / Math.log(1 + CHAR_CAP / K);
  const delay = MIN_DELAY_MS + (MAX_DELAY_MS - MIN_DELAY_MS) * ratio;

  return Math.round(delay);
}
