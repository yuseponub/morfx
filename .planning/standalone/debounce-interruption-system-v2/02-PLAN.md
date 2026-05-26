---
phase: standalone-debounce-interruption-system-v2
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/interruption-system-v2/pending.ts
  - src/lib/agents/interruption-system-v2/checkpoints.ts
  - src/lib/agents/interruption-system-v2/__tests__/pending.test.ts
  - src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts
autonomous: true
requirements:
  - LOCK-04  # RPUSH/LREM by entry_uuid roundtrip
  - LOCK-05  # 8 checkpoints distributed in pipeline (helper used by Plans 04+05)

must_haves:
  truths:
    - "pushToPending serializes the entry with alphabetical key order so LREM can match the same string later (D-20 + RESEARCH Pitfall 4)."
    - "removeOwnEntry succeeds (returns true) only when given the EXACT string previously produced by pushToPending — entry_uuid alone is not sufficient; the full JSON string must match byte-for-byte (RESEARCH Pitfall 4)."
    - "readAndClearPending returns all entries and atomically clears the list in a single multi() transaction."
    - "checkpoint() returns { proceed: true } when no interrupt and lock owner matches."
    - "checkpoint() returns { proceed: false, lostLock: true } when the lock's UUID no longer matches our handle (zombie defense — D-15)."
    - "checkpoint() returns { proceed: false, interrupted: { pendingListLength } } when interrupt key exists; emits 'interrupt_detected_at_ckpt_N' with the correct checkpoint_id (LOCK-05 + D-17 event)."
    - "All 8 D-18 CheckpointId values are valid; checkpoint() rejects unknown CheckpointId at compile time (typed union)."
  artifacts:
    - path: "src/lib/agents/interruption-system-v2/pending.ts"
      provides: "pushToPending, removeOwnEntry, readAndClearPending, PendingEntry interface"
      contains: "pushToPending"
    - path: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      provides: "checkpoint(ckptId, handle, ...) helper + CheckpointId union + CheckpointResult type"
      contains: "ckpt_0_post_acquire"
    - path: "src/lib/agents/interruption-system-v2/__tests__/pending.test.ts"
      provides: "Tests covering LOCK-04 — push+lrem roundtrip + byte-exact match assertion + readAndClear atomicity"
      contains: "entry_uuid"
    - path: "src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts"
      provides: "Tests covering LOCK-05 — proceed, zombie, interrupted-Path-A, interrupted-Path-B branches + all 8 CheckpointId values"
      contains: "ckpt_7_pre_template"
  key_links:
    - from: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      to: "src/lib/agents/interruption-system-v2/lock.ts"
      via: "import { assertHoldsLock, LockHandle } from './lock'"
      pattern: "from './lock'"
    - from: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      to: "src/lib/agents/interruption-system-v2/observability.ts"
      via: "import { emitLockEvent } from './observability'"
      pattern: "from './observability'"
---

<objective>
Wave 2 — Pending list operations + checkpoint helper. `pending.ts` provides `pushToPending`/`removeOwnEntry`/`readAndClearPending` with deterministic JSON serialization (D-20 + Pitfall 4 byte-exact-match). `checkpoints.ts` provides the single `checkpoint(ckptId, handle, ...)` helper used by Plans 04 and 05 at all 8 D-18 insertion points; it combines fencing-token check (D-15) with interrupt detection in one round-trippy call.

Purpose: these two files complete the public surface of the interruption-system-v2 module. After this plan, the module is a self-contained library ready for webhook + runner + agent integrations.

Output: 4 files. After this plan, `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` runs all 4 test files green (LOCK-01..05 + LOCK-07 covered).
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

<interfaces>
<!-- From Plan 01 -->
From src/lib/agents/interruption-system-v2/lock.ts:
```typescript
export interface LockHandle { key: string; holderUuid: string; startedAt: string }
export async function acquireLock(workspaceId, channel, identifier): Promise<LockHandle | null>
export async function assertHoldsLock(handle: LockHandle): Promise<boolean>
```

From src/lib/agents/interruption-system-v2/observability.ts:
```typescript
export type LockEventLabel = 'lock_acquired' | ... | 'redis_unavailable_fallback_failed'  // 13 labels
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void
```

