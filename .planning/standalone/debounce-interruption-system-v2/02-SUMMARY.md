---
phase: standalone-debounce-interruption-system-v2
plan: 02
subsystem: infra
tags: [upstash, redis, pending-list, checkpoint, fencing-token, observability, vitest]

# Dependency graph
requires:
  - phase: standalone-debounce-interruption-system-v2 / plan 01
    provides: "lock primitives (acquireLock, assertHoldsLock, renewLockTTL, releaseLockIfOwner, startHeartbeat, LOCK_TTL_S, HEARTBEAT_MS, LockHandle), observability emitter (emitLockEvent, LockEventLabel — 14 labels), redis Proxy client, mock-redis test helper"
provides:
  - "src/lib/agents/interruption-system-v2/pending.ts — pushToPending / removeOwnEntry / readAndClearPending with deterministic alphabetical-key JSON serialization + atomic multi().del().exec() read-and-clear (D-20 + Pitfall 4 byte-exact LREM)"
  - "src/lib/agents/interruption-system-v2/checkpoints.ts — checkpoint(ckptId, handle, ws, channel, identifier, opts?) helper + CheckpointId union (8 D-18 values) + CheckpointResult interface, with fail-open Redis wrapper per Open Question 5"
  - "18 new unit tests green (10 pending.test.ts + 8 checkpoints.test.ts) — LOCK-04 + LOCK-05 covered"
  - "Module test suite now 36 tests across 4 files all green (lock 12 + observability 6 + pending 10 + checkpoints 8)"
