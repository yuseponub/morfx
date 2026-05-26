---
phase: standalone-debounce-interruption-system-v2
plan: 01
type: execute
wave: 1
depends_on: [00]
files_modified:
  - src/lib/agents/interruption-system-v2/redis-client.ts
  - src/lib/agents/interruption-system-v2/lua-scripts.ts
  - src/lib/agents/interruption-system-v2/lock.ts
  - src/lib/agents/interruption-system-v2/observability.ts
  - src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts
  - src/lib/agents/interruption-system-v2/__tests__/lock.test.ts
  - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts
autonomous: true
requirements:
  - LOCK-01  # acquire returns null on collision (atomic SET NX)
  - LOCK-02  # TTL extends via heartbeat
  - LOCK-03  # release-only-if-owner via Lua (fencing token)
  - LOCK-07  # 14 typed observability emitters (REVISION B1 — bumped from 13 to include lock_orphan_swept_by_cron emitted by Plan 06 cron)

must_haves:
  truths:
    - "Calling `acquireLock(wsId, channel, identifier)` returns a LockHandle on first call; null on second concurrent call (SET NX semantics — D-02)."
    - "Calling `assertHoldsLock(handle)` returns false when another lambda's UUID is in the lock value (D-15 fencing)."
    - "Calling `releaseLockIfOwner(handle)` does NOT delete the lock if a different UUID owns it (Lua atomic, RESEARCH Pitfall 3)."
    - "Calling `startHeartbeat(handle)` returns a stop function; calling stop() before TTL prevents zombie keys (D-09 layer 2)."
    - "All 14 D-17-extended observability event labels can be emitted via typed functions; non-typed labels are a TypeScript compile error (LOCK-07 — REVISION B1 bump from 13 to 14 includes `lock_orphan_swept_by_cron` for Plan 06 cron)."
    - "Reading lock value when malformed JSON returns false from assertHoldsLock without throwing (defensive)."
  artifacts:
    - path: "src/lib/agents/interruption-system-v2/redis-client.ts"
      provides: "Singleton @upstash/redis client wrapper; fails fast if env vars missing"
      contains: "@upstash/redis"
    - path: "src/lib/agents/interruption-system-v2/lock.ts"
      provides: "acquireLock, assertHoldsLock, renewLockTTL, releaseLockIfOwner, startHeartbeat, LockHandle"
      contains: "acquireLock"
    - path: "src/lib/agents/interruption-system-v2/lua-scripts.ts"
      provides: "RELEASE_IF_OWNER_LUA constant"
      contains: "redis.call('GET', KEYS[1])"
    - path: "src/lib/agents/interruption-system-v2/observability.ts"
      provides: "emitLockEvent(label, payload) with typed LockEventLabel union (14 values — REVISION B1)"
      contains: "LockEventLabel"
    - path: "src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts"
      provides: "Shared Vitest mock implementing 9 methods (set, get, del, expire, rpush, lrem, lrange, llen, eval, multi)"
      contains: "createMockRedis"
    - path: "src/lib/agents/interruption-system-v2/__tests__/lock.test.ts"
      provides: "Unit tests for LOCK-01..03"
      contains: "acquireLock"
    - path: "src/lib/agents/interruption-system-v2/__tests__/observability.test.ts"
      provides: "Unit tests asserting typed-emitter coverage of all 14 labels (LOCK-07 — REVISION B1)"
      contains: "lock_acquired"
  key_links:
    - from: "src/lib/agents/interruption-system-v2/lock.ts"
      to: "src/lib/agents/interruption-system-v2/redis-client.ts"
      via: "import { redis } from './redis-client'"
      pattern: "from './redis-client'"
    - from: "src/lib/agents/interruption-system-v2/lock.ts"
      to: "src/lib/agents/interruption-system-v2/lua-scripts.ts"
      via: "import { RELEASE_IF_OWNER_LUA }"
      pattern: "RELEASE_IF_OWNER_LUA"
---

