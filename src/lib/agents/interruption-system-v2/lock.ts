/**
 * Distributed lock primitives — acquire / assert-holds / renew / release /
 * heartbeat. Backed by `@upstash/redis` (SET NX + Lua-CAS DEL + EXPIRE).
 *
 * Source: RESEARCH.md Pattern 1 (lines 269-349) verbatim + Code Example 2
 * (lines 624-648) for heartbeat lifecycle. Security V5 (lines 974-994) for
 * UUID validation before Lua ARGV.
 *
 * Architecture choices:
 *   - SET NX object syntax `{ nx: true, ex: LOCK_TTL_S }` (D-02). Positional
 *     args `('NX', 'EX', 45)` are an anti-pattern under @upstash/redis — fail
 *     silently or return wrong types (RESEARCH anti-pattern line 465).
 *   - holder_uuid fencing token (D-15): every checkpoint re-reads the lock
 *     value and compares against the locally held UUID. Detects zombie
 *     lambdas (their UUID no longer in lock value) and split-brain post-
 *     Upstash-failover (Pitfall 1).
 *   - Lua atomic release (RESEARCH Pitfall 3): GET + check + DEL must be
 *     a single round-trip to avoid a race where another holder acquires
 *     between our GET and our DEL.
 *   - `setInterval` heartbeat (D-09 layer 2): renew TTL every HEARTBEAT_MS;
 *     stop in `finally` to prevent zombie keys (RESEARCH Pitfall 2 — DO NOT
 *     wrap in Inngest `step.run`).
 */

import { randomUUID } from 'crypto'
import { createModuleLogger } from '@/lib/audit/logger'
import { redis } from './redis-client'
import { RELEASE_IF_OWNER_LUA } from './lua-scripts'

const logger = createModuleLogger('interruption-system-v2.lock')

/**
 * Lock TTL in seconds. Locked at 45s per DISCUSSION-LOG.md D-09 + user
 * adjustment 2026-05-25.
 *
 * Source of truth for the rationale:
 *   .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md
 *   §Sub-loop latency baseline (RESEARCH A2 → LOCK_TTL_S anchor)
 *
 * Wave 0 measurement (Plan 00 Task 0.1) found N=0 sub-loop events in last
 * 30d (v4 is dormant), so the 17s worst-case envelope is NOT empirically
 * validated but ALSO NOT contradicted. 45s gives a ~2.6x margin over the
 * D-13 worst case and ~9x heartbeat margin (45s / 5s = 9 renewal attempts).
 * If post-ship measurement (Plan 05 E2E or Phase 42.1) shows P99 > 25s,
 * bump to 60s — no code rewrite needed beyond this constant.
 */
export const LOCK_TTL_S = 45

/**
 * Heartbeat interval in ms. Locked at 5000ms (5s) — gives 9x renewal margin
 * over LOCK_TTL_S=45 per D-09 layer 2 design. RESEARCH Pitfall 2 + 7 explain
 * why 3 consecutive misses (~15s) is acceptable: Upstash unavailability for
 * 15s means Redis-as-coordinator is down anyway.
 */
export const HEARTBEAT_MS = 5_000

/**
 * UUID-v4 lowercase shape match. Used to validate `handle.holderUuid` before
 * passing as Lua ARGV (RESEARCH Security V5 line 991 — Lua injection defense).
 * crypto.randomUUID() returns this exact shape; an Inngest event that
 * propagates a malformed string is rejected without invoking eval.
 */
const UUID_RE = /^[0-9a-f-]{36}$/i

export type LockChannel = 'whatsapp' | 'facebook' | 'instagram'

export interface LockHandle {
  /** Redis key: `lock:{workspaceId}:{channel}:{identifier}` */
  key: string
  /** Random UUID identifying this lambda as the lock holder (D-15 fencing). */
  holderUuid: string
  /** ISO timestamp captured at acquire-time — for observability. */
  startedAt: string
}

interface LockValue {
  holder_uuid: string
  started_at: string
  has_sent_anything: boolean
}

/**
 * Build the canonical Redis key for a (workspace, channel, identifier) tuple.
 * Kept colocated with acquire/release so consumers don't recompute by hand.
 */
function buildLockKey(workspaceId: string, channel: LockChannel, identifier: string): string {
  return `lock:${workspaceId}:${channel}:${identifier}`
}

