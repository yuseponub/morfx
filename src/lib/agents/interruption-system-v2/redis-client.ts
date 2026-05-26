/**
 * Singleton wrapper around `@upstash/redis`.
 *
 * Source: RESEARCH.md lines 596-622 (Code Example 1 — verbatim).
 *
 * Why singleton: the SDK is REST-based (no persistent connections), but the
 * `Redis` instance carries config + fetch state. Re-instantiating per call is
 * wasteful and breaks Vitest mocks via `vi.mock('../redis-client', ...)`.
 *
 * Why Proxy: consumers want `import { redis } from './redis-client'` and call
 * methods naturally (`redis.set(...)`, `redis.eval(...)`). The Proxy defers
 * client instantiation until first property access, so importing this module
 * NEVER throws at import time even when env vars are missing — only on first
 * use (D-01 fail-fast at call site).
 */

import { Redis } from '@upstash/redis'

let _client: Redis | null = null

/**
 * Returns the cached `@upstash/redis` client, instantiating it on first call.
 *
 * Throws (with both env var names mentioned so log readers can fix it) if
 * either `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is missing.
 * Fail-fast per D-01: no silent fallback, no degraded "no-lock" mode at this
 * level — the consumer of the lock decides what to do on Redis unavailability
 * (see D-08 / D-17 `redis_unavailable_fallback_failed`).
 */
export function getRedisClient(): Redis {
  if (_client) return _client
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error(
      '[interruption-system-v2] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set',
    )
  }
  _client = new Redis({ url, token })
  return _client
}

/**
 * Proxy that lazily resolves to the singleton client on each property access.
 *
 * Consumers: `import { redis } from './redis-client'` then `await redis.set(...)`.
 *
 * The Proxy target is an empty object cast to `Redis` purely for typing — the
 * `get` trap always forwards to the real client instance.
 */
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    return getRedisClient()[prop as keyof Redis]
  },
})
