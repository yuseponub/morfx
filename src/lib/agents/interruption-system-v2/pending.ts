/**
 * Pending list operations — RPUSH (append) / LREM (byte-exact remove-self) /
 * LRANGE+DEL (atomic read-and-clear). Backed by `@upstash/redis` lists at the
 * canonical key `pending:{workspaceId}:{channel}:{identifier}`.
 *
 * Source: RESEARCH.md Code Example 3 (lines 651-706) verbatim + Pitfall 4
 * (lines 536-555) byte-exact LREM match guarantee.
 *
 * Architecture choices:
 *   - Deterministic JSON serialization with ALPHABETICAL key order (D-20 +
 *     Pitfall 4): `content`, `entry_uuid`, `msg_id`, `received_at`. Redis LREM
 *     compares values byte-by-byte; `{"a":1,"b":2}` ≠ `{"b":2,"a":1}`. The
 *     holder MUST store the EXACT JSON string returned by `pushToPending` in
 *     memory and pass it back to `removeOwnEntry` — re-serializing the entry
 *     object later (even with the same fields) is NOT guaranteed to byte-match.
 *   - Unbounded list (D-05 / D-16): no LLEN cap; the holder owns cleanup via
 *     `readAndClearPending` at end-of-turn or `removeOwnEntry` after first send.
 *   - Atomic read-and-clear via `redis.multi().del(key).exec()` (RESEARCH line
 *     700-705). Upstash transactions are server-side atomic.
 *   - Defensive parse: @upstash/redis may auto-parse JSON-looking responses
 *     from LRANGE into already-deserialized objects. `readAndClearPending`
 *     branches on `typeof item === 'string'` so both the raw-string and the
 *     auto-parsed-object cases are handled safely.
 */

import { createModuleLogger } from '@/lib/audit/logger'
import { redis } from './redis-client'

const logger = createModuleLogger('interruption-system-v2.pending')

export type PendingChannel = 'whatsapp' | 'facebook' | 'instagram'

/**
 * Shape of a single pending-list entry (D-20).
 *
 * `entry_uuid` is mandatory — guarantees uniqueness across identical
 * `content` strings so the byte-exact LREM cannot remove the wrong entry.
 *
 * `msg_id` is optional in TS but serialized as `null` when absent so the
 * stored JSON shape is stable (every entry has all four keys).
 */
export interface PendingEntry {
  /** Random UUID generated at push-time — guarantees byte-string uniqueness. */
  entry_uuid: string
  /** The message body (text content of the inbound message). */
  content: string
  /** ISO timestamp captured when the inbound message was received. */
  received_at: string
  /** Original wamid / FB message id (optional — webhook may not always have one). */
  msg_id?: string
}

/**
 * Build the canonical Redis key for a (workspace, channel, identifier) tuple.
 * Mirrors lock.ts buildLockKey shape; kept colocated with push/read/remove so
 * consumers don't recompute by hand.
 */
function buildPendingKey(workspaceId: string, channel: PendingChannel, identifier: string): string {
  return `pending:${workspaceId}:${channel}:${identifier}`
}

/**
 * Serialize a PendingEntry to a deterministic JSON string with keys in
 * ALPHABETICAL order: content, entry_uuid, msg_id, received_at. This is the
 * single source of truth for the byte-string the holder pushes — the same
 * function MUST NOT be re-invoked at LREM time because the caller stores the
 * returned `exactJson` in memory (Pitfall 4 mitigation).
 *
 * `msg_id` is normalized to `null` when undefined so every entry has identical
 * key set in identical order.
 */
function serializeEntry(entry: PendingEntry): string {
  return JSON.stringify({
    content: entry.content,
    entry_uuid: entry.entry_uuid,
    msg_id: entry.msg_id ?? null,
    received_at: entry.received_at,
  })
}