/**
 * Attempt to atomically acquire the lock.
 *
 * Returns a `LockHandle` on success, or `null` if another holder already
 * owns the lock (D-02 — second concurrent caller is rejected). The caller
 * deciding to be a follower (Pattern 2) handles `null` by writing to the
 * pending list + interrupt key and exiting cleanly.
 *
 * Uses object-syntax `{ nx: true, ex: LOCK_TTL_S }` — see RESEARCH
 * anti-pattern line 465 (positional args fail silently).
 */
export async function acquireLock(
  workspaceId: string,
  channel: LockChannel,
  identifier: string,
): Promise<LockHandle | null> {
  const key = buildLockKey(workspaceId, channel, identifier)
  const holderUuid = randomUUID()
  const startedAt = new Date().toISOString()
  const value: LockValue = {
    holder_uuid: holderUuid,
    started_at: startedAt,
    has_sent_anything: false,
  }

  const result = await redis.set(key, JSON.stringify(value), {
    nx: true,
    ex: LOCK_TTL_S,
  })

  if (result !== 'OK') return null

  return { key, holderUuid, startedAt }
}

/**
 * Verify that the lock value still encodes our `holder_uuid`. Returns false
 * if the key is absent, malformed, or held by a different UUID.
 *
 * Use at every checkpoint (D-18) before doing any side-effect — detects:
 *   - TTL expired and another holder force-acquired (Pitfall 7).
 *   - Upstash failover split-brain (Pitfall 1).
 *   - Malformed value (defensive — never throws).
 */
export async function assertHoldsLock(handle: LockHandle): Promise<boolean> {
  const raw = await redis.get<string | Record<string, unknown>>(handle.key)
  if (!raw) return false
  try {
    const parsed =
      typeof raw === 'string' ? (JSON.parse(raw) as LockValue) : (raw as unknown as LockValue)
    return parsed.holder_uuid === handle.holderUuid
  } catch {
    // Defensive: malformed JSON treated as not-owner.
    return false
  }
}

/**
 * Extend the lock TTL back to `LOCK_TTL_S`, IFF we still own it.
 *
 * Non-atomic check-then-expire is acceptable per RESEARCH lines 318-324:
 * worst case the renewal happens after the lock was lost, which is harmless
 * (renewing a key we no longer own — and that key is still TTL-protected by
 * the new holder's `set ex`).
 *
 * Returns true if renewed, false if we no longer own the lock.
 */
export async function renewLockTTL(handle: LockHandle): Promise<boolean> {
  const holds = await assertHoldsLock(handle)
  if (!holds) return false
  await redis.expire(handle.key, LOCK_TTL_S)
  return true
}

/**
 * Release the lock if-and-only-if we still own it (atomic via Lua).
 *
 * Validates `handle.holderUuid` against the UUID regex BEFORE passing as
 * Lua ARGV (Security V5 — Lua injection defense). If validation fails, logs
 * an error and returns false without touching Redis.
 *
 * @upstash/redis `eval` signature is array-based: `eval(script, keys, args)`
 * — DO NOT use positional `eval(script, key, uuid)` (RESEARCH Pitfall 3).
 */
export async function releaseLockIfOwner(handle: LockHandle): Promise<boolean> {
  if (!UUID_RE.test(handle.holderUuid)) {
    logger.error(
      { holderUuid: handle.holderUuid, key: handle.key },
      '[interruption-system-v2] refusing to release lock: holderUuid is not a valid UUID',
    )
    return false
  }
  const result = await redis.eval(RELEASE_IF_OWNER_LUA, [handle.key], [handle.holderUuid])
  return result === 1
}

/**
 * Start the heartbeat loop that renews lock TTL every `HEARTBEAT_MS`.
 *
 * Returns a stop function; the caller MUST invoke stop() in a `finally`
 * block to prevent zombie intervals. The interval runs in the SAME async
 * flow as the main pipeline — do NOT wrap in Inngest `step.run` (RESEARCH
 * Pitfall 2 — Inngest replays steps and heartbeats from past replays no
 * longer extend the live lock).
 *
 * If a renewal fails because we lost the lock, the heartbeat keeps firing
 * (the caller is responsible for detecting zombie state at the next
 * checkpoint and exiting). The heartbeat itself does not throw.
 */
export function startHeartbeat(handle: LockHandle): () => void {
  const interval = setInterval(async () => {
    try {
      await renewLockTTL(handle)
    } catch (err) {
      // Defensive: never let a heartbeat error throw out of the interval.
      logger.error({ err, holderUuid: handle.holderUuid }, '[interruption-system-v2] heartbeat error')
    }
  }, HEARTBEAT_MS)
  return () => clearInterval(interval)
}