<objective>
Wave 1 — Primitives: build the foundation of the lock module. Three production files (`redis-client.ts` singleton wrapper, `lock.ts` with acquire/assert/renew/release/heartbeat per D-02 + D-09 + D-15, `observability.ts` with typed emitters for all 14 D-17-extended labels — REVISION B1 added `lock_orphan_swept_by_cron` for Plan 06 cron), one Lua-script constants file (RESEARCH Pattern 1 + Pitfall 3 atomicity for release), and unit tests covering LOCK-01..03 + LOCK-07 with a shared mock-redis helper.

REVISION B1: Plan 06 Task 6.1 cron emits a new typed event `lock_orphan_swept_by_cron` per D-09 verbatim ("comparando con `agent_sessions` activas"). Plan 01 Task 1.3 LockEventLabel union is bumped from 13 to 14 to include this label. The D-17 coverage matrix in DISCUSSION-LOG.md gains row 14 (annotated as "emitted by cron, not turn-time").

Purpose: every downstream plan (02 pending+checkpoints, 03 webhook, 04 runner, 05 agent, 06 cron+tab, 07 E2E) imports from this module. Wave 1 establishes the contract that all consumers will use, so getting the API surface right here prevents churn later.

Output: 7 files. After this plan, `npx vitest run src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` and `npx vitest run src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` pass green.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@.planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md
@.planning/standalone/debounce-interruption-system-v2/RESEARCH.md
@.planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md

<interfaces>
<!-- Existing observability collector contract — emitter wraps this -->
From src/lib/observability/collector.ts:
```typescript
export class ObservabilityCollector {
  recordEvent(category: string, label: string, payload: Record<string, unknown>): void
  // ...
}
export function getCollector(): ObservabilityCollector | null
```

<!-- Existing logger pattern -->
From src/lib/audit/logger.ts:
```typescript
export function createModuleLogger(moduleName: string): { info, warn, error, debug }
```