From src/lib/agents/interruption-system-v2/redis-client.ts:
```typescript
export const redis: Redis  // proxy
```

From src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts (Plan 01):
```typescript
export function createMockRedis(): { set, get, del, expire, rpush, lrem, lrange, llen, eval, multi, __getAll, __simulateTtlExpiry }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 2.1: Create pending.ts (RPUSH/LREM/LRANGE) + pending.test.ts (LOCK-04)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 651-706 (Code Example 3 — pending.ts verbatim with deterministic JSON keys)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 536-555 (Pitfall 4 — LREM exact-string match; explicit "store the EXACT JSON string the holder pushed in memory")
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-20 — entry shape `{ entry_uuid, content, received_at, msg_id }` + LREM strategy)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-05 — RPUSH unlimited; D-16 — RPUSH self ALWAYS, LREM-self after first send)
  </read_first>
  <behavior>
    - Test "pushToPending RPUSHes and returns {pendingListLength, exactJson}" where exactJson is keyed in alphabetical order (`content`, `entry_uuid`, `msg_id`, `received_at`).
    - Test "removeOwnEntry succeeds when given exactJson from previous pushToPending" — roundtrip works.
    - Test "removeOwnEntry FAILS when given a manually re-serialized JSON with different key order" (Pitfall 4 — byte-exact assertion).
    - Test "removeOwnEntry FAILS when entry_uuid matches but content differs" (Pitfall 4 — full string match required).
    - Test "readAndClearPending returns all entries in RPUSH order and the list is empty afterwards" (uses multi() for atomic clear).
    - Test "readAndClearPending returns [] when key doesn't exist" (no throw).
    - Test "pushToPending unlimited — pushing 100 entries returns pendingListLength=100" (D-05 unbounded).
  </behavior>
  <action>
    1. Create `src/lib/agents/interruption-system-v2/pending.ts` per RESEARCH lines 651-706 verbatim, with these refinements:

       - Export `PendingEntry` interface: `{ entry_uuid: string; content: string; received_at: string; msg_id?: string }`.
       - `pushToPending(workspaceId, channel, identifier, entry)` returns `Promise<{ pendingListLength: number; exactJson: string }>`. The `exactJson` is the literal string passed to `redis.rpush`. **Caller stores `exactJson` in memory** so it can pass it back to `removeOwnEntry` later (Pitfall 4 mitigation).
       - Use deterministic serialization: build the object with literal keys in alphabetical order (`content`, `entry_uuid`, `msg_id`, `received_at`). Verbatim from RESEARCH line 671-676:
         ```ts
         const exactJson = JSON.stringify({
           content: entry.content,
           entry_uuid: entry.entry_uuid,
           msg_id: entry.msg_id ?? null,
           received_at: entry.received_at,
         })
         ```
       - `removeOwnEntry(workspaceId, channel, identifier, exactJson)` → `redis.lrem(key, 1, exactJson)`; returns `removed === 1`.
       - `readAndClearPending(workspaceId, channel, identifier)` → `LRANGE 0 -1` + atomic `multi().del(key).exec()` (RESEARCH line 700-705). Parse each item back to PendingEntry via `JSON.parse`. Defensive: if any item fails to parse, log via `createModuleLogger` and skip that entry (don't throw).

       Note from RESEARCH line 704: items returned by `lrange<string>` may already be deserialized by @upstash/redis SDK (it auto-parses JSON-looking responses). Implementation must handle BOTH: `typeof item === 'string' ? JSON.parse(item) : (item as PendingEntry)`. Add a defensive branch.

    2. Create `src/lib/agents/interruption-system-v2/__tests__/pending.test.ts`:

       - Use the mock-redis helper from Plan 01 (`createMockRedis()` from `_helpers/mock-redis`).
       - Test happy roundtrip: `pushToPending → removeOwnEntry` with the returned exactJson succeeds.
       - **Pitfall 4 assertion (critical):** create an entry, push it, then construct a "logically equivalent" string with reversed key order: `JSON.stringify({ received_at: e.received_at, msg_id: null, entry_uuid: e.entry_uuid, content: e.content })`. Call `removeOwnEntry` with this string. Assert it returns false (the list still has the original entry). This proves Pitfall 4 mitigation works.
       - Test readAndClearPending atomicity: push 3 entries, call readAndClearPending, assert all 3 returned in order, then call `redis.llen(key)` and assert it equals 0.
       - Unbounded test: push 100 entries with `crypto.randomUUID()` in a loop, assert `pendingListLength === 100`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/interruption-system-v2/__tests__/pending.test.ts --reporter=verbose 2>&1 | tail -50</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/pending.test.ts` exits 0.
    - Test file has ≥7 `it(` / `test(` blocks (one per behavior).
    - `grep -E "content:.*entry\.content" src/lib/agents/interruption-system-v2/pending.ts` returns ≥1 match (alphabetical key order).
    - `grep -c "redis.rpush" src/lib/agents/interruption-system-v2/pending.ts` ≥ 1.
    - `grep -c "redis.lrem" src/lib/agents/interruption-system-v2/pending.ts` ≥ 1.
    - `grep -c "redis.multi" src/lib/agents/interruption-system-v2/pending.ts` ≥ 1 (atomic clear).
    - `grep -c "exactJson" src/lib/agents/interruption-system-v2/pending.ts` ≥ 3 (return type + parameter name + internal usage).
    - `grep -c "byte-exact\|exactJson\|Pitfall 4" src/lib/agents/interruption-system-v2/__tests__/pending.test.ts` ≥ 1 (test annotated with Pitfall 4 reference).
  </acceptance_criteria>
  <done>pending.ts ready; LOCK-04 covered with byte-exact-match assertion.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2.2: Create checkpoints.ts (checkpoint helper + CheckpointId union) + checkpoints.test.ts (LOCK-05)</name>
  <read_first>
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 402-460 (Pattern 3 — checkpoint helper code verbatim)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-18 — 8 checkpoints exact IDs + coverage matrix; D-15 — fencing rule; D-17 — events `interrupt_detected_at_ckpt_N`, `zombie_lambda_exit`)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 875-886 (Coverage matrix per path — conventional vs sub-loop)
  </read_first>
  <behavior>
    - Test "proceed=true when lock owner matches and no interrupt key" (LOCK-05 happy path).
    - Test "proceed=false, lostLock=true emits 'zombie_lambda_exit' when handle.holderUuid no longer matches lock value" (D-15).
    - Test "proceed=false, interrupted={pendingListLength: N} emits 'interrupt_detected_at_ckpt_N' with checkpoint_id=current ckpt when interrupt key exists" (D-17).
    - Test "interrupted result includes the actual pending list length (LLEN) at time of detection" (D-18).
    - Test "all 8 CheckpointId values compile" — iterate the array `const allCkpts: CheckpointId[] = [...]` and call checkpoint() once for each.
    - Test "passing a non-CheckpointId string is a TypeScript compile error" (// @ts-expect-error pattern).
    - Test "checkpoint() does not throw when redis is unavailable" — mock `redis.get` to throw; assert checkpoint emits 'redis_unavailable_fallback_failed' and returns `{ proceed: true }` (fail-open per RESEARCH Open Question 5 — "PROCESS, accept residual double-response risk").
  </behavior>
  <action>
    1. Create `src/lib/agents/interruption-system-v2/checkpoints.ts` per RESEARCH lines 402-460 with these explicit changes:

       - Export `CheckpointId` union type with the 8 D-18 values:
         ```ts
         export type CheckpointId =
           | 'ckpt_0_post_acquire'
           | 'ckpt_1_post_comprehension'
           | 'ckpt_2_post_state_machine'
           | 'ckpt_3_post_tooling'
           | 'ckpt_4_post_generation'
           | 'ckpt_5_post_compliance'
           | 'ckpt_6_pre_send_loop'
           | 'ckpt_7_pre_template'
         ```
         Note D-18 says `CKPT-7.N` adds `.N` suffix at runtime — the helper accepts the base id `ckpt_7_pre_template` and the caller passes `templateIndex` separately for logging.

       - Export `CheckpointResult` interface:
         ```ts
         export interface CheckpointResult {
           proceed: boolean
           interrupted?: { interruptMsgId?: string; pendingListLength: number }
           lostLock?: true
         }
         ```

       - Function signature:
         ```ts
         export async function checkpoint(
           ckptId: CheckpointId,
           handle: LockHandle,
           workspaceId: string,
           channel: 'whatsapp' | 'facebook' | 'instagram',
           identifier: string,
           opts?: { templateIndex?: number; hasSentAnything?: boolean },
         ): Promise<CheckpointResult>
         ```

       - Body per RESEARCH Pattern 3 verbatim (lines 425-459) with this enhancement: wrap the Redis calls in try/catch. On any error, emit `'redis_unavailable_fallback_failed'` with `{ error_message: err.message, at_step: ckptId }` and return `{ proceed: true }` (fail-open per Open Question 5).

       - The `interrupt_detected_at_ckpt_N` event payload includes:
         ```ts
         {
           checkpoint_id: opts?.templateIndex != null ? `${ckptId}_${opts.templateIndex}` : ckptId,
           my_holder_uuid: handle.holderUuid,
           interrupt_msg_id: interrupted,
         }
         ```

       - `interrupt` key shape: `interrupt:${workspaceId}:${channel}:${identifier}`. `pending` key: `pending:${workspaceId}:${channel}:${identifier}`.

    2. Create `src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts`:
       - Use mock-redis + mock observability (vi.mock both).
       - Tests per behavior list above. For the "all 8 CheckpointId values" test, iterate `const allCkpts: CheckpointId[] = ['ckpt_0_post_acquire', 'ckpt_1_post_comprehension', ..., 'ckpt_7_pre_template']` (must be 8 entries) — TypeScript will catch any missing entry. Confirm `allCkpts.length === 8`.
       - For fail-open test: `vi.spyOn(mockRedis, 'get').mockRejectedValueOnce(new Error('Upstash 503'))` and assert returned value is `{ proceed: true }` AND `emitLockEvent` was called with `'redis_unavailable_fallback_failed'`.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts --reporter=verbose 2>&1 | tail -60</automated>
  </verify>
  <acceptance_criteria>
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts` exits 0.
    - Test file has ≥7 `it(` / `test(` blocks.
    - `grep -c "ckpt_0_post_acquire\|ckpt_1_post_comprehension\|ckpt_2_post_state_machine\|ckpt_3_post_tooling\|ckpt_4_post_generation\|ckpt_5_post_compliance\|ckpt_6_pre_send_loop\|ckpt_7_pre_template" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 8.
    - `grep -c "interrupt_detected_at_ckpt_N" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 1.
    - `grep -c "zombie_lambda_exit" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 1.
    - `grep -c "redis_unavailable_fallback_failed" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 1 (fail-open emitted).
    - `grep -c "assertHoldsLock" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 1 (D-15 fencing).
    - `grep -c "try {" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 1 (fail-open wrapper).
    - `grep -c "interrupt:\\\${workspaceId}" src/lib/agents/interruption-system-v2/checkpoints.ts` ≥ 1 OR equivalent key construction.
    - Full module test pass: `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (lock + observability + pending + checkpoints).
  </acceptance_criteria>
  <done>Checkpoint helper ready; LOCK-05 covered including fail-open behavior.</done>
</task>

</tasks>

<verification>
1. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (all 4 test files in the module pass).
2. `npx tsc --noEmit -p tsconfig.json` reports no new errors under `src/lib/agents/interruption-system-v2/**`.
3. CheckpointId union enumerates exactly 8 values (verify by grep + manual count).
4. `pending.ts` enforces alphabetical-key serialization (visible in code, asserted in tests).
</verification>

<success_criteria>
- pending.ts + checkpoints.ts shipped with byte-exact-match guarantees and typed CheckpointId union.
- All 4 test files in the module passing; LOCK-01..05 + LOCK-07 covered.
- Module's public surface complete and ready for integration in Plan 03+.
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/02-SUMMARY.md` listing the full module export map (acquireLock, assertHoldsLock, renewLockTTL, releaseLockIfOwner, startHeartbeat, pushToPending, removeOwnEntry, readAndClearPending, checkpoint, emitLockEvent, LockHandle, PendingEntry, CheckpointId, CheckpointResult, LockEventLabel, LOCK_TTL_S) and test counts.
</output>
