/**
 * Lua scripts for atomic Redis ops.
 *
 * RESEARCH Pattern 1 (lines 327-348) + Pitfall 3 (lines 522-534).
 *
 * Lua eval is the correct primitive for compare-and-delete because Redis
 * `MULTI` only queues commands — it cannot conditionally branch inside the
 * transaction body. A `GET -> JSON.parse -> DEL` round-trip from Node opens a
 * race window where another holder can acquire between the GET and the DEL.
 * The Lua script below executes server-side atomically.
 */

/**
 * Release the lock only if the current holder UUID matches `ARGV[1]`.
 *
 * Returns 1 if the lock was deleted (we owned it), 0 otherwise (key absent,
 * malformed JSON, or different holder).
 *
 * Script body matches RESEARCH lines 330-341 byte-for-byte. Do NOT modify —
 * the atomicity guarantee depends on the exact server-side semantics. Defensive:
 * `pcall(cjson.decode, ...)` swallows decode errors so a malformed lock value
 * does not throw out of the script — we just return 0 (treat as not-owner) and
 * let the cleanup cron sweep the bad key later (Plan 06 `lock_orphan_swept_by_cron`).
 */
export const RELEASE_IF_OWNER_LUA = `
local current = redis.call('GET', KEYS[1])
if current == nil or current == false then
  return 0
end
local ok, decoded = pcall(cjson.decode, current)
if not ok then return 0 end
if decoded.holder_uuid == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`