<!-- @upstash/redis surface (we use ~9 methods) -->
From @upstash/redis README (RESEARCH Code Example 1 + Pitfall 3):
```typescript
new Redis({ url, token })
redis.set(key, value, { nx: true, ex: number }): Promise<'OK' | null>
redis.get<T>(key): Promise<T | null>
redis.del(key): Promise<number>
redis.expire(key, seconds): Promise<number>
redis.eval(script: string, keys: string[], args: string[]): Promise<unknown>  // ARRAY signature — NOT positional
redis.rpush(key, value): Promise<number>
redis.lrem(key, count, value): Promise<number>
redis.lrange<T>(key, start, end): Promise<T[]>
redis.llen(key): Promise<number>
redis.multi() // returns transaction builder with .exec()
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1.1: Create redis-client.ts singleton + lua-scripts.ts constants</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 596-622 (Code Example 1 — redis-client.ts singleton verbatim)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 327-348 (Pattern 1 — RELEASE_IF_OWNER_LUA script verbatim)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 522-534 (Pitfall 3 — @upstash/redis eval signature: array, NOT positional)
    - .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md (read the locked TTL value — 45s or 60s)
  </read_first>
  <behavior>
    - getRedisClient() returns the same instance across calls (singleton).
    - getRedisClient() throws if either UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN is missing, with a message that mentions the env var name (so log readers can fix it).
    - `redis` proxy can be used as a property access of any @upstash/redis method.
    - RELEASE_IF_OWNER_LUA is exported as a single string constant.
  </behavior>
  <action>
    1. Create directory `src/lib/agents/interruption-system-v2/` (mkdir; the tests subdir + helpers come later in this task list).

    2. Create `src/lib/agents/interruption-system-v2/redis-client.ts` per RESEARCH lines 596-622 verbatim. Confirm:
       - Imports `Redis` from `@upstash/redis`.
       - `_client: Redis | null = null` module-level cache.
       - `getRedisClient()` throws `Error('[interruption-system-v2] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set')` if either env var is missing (per D-01 fail-fast).
       - Default export-style: named export `redis` is a Proxy delegating to `getRedisClient()[prop]` so consumers can `import { redis } from './redis-client'` and call methods naturally.

    3. Create `src/lib/agents/interruption-system-v2/lua-scripts.ts`:
       ```ts
       /**
        * Lua scripts for atomic Redis ops.
        * RESEARCH Pattern 1 (lines 327-348) + Pitfall 3 (lines 522-534).
        */

       /** Release the lock only if the current holder UUID matches ARGV[1]. Returns 1 if deleted, 0 otherwise. */
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
       ```

       This is the EXACT script body from RESEARCH lines 330-341. Do not modify (the script is referenced byte-for-byte from RESEARCH for atomicity guarantee).
  </action>
  <verify>
    <automated>grep -c "@upstash/redis" src/lib/agents/interruption-system-v2/redis-client.ts && grep -c "redis.call('GET', KEYS\[1\])" src/lib/agents/interruption-system-v2/lua-scripts.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "from '@upstash/redis'" src/lib/agents/interruption-system-v2/redis-client.ts` ≥ 1.
    - `grep -c "UPSTASH_REDIS_REST_URL" src/lib/agents/interruption-system-v2/redis-client.ts` ≥ 1.
    - `grep -c "UPSTASH_REDIS_REST_TOKEN" src/lib/agents/interruption-system-v2/redis-client.ts` ≥ 1.
    - `grep -c "redis.call('GET', KEYS\[1\])" src/lib/agents/interruption-system-v2/lua-scripts.ts` ≥ 1.
    - `grep -c "redis.call('DEL', KEYS\[1\])" src/lib/agents/interruption-system-v2/lua-scripts.ts` ≥ 1.
    - `grep -c "cjson.decode" src/lib/agents/interruption-system-v2/lua-scripts.ts` ≥ 1.
    - `grep -c "RELEASE_IF_OWNER_LUA" src/lib/agents/interruption-system-v2/lua-scripts.ts` ≥ 1.
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors in `src/lib/agents/interruption-system-v2/**`.
  </acceptance_criteria>
  <done>Redis singleton + Lua constants compile cleanly and follow RESEARCH verbatim.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 1.2: Create lock.ts (acquireLock, assertHoldsLock, renewLockTTL, releaseLockIfOwner, startHeartbeat) + mock-redis helper + lock.test.ts</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 269-349 (Pattern 1 — lock.ts code verbatim)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 624-649 (Code Example 2 — startHeartbeat helper)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 760-833 (Code Example 6 — Vitest mock-redis verbatim)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 463-471 (Anti-patterns — DO NOT use positional set args, DO use { nx, ex } object syntax)
    - .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md (confirm LOCK_TTL_S value: 45 or 60)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 974-994 (Security — V5 input validation: validate UUID with /^[0-9a-f-]{36}$/i before Lua ARGV)
  </read_first>
  <behavior>
    - Test "acquireLock returns LockHandle on success" (LOCK-01 happy path).
    - Test "acquireLock returns null when SET NX collides" (LOCK-01 — second concurrent caller).
    - Test "assertHoldsLock returns true when UUID matches" (LOCK-03 happy path).
    - Test "assertHoldsLock returns false when UUID differs" (LOCK-03 — zombie defense via D-15).
    - Test "assertHoldsLock returns false when key absent" (TTL expired scenario).
    - Test "assertHoldsLock returns false when value is malformed JSON" (defensive).
    - Test "renewLockTTL refreshes TTL when owner matches" (LOCK-02 happy path).
    - Test "renewLockTTL returns false when owner mismatch" (LOCK-02 — does NOT renew foreign lock).
    - Test "releaseLockIfOwner deletes when UUID matches" (LOCK-03 — happy path via Lua).
    - Test "releaseLockIfOwner does NOT delete when UUID differs" (LOCK-03 — fencing via Lua).
    - Test "startHeartbeat fires renewLockTTL every 5000ms; stop() clears interval" (LOCK-02 — heartbeat lifecycle).
    - Test "acquireLock rejects invalid UUID format passed to releaseLockIfOwner" (Security V5 — validate `/^[0-9a-f-]{36}$/i` before sending to Lua ARGV).
  </behavior>
  <action>
    1. Create `src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` per RESEARCH lines 760-833 verbatim (includes `set`/`get`/`del`/`expire`/`rpush`/`lrem`/`lrange`/`llen`/`eval`/`multi` — the latter returns a chain-call object with `.del().exec()`). Add the test-only export `__simulateTtlExpiry(key: string)` helper that deletes the key from `store` and `ttls` to simulate TTL expiry without waiting for real time. Add `__getAll()` exposing the underlying Maps for assertions.

    2. Create `src/lib/agents/interruption-system-v2/lock.ts` per RESEARCH Pattern 1 (lines 269-349) verbatim, with these explicit additions/refinements:
       - Export `LOCK_TTL_S` constant. **Read 00-MEASUREMENTS.md** to determine the locked value (45 default, 60 if measurement recommended bump per RESEARCH Pitfall 7). Add a code comment citing 00-MEASUREMENTS.md as the source.
       - Export `LockHandle` interface verbatim: `{ key: string; holderUuid: string; startedAt: string }`.
       - `acquireLock(workspaceId, channel, identifier)` uses object syntax `redis.set(key, value, { nx: true, ex: LOCK_TTL_S })` (Anti-pattern: DO NOT use positional args — RESEARCH line 465).
       - `acquireLock` value JSON shape: `{ holder_uuid, started_at, has_sent_anything }` (D-15 + D-16 fields).
       - `acquireLock` returns `null` if `result !== 'OK'`; returns `LockHandle` otherwise.
       - `assertHoldsLock(handle)` does GET, parse, compare; returns false on any JSON parse failure (defensive).
       - `renewLockTTL(handle)` calls `assertHoldsLock` first; only if true, calls `redis.expire(key, LOCK_TTL_S)`.
       - `releaseLockIfOwner(handle)`: **validate handle.holderUuid against `/^[0-9a-f-]{36}$/i` before passing to Lua ARGV** (RESEARCH Security V5). If validation fails, log error via `createModuleLogger` and return false. Otherwise `redis.eval(RELEASE_IF_OWNER_LUA, [handle.key], [handle.holderUuid])` — note ARRAY signature (RESEARCH Pitfall 3).
       - `startHeartbeat(handle)` per RESEARCH Code Example 2 lines 631-648 verbatim; returns a stop function `() => clearInterval(interval)`.

    3. Create `src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` covering the behaviors listed above. Use `vi.mock('../redis-client', () => ({ redis: createMockRedis() }))` pattern. For the heartbeat test use `vi.useFakeTimers()` + `vi.advanceTimersByTime(5000)`. For the malformed-JSON test, manually `mockRedis.__getAll().store.set(key, 'not json')` then call `assertHoldsLock`.

    **Critical Pitfall 3 verification:** the `releaseLockIfOwner` test MUST assert that `mockRedis.eval` was called with `[key]` as second arg (array) and `[uuid]` as third arg (array) — NOT `(key, uuid)` positional.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/interruption-system-v2/__tests__/lock.test.ts --reporter=verbose 2>&1 | tail -50</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` exits 0.
    - Test file has ≥10 `it(` / `test(` blocks (each behavior above).
    - `grep -c "LOCK_TTL_S" src/lib/agents/interruption-system-v2/lock.ts` ≥ 2 (constant + usage).
    - `grep -c "{ nx: true" src/lib/agents/interruption-system-v2/lock.ts` ≥ 1 (object syntax, RESEARCH anti-pattern).
    - `grep -c "redis.eval(RELEASE_IF_OWNER_LUA" src/lib/agents/interruption-system-v2/lock.ts` ≥ 1.
    - `grep -E "\[handle\.key\].*\[handle\.holderUuid\]" src/lib/agents/interruption-system-v2/lock.ts` returns ≥1 match (array signature, RESEARCH Pitfall 3).
    - `grep -E "/\^\[0-9a-f-\]\{36\}\\\$/i" src/lib/agents/interruption-system-v2/lock.ts` returns ≥1 match (UUID validation, RESEARCH Security V5).
    - `grep -c "setInterval" src/lib/agents/interruption-system-v2/lock.ts` ≥ 1 (heartbeat).
    - `grep -c "createMockRedis" src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` ≥ 1.
    - `grep -c "vi.fn(async" src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` ≥ 9 (one per mocked method).
  </acceptance_criteria>
  <done>Lock primitives implemented per RESEARCH; tests prove LOCK-01..03 with mock-redis.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 1.3: Create observability.ts (14 typed emitters — REVISION B1 bumped from 13) + observability.test.ts</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-17 — exhaustive 13 base event labels with payload schemas; REVISION B1 adds 14th `lock_orphan_swept_by_cron` for Plan 06 cron emitted from cleanup sweep)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 729-756 (Code Example 5 — observability.ts template)
    - src/lib/observability/collector.ts (existing getCollector() signature)
  </read_first>
  <behavior>
    - There exists a typed union `LockEventLabel` listing exactly the 14 labels (13 D-17 base + 1 REVISION B1 cron event) and no others.
    - Calling `emitLockEvent('lock_acquired', { holder_uuid: 'u', msg_id: 'm', key: 'k', ttl: 45, started_at: 't' })` invokes `getCollector().recordEvent('pipeline_decision', 'lock_acquired', payload)`.
    - Calling `emitLockEvent` ALSO logs to console via `console.log` (D-11 dual emission).
    - When `getCollector()` returns null (e.g., observability disabled in tests), no throw; only the console.log fires.
    - Passing a non-LockEventLabel string is a TypeScript compile error (verified via `expectTypeOf` from vitest or `// @ts-expect-error` annotation in a test).
    - **REVISION B1:** Calling `emitLockEvent('lock_orphan_swept_by_cron', { lock_key, reason, workspaceId, holder_uuid?, age_ms })` is valid and emits via the same path. This event is documented as "emitted by Plan 06 cron sweep, NOT during normal turn-time lifecycle" — included in the union for type safety but tagged in JSDoc.
  </behavior>
  <action>
    1. Create `src/lib/agents/interruption-system-v2/observability.ts` per RESEARCH Code Example 5 lines 729-756 with these refinements:

       - Export the union `LockEventLabel` with these 14 string literals (13 from D-17 + 1 REVISION B1):
         ```
         'lock_acquired'
         'lock_acquire_failed_follower'
         'interrupt_written'
         'interrupt_detected_at_ckpt_N'
         'msg_aborted_path_a_combined'
         'msg_aborted_path_b_solo'
         'lock_released_normal'
         'follower_woke'
         'lock_force_acquired_after_ttl_expiry'
         'zombie_lambda_exit'
         'heartbeat_renewed'
         'pending_list_combined'
         'redis_unavailable_fallback_failed'
         'lock_orphan_swept_by_cron'  // REVISION B1 — Plan 06 cron emits this; payload: { lock_key, reason, workspaceId, holder_uuid?, age_ms }
         ```

       - Function signature: `export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void`.
       - Body:
         ```ts
         const collector = getCollector()
         if (collector) {
           collector.recordEvent('pipeline_decision', label, payload)
         }
         console.log(`[interruption-v2] ${label}`, payload)
         ```

       - Add a JSDoc above each event label in the union that mirrors D-17's payload shape comment (e.g., `/** Payload: { holder_uuid, msg_id, key, ttl, started_at } */`). Helps consumers understand expected payload shape without going to D-17. For the 14th label, JSDoc: `/** REVISION B1 — emitted by Plan 06 cron sweep, not turn-time lifecycle. Payload: { lock_key, reason: 'no_active_session'|'stale_age'|'malformed_value', workspaceId, holder_uuid?, age_ms } */`.

    2. Create `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts`:
       - Mock `@/lib/observability` so `getCollector` returns a stub with `recordEvent: vi.fn()`.
       - Spy on `console.log`.
       - Test all 14 labels are accepted at compile + runtime: iterate the array `const labels: LockEventLabel[] = [...]` and assert each call results in `recordEvent` being called with `('pipeline_decision', label, payload)`.
       - Test: when `getCollector()` returns null, `recordEvent` is NOT called but `console.log` IS called.
       - **Type test (LOCK-07 strict):** include a `// @ts-expect-error - invalid label rejected` line followed by `emitLockEvent('not_a_label', {})` to verify the union is enforced. Then run `npx tsc --noEmit` and confirm the file compiles (because `@ts-expect-error` swallows the error). If tsc reports an UNUSED `@ts-expect-error`, that's a regression — means the literal type isn't restrictive enough.
       - **REVISION B1 test:** include an explicit `emitLockEvent('lock_orphan_swept_by_cron', { lock_key: 'lock:ws:whatsapp:+57...', reason: 'no_active_session', workspaceId: 'ws-1', age_ms: 90000 })` call and assert it routes correctly (no type error + recordEvent called with payload).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/interruption-system-v2/__tests__/observability.test.ts --reporter=verbose 2>&1 | tail -50 && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "src/lib/agents/interruption-system-v2"</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` exits 0.
    - `grep -c "type LockEventLabel\|export type LockEventLabel" src/lib/agents/interruption-system-v2/observability.ts` ≥ 1.
    - **REVISION B1 — Count of 14 labels:** `grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|follower_woke|lock_force_acquired_after_ttl_expiry|zombie_lambda_exit|heartbeat_renewed|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l` returns 14.
    - `grep -c "lock_orphan_swept_by_cron" src/lib/agents/interruption-system-v2/observability.ts` ≥ 1 (REVISION B1 — 14th label present in union).
    - `grep -c "lock_orphan_swept_by_cron" src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` ≥ 1 (REVISION B1 — test asserts).
    - `grep -c "recordEvent('pipeline_decision'" src/lib/agents/interruption-system-v2/observability.ts` ≥ 1.
    - `grep -c "console.log" src/lib/agents/interruption-system-v2/observability.ts` ≥ 1 (D-11 dual emission).
    - `grep -c "@ts-expect-error" src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` ≥ 1 (type test).
    - `npx tsc --noEmit -p tsconfig.json` reports no new errors in `src/lib/agents/interruption-system-v2/**`.
  </acceptance_criteria>
  <done>Typed observability emitter ready; all 14 D-17-extended labels enforceable at compile (REVISION B1 — bumped from 13).</done>
</task>

</tasks>

<verification>
1. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (both test files green).
2. `npx tsc --noEmit -p tsconfig.json` reports no new errors anywhere under `src/lib/agents/interruption-system-v2/**`.
3. **REVISION B1:** All 14 D-17-extended labels enforceable: `grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|follower_woke|lock_force_acquired_after_ttl_expiry|zombie_lambda_exit|heartbeat_renewed|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l` returns 14.
4. Lua script body matches RESEARCH verbatim (line-by-line diff exits 0).
</verification>

<success_criteria>
- Wave 1 primitives shipped: redis-client + lock + observability + lua + tests for LOCK-01..03 + LOCK-07.
- Mock-redis helper ready for Plan 02 (pending + checkpoints) and Plan 07 (E2E scenarios) to reuse.
- All tests green; tsc clean.
- REVISION B1: LockEventLabel union has 14 entries (was 13) — includes `lock_orphan_swept_by_cron` for Plan 06 cron.
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/01-SUMMARY.md` listing exported symbols (acquireLock, assertHoldsLock, renewLockTTL, releaseLockIfOwner, startHeartbeat, emitLockEvent, LockEventLabel, LockHandle, LOCK_TTL_S, RELEASE_IF_OWNER_LUA) and the test count per file. **REVISION B1 note:** SUMMARY.md should record "LockEventLabel union extended to 14 entries (added lock_orphan_swept_by_cron for Plan 06 cron per D-09 verbatim)" and confirm DISCUSSION-LOG.md D-17 coverage matrix updated with row 14.
</output>