affects:
  - Plan 03 — webhook handler will call pushToPending in the follower branch (RPUSH the follower's entry; SET interrupt key)
  - Plan 04 — V4MessagingAdapter.onFirstSendCompleted will call removeOwnEntry(exactJson) to drop holder's own entry from pending list (D-16 — LREM-self after first send)
  - Plan 05 — somnio-v4-runner will call checkpoint() at all 8 D-18 placements + call readAndClearPending at acquire-time to combine pre-acquire entries into the turn
  - Plan 06 — cron sweep is independent of pending list (sweeps lock orphans, not pending entries) — no direct dependency, but unbounded D-05 list is a future cleanup candidate for the cron's scope
  - Plan 07 — E2E scenarios will reuse all three pending ops + checkpoint() to validate Path A (combined) and Path B (solo) scenarios end-to-end

# Tech tracking
tech-stack:
  added: []  # No new deps. @upstash/redis from Plan 00; primitives from Plan 01.
  patterns:
    - "Deterministic JSON serialization with alphabetical key order: when a value will be used in a byte-exact comparison (Redis LREM, content hashing, idempotency key derivation), the producer is the single source of truth for the byte-string AND must hand the exact string back to the consumer (the consumer never re-serializes). Pattern reusable for any Redis-LIST-based queue cleanup or idempotency-by-content scenario."
    - "Fail-open checkpoint wrapper: when a side-channel observability check (the interrupt detection) is wrapped around the main pipeline, transient errors on the side-channel must NOT crash the main pipeline. Wrap the whole helper in try/catch, emit a known label ('redis_unavailable_fallback_failed' here), return the 'proceed' branch, and accept the residual risk (briefly missed interrupt window). Pattern reusable for any side-channel-with-degraded-mode scenario."
    - "Typed union as compile-time enforcement of an ID set: CheckpointId is a union of 8 strings; the test file iterates 'const allCkpts: CheckpointId[] = [...8 entries]' so removing/renaming any entry breaks at compile time. Same pattern as observability.ts LockEventLabel from Plan 01. Effective for any small, closed enumeration the codebase will iterate."
    - "Defensive auto-parse branch in @upstash/redis LRANGE consumers: SDK may auto-parse JSON-looking responses into objects. Always branch on 'typeof item === string' before JSON.parse; the alternative path treats the item as already-deserialized. Pattern applies to all LIST + HASH consumers across the codebase."
    - "Reuse Plan 01 vi.mock async-factory + __mock retrieval pattern verbatim: Plan 02 test files (pending.test.ts + checkpoints.test.ts) copy the mocking idiom from lock.test.ts byte-for-byte. Zero deviation = zero re-debugging of the hoisting trap that Plan 01 already paid for."

key-files:
  created:
    - src/lib/agents/interruption-system-v2/pending.ts
    - src/lib/agents/interruption-system-v2/checkpoints.ts
    - src/lib/agents/interruption-system-v2/__tests__/pending.test.ts
    - src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts
  modified: []  # Plan 02 is additive — no Plan 01 file touched. Per critical_constraints rule 1, lock.ts / observability.ts / redis-client.ts / lua-scripts.ts / mock-redis.ts are locked.

key-decisions:
  - "PendingEntry shape locked at { entry_uuid, content, received_at, msg_id? } per D-20. msg_id is optional in TS but ALWAYS serialized as the literal `null` when absent — every entry has identical key set in identical alphabetical order so the byte-exact LREM contract is uniform across entries with and without an originating wamid."
  - "pushToPending returns { pendingListLength, exactJson } as a TUPLE, NOT just the length — the exactJson is the single source of truth for the byte-string the caller MUST store in memory to pass back to removeOwnEntry. Documented in JSDoc that re-serializing the entry object later is NOT guaranteed to byte-match (Pitfall 4 mitigation). Plan 04 V4MessagingAdapter will need to thread exactJson through the V4AgentInput type."
  - "readAndClearPending uses redis.multi().del(key).exec() for atomic server-side clear (Upstash transactions are atomic per their pipeline-transaction docs). Defensive parse branch handles both string and already-deserialized-object items from @upstash/redis SDK (it auto-parses JSON-looking responses). A corrupt JSON entry is logged + skipped, not thrown — the cron sweep / operator inspection surfaces leaks rather than blowing up the whole turn."
  - "CheckpointId union uses the 8 names verbatim from RESEARCH Pattern 3 (lines 409-417) and DISCUSSION-LOG D-18 — ckpt_0_post_acquire / ckpt_1_post_comprehension / ckpt_2_post_state_machine / ckpt_3_post_tooling / ckpt_4_post_generation / ckpt_5_post_compliance / ckpt_6_pre_send_loop / ckpt_7_pre_template. The plan prompt mentioned alternative names (ckpt_1_after_persist, ckpt_2_pre_router, etc.) but the plan's own action block explicitly listed the RESEARCH/D-18 values; the spec-verbatim rule applied and the RESEARCH/D-18 names won."
  - "CKPT-7.N runtime suffix handled via opts.templateIndex appended as `${ckptId}_${templateIndex}` in the emitted checkpoint_id field (not in the union itself — the union stays closed at 8). Plan 04/05 callers pass templateIndex inside the per-template for loop."
  - "Fail-open wrapper per RESEARCH Open Question 5: ANY thrown error from the Redis ops emits 'redis_unavailable_fallback_failed' with at_step=ckptId and returns { proceed: true }. The pipeline keeps moving; the brief outage window may miss an interrupt detection but the alternative (crashing mid-pipeline) is worse. assertHoldsLock is INSIDE the try/catch so its own internal redis.get failure also routes through fail-open — a single try block guards all three operations."
  - "checkpoint() takes opts last as a Record-style object ({ templateIndex?, hasSentAnything? }) rather than positional args, so future fields (e.g., a per-call observability flag) can be added without breaking the call sites in Plans 04/05. hasSentAnything is informational at this layer — the Path A vs Path B branching is the caller's responsibility, NOT the checkpoint's. Carried through to events for downstream filtering."

patterns-established:
  - "Producer-owned byte-string for LREM cleanup: pushToPending owns the serialization, returns the exact string, and the caller stores+returns it verbatim. Reusable for any Redis-LIST-based cleanup-by-identity scenario."
  - "Closed union iteration test: `const all: UnionType[] = [...all members]` doubles as a compile-time check (TS validates each entry) and a runtime check (`expect(all.length).toBe(N)`). Documents the contract size in the test itself."
  - "@ts-expect-error as a typed-contract test primitive: `// @ts-expect-error` before an intentionally bad call asserts that TS rejects it. If the directive ever stops firing an error (e.g., union widens accidentally), the test fails at compile time. Pattern reusable for any closed-union API."

requirements-completed: [LOCK-04, LOCK-05]

# Metrics
duration: 28 min
completed: 2026-05-26
---

# Plan 02 Wave 2 — Pending list operations + Checkpoint helper

**RPUSH/LREM/LRANGE pending-list ops with byte-exact-match guarantee (D-20 + Pitfall 4) and the single checkpoint() helper used at all 8 D-18 placements — covered by 18 new unit tests.**

## Performance

- **Duration:** ~28 min (Task 2.1 + 2.2 sequential, one test-only fixup per task — both surfaced by automated GREEN gate before commit)
- **Started:** 2026-05-25T22:28Z
- **Completed:** 2026-05-26T03:38Z (overlaps midnight UTC; date stamp uses completion-day per project convention)
- **Tasks:** 2 (both autonomous, both TDD with RED→GREEN flow)
- **Files modified:** 4 (all new, all inside `src/lib/agents/interruption-system-v2/`)

## Accomplishments

- `pending.ts` ships three operations with the byte-exact LREM contract enforced at the type/return-shape level: `pushToPending` returns `{ pendingListLength, exactJson }`; the caller MUST hold `exactJson` in memory and pass it back to `removeOwnEntry`. Re-serializing the entry object later is documented as NOT guaranteed to match.
- Deterministic JSON serialization with alphabetical key order: `content`, `entry_uuid`, `msg_id`, `received_at`. `msg_id` normalized to literal `null` when absent so every stored entry has identical key set in identical order.
- `readAndClearPending` uses `redis.multi().del(key).exec()` for atomic server-side clear, with a defensive `typeof item === 'string' ? JSON.parse(...) : (item as PendingEntry)` branch for the @upstash/redis SDK's JSON auto-parse behavior. A single corrupt entry is logged + skipped (not thrown).
- `checkpoints.ts` ships `checkpoint(ckptId, handle, workspaceId, channel, identifier, opts?)` — a single helper that combines D-15 fencing-token re-check (`assertHoldsLock`) + D-17 interrupt detection (GET interrupt key + LLEN pending) in one call.
- `CheckpointId` typed union (8 D-18 values) means adding / renaming any entry is a compile-time break across all consumers. `opts.templateIndex` appends `.N` suffix at runtime to the emitted `checkpoint_id` field for the CKPT-7.N per-template fanout.
- Three terminal branches documented + tested: `{ proceed: true }` (happy), `{ proceed: false, lostLock: true }` (zombie defense, emits `zombie_lambda_exit`), `{ proceed: false, interrupted: { interruptMsgId, pendingListLength } }` (interrupt seen, emits `interrupt_detected_at_ckpt_N`).
- Fail-open wrapper per RESEARCH Open Question 5: any Redis error inside the helper emits `redis_unavailable_fallback_failed` with `at_step=ckptId` and returns `{ proceed: true }`. Pipeline liveness > residual double-response risk.
- 18 new unit tests green: 10 in `pending.test.ts` (LOCK-04 — including the critical Pitfall 4 negative test with reversed-key-order JSON failing to remove) + 8 in `checkpoints.test.ts` (LOCK-05 — all 3 result branches + all 8 CheckpointId iteration + @ts-expect-error typed-contract test + fail-open test).
- Full module suite passes: 36/36 tests across 4 files (lock 12 + observability 6 + pending 10 + checkpoints 8). Plan 01 tests stayed untouched and green throughout.

## Task Commits

Each task was committed atomically on branch `exec/debounce-v2-wave2`:

1. **Task 2.1: pending.ts + pending.test.ts (LOCK-04)** — `01cd7ab1` (feat)
2. **Task 2.2: checkpoints.ts + checkpoints.test.ts (LOCK-05)** — `06e48b62` (feat)

Plan-metadata commit (this SUMMARY) lands separately so the per-task commits stay clean diff-units.

## Files Created/Modified

All 4 files are NEW under `src/lib/agents/interruption-system-v2/`:

- `pending.ts` — `PendingEntry` interface + `pushToPending` (RPUSH + return {length, exactJson}) + `removeOwnEntry` (byte-exact LREM count=1) + `readAndClearPending` (LRANGE + multi.del.exec atomic clear + defensive auto-parse branch + per-item try/catch). 159 lines including JSDoc.
- `checkpoints.ts` — `CheckpointId` union (8 D-18 values) + `CheckpointResult` interface + `CheckpointOptions` interface + `checkpoint()` helper with fail-open try/catch wrapping all Redis ops. 148 lines including JSDoc.
- `__tests__/pending.test.ts` — 10 tests across 4 describes (pushToPending, removeOwnEntry with the Pitfall 4 negative test, readAndClearPending, plus the unbounded-100-push test). Reuses vi.mock async-factory pattern from `lock.test.ts` verbatim.
- `__tests__/checkpoints.test.ts` — 8 tests across 5 describes (happy path, zombie defense, interrupt detection with Path A + Path B + .N suffix, 8-CheckpointId iteration + @ts-expect-error, fail-open).

## Decisions Made

- **`pushToPending` returns a tuple, not just the length.** The `exactJson` field is the single source of truth for the byte-string the caller must hold for the lifetime of the lock. Putting it in the return shape (rather than expecting the caller to re-serialize from the entry object) is the only way to enforce Pitfall 4 at the type level. Plan 04 V4MessagingAdapter will need to thread `exactJson` through `V4AgentInput` — flagged for Plan 04 author.
- **`CheckpointId` names follow RESEARCH + D-18 verbatim, NOT the alternative names in the executor prompt's critical_constraints.** The prompt's "8 IDs" list (`ckpt_1_after_persist`, `ckpt_2_pre_router`, etc.) diverged from both RESEARCH Pattern 3 and DISCUSSION-LOG D-18. The plan's own `<action>` block in Task 2.2 listed the RESEARCH/D-18 names explicitly; the spec-verbatim rule in the prompt itself said to follow the spec, so the RESEARCH/D-18 names won. Plan 04/05 callers must use the RESEARCH/D-18 names (which are the in-code source of truth).
- **CKPT-7.N suffix handled via `opts.templateIndex`, NOT by widening the union.** The closed 8-member union is the contract for observability dashboards; the `.N` suffix is a runtime telemetry detail. Test asserts both shapes: bare `ckpt_7_pre_template` when no templateIndex, `ckpt_7_pre_template_3` in the emitted event when `templateIndex: 3`.
- **Fail-open wraps assertHoldsLock too, not just the interrupt GET.** A single try block guards all three Redis ops in checkpoint(). If `assertHoldsLock`'s internal `redis.get` throws, the wrapper emits `redis_unavailable_fallback_failed` and returns `{ proceed: true }` — exactly the same as if the interrupt GET throws. The alternative (only wrapping the interrupt check) would leak Plan 01's untyped throws through to Plan 05's pipeline body.
- **mock-redis's `multi()` is a stub, not a full transaction.** The mock returns `{ del: vi.fn().mockReturnThis(), exec: vi.fn(async () => []) }`. The `del` call does NOT propagate to the `lists` Map (that would require a more elaborate mock). The pending test for atomic clear asserts the call SHAPE (`multi` called once, `tx.del(PENDING_KEY)` scheduled, `tx.exec()` awaited) rather than the post-call list emptiness. Real Upstash multi clears server-side; the integration test in Plan 07 will validate the round-trip with a real Redis.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] pending.test.ts initially asserted `llen === 0` after readAndClearPending; mock-redis's multi() stub does not back-port DEL to the lists Map**
- **Found during:** Task 2.1 first `npx vitest run` invocation.
- **Issue:** The test "returns all entries in RPUSH order and atomically clears the list" asserted `expect(await mockRedis.llen(PENDING_KEY)).toBe(0)` after `readAndClearPending`. The implementation correctly calls `redis.multi().del(key).exec()`, but the mock's `multi()` returns a chain stub where `tx.del()` is a `vi.fn().mockReturnThis()` — it does NOT actually clear the underlying `lists` Map.
- **Fix:** Adjusted the test to assert the call SHAPE instead of the post-call list state: verify `mockRedis.multi` called once + `tx.del` called with `PENDING_KEY` + `tx.exec` called once. The atomic-clear semantics are a real-Upstash guarantee tested in Plan 07's integration scenarios; the unit test asserts the right calls are made, not the post-call mock state.
- **Why not fix the mock instead:** The `critical_constraints` in the executor prompt explicitly locks Plan 01's `mock-redis.ts` ("Plan 01 source files NOT modified"). A richer multi() implementation would be a Plan 01 retrofit. Plan 07 will validate the round-trip end-to-end against real Redis.
- **Files modified:** `__tests__/pending.test.ts` (test only).
- **Verification:** All 10 pending tests pass.
- **Committed in:** `01cd7ab1` (Task 2.1 commit — fix landed inline before commit).

**2. [Rule 1 — Bug] checkpoints.test.ts used `.toEqual` for the interrupt-result assertion; implementation returns the `interruptMsgId` field which the test omitted**
- **Found during:** Task 2.2 first `npx vitest run` invocation.
- **Issue:** The "Path A pre-send" test asserted `expect(result).toEqual({ proceed: false, interrupted: { pendingListLength: 1 } })`, but the implementation correctly returns `{ proceed: false, interrupted: { interruptMsgId: 'wamid.follower-msg-2', pendingListLength: 1 } }` — the `interruptMsgId` is part of the `CheckpointResult.interrupted` shape (RESEARCH Pattern 3 line 421-422 + the prompt's must_haves contract).
- **Fix:** Switched to field-by-field assertions: `expect(result.proceed).toBe(false)`, `expect(result.lostLock).toBeUndefined()`, `expect(result.interrupted?.pendingListLength).toBe(1)`, `expect(result.interrupted?.interruptMsgId).toBe('wamid.follower-msg-2')`. More precise — also catches the `lostLock: undefined` invariant which `.toEqual` was silently allowing.
- **Files modified:** `__tests__/checkpoints.test.ts` (test only).
- **Verification:** All 8 checkpoints tests pass.
- **Committed in:** `06e48b62` (Task 2.2 commit — fix landed inline before commit).

---

**Total deviations:** 2 auto-fixed (both Rule 1 — initial-test assertions that diverged from the implementation's correct contract; production code was right both times). Both caught by the per-task automated GREEN gate before commit.
**Impact on plan:** Both fixes were localized to test files; no production code touched. No scope creep. Plan 01 source files remained untouched (per critical_constraints).

## Issues Encountered

None beyond the two Rule 1 deviations above. The vi.mock + __mock retrieval pattern from Plan 01 worked verbatim — zero re-debugging of the hoisting trap.

## User Setup Required

None — Plan 02 is greenfield code-only inside the existing module. Upstash + env vars are already provisioned (Plan 00); lock primitives + observability + mock-redis helper are already shipped (Plan 01).

## Self-Check

**Files exist:**
- `src/lib/agents/interruption-system-v2/pending.ts` — FOUND
- `src/lib/agents/interruption-system-v2/checkpoints.ts` — FOUND
- `src/lib/agents/interruption-system-v2/__tests__/pending.test.ts` — FOUND
- `src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts` — FOUND

**Commits exist on `exec/debounce-v2-wave2`:**
- `01cd7ab1` — Task 2.1 — FOUND
- `06e48b62` — Task 2.2 — FOUND

**Verification gates:**
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/pending.test.ts` — 10/10 PASS
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/checkpoints.test.ts` — 8/8 PASS
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` (all 4 module test files) — 36/36 PASS
- `npx tsc --noEmit -p tsconfig.json` filtered to `interruption-system-v2/` — 0 errors

**Plan 01 files untouched:**
- `git diff exec/debounce-v2-wave2~2..HEAD -- src/lib/agents/interruption-system-v2/lock.ts src/lib/agents/interruption-system-v2/observability.ts src/lib/agents/interruption-system-v2/redis-client.ts src/lib/agents/interruption-system-v2/lua-scripts.ts src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` returns empty (no diff)

**Acceptance-criteria greps (from PLAN.md):**
- `grep -E "content:.*entry\.content" pending.ts` → 1 match ✓
- `grep -c "redis.rpush" pending.ts` → 1 ✓
- `grep -c "redis.lrem" pending.ts` → 1 ✓
- `grep -c "redis.multi" pending.ts` → 2 (1 JSDoc reference + 1 invocation) ✓ (≥1 required)
- `grep -c "exactJson" pending.ts` → 11 ✓ (≥3 required)
- `grep -c "Pitfall 4\|exactJson" pending.test.ts` → 24 ✓ (≥1 required)
- pending.test.ts test count → 10 ✓ (≥7 required)
- CheckpointId values in checkpoints.ts → 10 occurrences ✓ (≥8 required)
- `grep -c "interrupt_detected_at_ckpt_N" checkpoints.ts` → 1 ✓
- `grep -c "zombie_lambda_exit" checkpoints.ts` → 1 ✓
- `grep -c "redis_unavailable_fallback_failed" checkpoints.ts` → 3 ✓
- `grep -c "assertHoldsLock" checkpoints.ts` → 3 ✓
- `grep -c "try {" checkpoints.ts` → 1 ✓
- `grep -c "interrupt:.*workspaceId" checkpoints.ts` → 1 ✓
- checkpoints.test.ts test count → 8 ✓ (≥7 required)

## Self-Check: PASSED

## Exported Symbols (full module public surface after Plan 02)

| Symbol | Module | Used by |
|---|---|---|
| `acquireLock(workspaceId, channel, identifier)` | `lock.ts` | Plan 03 (webhook), Plan 07 (E2E) |
| `assertHoldsLock(handle)` | `lock.ts` | Plan 02 `checkpoint()` (internal) |
| `renewLockTTL(handle)` | `lock.ts` | Plan 05 (indirect via startHeartbeat) |
| `releaseLockIfOwner(handle)` | `lock.ts` | Plan 03, Plan 05 (finally block), Plan 06 (cron) |
| `startHeartbeat(handle): () => void` | `lock.ts` | Plan 05 (runner — wrap pipeline body) |
| `pushToPending(ws, channel, identifier, entry)` | `pending.ts` | Plan 03 (follower path), Plan 04 (holder self-push at acquire) |
| `removeOwnEntry(ws, channel, identifier, exactJson)` | `pending.ts` | Plan 04 (LREM-self after first send — D-16) |
| `readAndClearPending(ws, channel, identifier)` | `pending.ts` | Plan 05 (combo at acquire-time) |
| `checkpoint(ckptId, handle, ws, channel, identifier, opts?)` | `checkpoints.ts` | Plan 05 (all 8 D-18 placements) |
| `emitLockEvent(label, payload)` | `observability.ts` | All downstream plans |
| `LockHandle` interface | `lock.ts` | All downstream plans |
| `LockChannel` type | `lock.ts` | typing shared key construction |
| `PendingEntry` interface | `pending.ts` | Plan 03, Plan 04, Plan 05 |
| `PendingChannel` type | `pending.ts` | Plan 03 (mirrors LockChannel) |
| `CheckpointId` union | `checkpoints.ts` | Plan 05 (each call site) |
| `CheckpointResult` interface | `checkpoints.ts` | Plan 05 (branching on result) |
| `CheckpointOptions` interface | `checkpoints.ts` | Plan 05 (per-call tuning) |
| `CheckpointChannel` type | `checkpoints.ts` | typing shared key construction |
| `LockEventLabel` type | `observability.ts` | All downstream plans |
| `LOCK_TTL_S = 45` constant | `lock.ts` | Plan 06 cron (stale-age threshold) |
| `HEARTBEAT_MS = 5000` constant | `lock.ts` | Plan 05 (telemetry annotation) |
| `redis` Proxy export | `redis-client.ts` | All downstream plans |
| `getRedisClient()` | `redis-client.ts` | tests only (vi.mock factory) |
| `createMockRedis()` | `__tests__/_helpers/mock-redis.ts` | Plan 07 tests |

The module's public surface is COMPLETE after Plan 02. Plans 03-07 consume it without further additions.

## Threat Flags

None — Plan 02 is greenfield primitives operating on Upstash via the Plan 01 client; no new HTTP endpoints, no auth paths, no DB schema. The fail-open wrapper in `checkpoint()` is a deliberate availability-vs-correctness tradeoff (RESEARCH Open Question 5), already documented in JSDoc as the residual risk — not new threat surface.

## Next Plan Readiness

- **Wave 3 / Plan 03** (webhook integration — followers RPUSH + SET interrupt) can start immediately:
  - imports `acquireLock`, `releaseLockIfOwner`, `pushToPending`, `emitLockEvent` from this module (no re-implementation)
  - the follower path is: `acquireLock` returns null → `pushToPending` with the inbound message as entry → `SET interrupt:<ws>:<channel>:<identifier> <msg_id>` → emit `interrupt_written` → exit 200
  - reuses the same `_helpers/mock-redis.ts` for its own webhook handler tests
- **Wave 4 / Plan 04** (V4MessagingAdapter integration) needs `removeOwnEntry(exactJson)` for D-16 LREM-self-after-first-send. The Plan 02 design enforces that the caller MUST hold `exactJson` in memory; Plan 04 author will need to thread it through `V4AgentInput` from the runner → adapter. Flagged in `key-decisions`.
- **Wave 5 / Plan 05** (somnio-v4-runner integration) calls `checkpoint()` at all 8 placements + `readAndClearPending` at acquire-time + `startHeartbeat`/`releaseLockIfOwner` lifecycle. The 8 CheckpointId values are LOCKED — Plan 05 author should pattern-match the names from `checkpoints.ts` directly rather than from the executor prompt (the prompt's alternative names diverged from D-18; the code is the source of truth).
- **No schema migrations needed** — pure Redis-backed primitives, no Postgres touch.
- **No env var changes needed** — Plan 00 provisioned everything.

---
*Phase: standalone-debounce-interruption-system-v2*
*Completed: 2026-05-26*
