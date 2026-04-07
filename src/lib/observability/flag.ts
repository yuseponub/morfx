/**
 * Observability feature flag.
 *
 * Reads `process.env.OBSERVABILITY_ENABLED` on EVERY call (no caching).
 * This is intentional: caching at module-load time is Pitfall 5 in
 * 42.1-RESEARCH.md — Vercel warm functions would keep stale values for
 * minutes after toggling the flag. Cost of property access is negligible.
 *
 * Default: OFF. The env var must NOT be set in production until Plan 11.
 * REGLA 6 compliance: production agents must remain unaffected until
 * activation is explicit.
 */

export const OBSERVABILITY_FLAG_NAME = 'OBSERVABILITY_ENABLED' as const

/**
 * Returns true iff `process.env.OBSERVABILITY_ENABLED === 'true'`.
 *
 * NEVER cache the result. Call this on every code path that needs to
 * decide whether to instrument.
 */
export function isObservabilityEnabled(): boolean {
  return process.env[OBSERVABILITY_FLAG_NAME] === 'true'
}