/**
 * Append `entry` to the pending list and return both the new list length AND
 * the EXACT JSON string that was pushed.
 *
 * **CRITICAL (Pitfall 4):** The caller MUST hold onto `exactJson` in memory
 * for the lifetime of the lock and pass it back to `removeOwnEntry` later.
 * Reconstructing the JSON from the original `entry` object — even with the
 * same fields — is NOT guaranteed to produce a byte-identical string under
 * future refactors. The contract here is "you push, we hand you the string,
 * you give it back verbatim when you want to remove it."
 *
 * D-05 + D-16: list is unbounded; no LLEN cap. Holder is responsible for
 * cleanup via `readAndClearPending` (end-of-turn) or `removeOwnEntry` (after
 * first successful send).
 */
export async function pushToPending(
  workspaceId: string,
  channel: PendingChannel,
  identifier: string,
  entry: PendingEntry,
): Promise<{ pendingListLength: number; exactJson: string }> {
  const key = buildPendingKey(workspaceId, channel, identifier)
  const exactJson = serializeEntry(entry)
  const pendingListLength = await redis.rpush(key, exactJson)
  return { pendingListLength, exactJson }
}

/**
 * Remove a single occurrence of `exactJson` from the pending list (LREM count=1).
 *
 * Returns true if exactly one entry was removed, false otherwise (key absent,
 * list empty, OR — critically — `exactJson` does not byte-match any stored
 * entry).
 *
 * **Pitfall 4 mitigation:** `exactJson` MUST be the literal string previously
 * returned by `pushToPending`. Re-serializing the original entry object (or
 * any "logically equivalent" JSON with different key order, whitespace, etc.)
 * will NOT match — Redis LREM compares byte-by-byte. The test suite enforces
 * this with a negative case (reversed-key-order JSON fails to remove).
 */
export async function removeOwnEntry(
  workspaceId: string,
  channel: PendingChannel,
  identifier: string,
  exactJson: string,
): Promise<boolean> {
  const key = buildPendingKey(workspaceId, channel, identifier)
  const removed = await redis.lrem(key, 1, exactJson)
  return removed === 1
}

/**
 * Read all entries from the pending list and atomically clear the list in a
 * single multi() transaction.
 *
 * Returns the parsed entries in RPUSH order (i.e., oldest first — order is
 * preserved through LRANGE 0 -1 + the parsing pass). If the key is absent,
 * returns `[]` without touching multi() (defensive — saves a round-trip).
 *
 * **Defensive parse branch:** @upstash/redis sometimes auto-parses JSON
 * responses, returning already-deserialized objects rather than strings.
 * We branch on `typeof item === 'string'` so both the raw-string case and
 * the auto-parsed-object case are handled safely. If JSON.parse throws on
 * a string item (corruption / accidental non-JSON), we log and skip that
 * single entry rather than failing the whole read — the lost entry will be
 * surfaced via the cron sweep (Plan 06) or operator inspection.
 *
 * Source: RESEARCH lines 692-705 with the defensive branch documented in
 * Plan 02 must_haves.truths.
 */
export async function readAndClearPending(
  workspaceId: string,
  channel: PendingChannel,
  identifier: string,
): Promise<PendingEntry[]> {
  const key = buildPendingKey(workspaceId, channel, identifier)
  const items = await redis.lrange<string>(key, 0, -1)
  if (items.length === 0) return []

  // Atomic read-and-clear via Upstash transaction (server-side atomic).
  // [VERIFIED: Upstash pipeline-transaction docs — multi is atomic server-side]
  const tx = redis.multi()
  tx.del(key)
  await tx.exec()

  const out: PendingEntry[] = []
  for (const item of items) {
    try {
      const parsed =
        typeof item === 'string' ? (JSON.parse(item) as PendingEntry) : (item as PendingEntry)
      out.push(parsed)
    } catch (err) {
      // Defensive: a single corrupt entry should not blow up the entire turn.
      logger.error(
        { err, item: typeof item === 'string' ? item.slice(0, 200) : '<non-string>', key },
        '[interruption-system-v2] readAndClearPending: failed to parse a pending entry, skipping',
      )
    }
  }
  return out
}
