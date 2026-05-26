---
phase: standalone-debounce-interruption-system-v2
plan: 01
subsystem: infra
tags: [upstash, redis, distributed-lock, fencing-token, observability, vitest, lua]

# Dependency graph
requires:
  - phase: standalone-debounce-interruption-system-v2 / plan 00
    provides: "@upstash/redis@1.38.0 installed, env vars provisioned, LOCK_TTL_S=45 + HEARTBEAT_MS=5000 baselines locked, keepTtl SUPPORTED verdict, v4 dormancy attested"
provides:
  - "src/lib/agents/interruption-system-v2/redis-client.ts — singleton @upstash/redis wrapper with fail-fast env-var validation"
  - "src/lib/agents/interruption-system-v2/lua-scripts.ts — RELEASE_IF_OWNER_LUA atomic compare-and-delete script (Pitfall 3)"
  - "src/lib/agents/interruption-system-v2/lock.ts — acquireLock / assertHoldsLock / renewLockTTL / releaseLockIfOwner / startHeartbeat primitives with D-15 fencing token + Security V5 UUID validation"
  - "src/lib/agents/interruption-system-v2/observability.ts — emitLockEvent typed emitter for the 14 D-17 + REVISION B1 labels (lock_orphan_swept_by_cron added for Plan 06 cron)"
  - "src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts — shared Vitest mock implementing 9 SDK methods + __simulateTtlExpiry / __getAll introspection helpers (reusable by Plans 02 and 07)"
  - "18 unit tests green (12 lock.test.ts + 6 observability.test.ts) — LOCK-01..03 + LOCK-07 covered"
affects:
  - Plan 02 — pending.ts + checkpoints.ts will import { redis, acquireLock, assertHoldsLock, emitLockEvent } from this module
  - Plan 03 — webhook handler will import { acquireLock, releaseLockIfOwner, emitLockEvent } for follower vs holder branch
  - Plan 04 — V4MessagingAdapter.onFirstSendCompleted will import { redis } + use { keepTtl: true } SUPPORTED branch
  - Plan 05 — somnio-v4-agent / v4-production-runner will wire checkpoint() at 8 D-18 placements + startHeartbeat lifecycle
  - Plan 06 — cron sweep will emit `lock_orphan_swept_by_cron` via the union added here (REVISION B1)
  - Plan 07 — E2E scenarios will reuse mock-redis helper + assert observability event sequences

# Tech tracking
tech-stack:
  added: []  # @upstash/redis already installed by Plan 00; no new deps in Plan 01.
  patterns:
    - "Lazy singleton via Proxy: import-time-safe Redis client that throws only on first use, allowing tests with vi.mock to short-circuit before env-var validation runs"
    - "vi.mock async factory + __mock export: tests retrieve the shared mock instance via `await import('../redis-client')` to avoid the hoisting trap of referencing a top-level const from inside a vi.mock factory"
    - "UUID regex validation BEFORE Lua ARGV: defends against Lua injection from malformed Inngest event payloads even though Lua's pcall(cjson.decode) would also reject — defense in depth (Security V5)"
    - "Typed union as observability contract: emitting an unknown label is a TypeScript compile error, not a runtime warning. New lifecycle events must be added to the union BEFORE consumers reference them."
    - "Dual emission (D-11): every lock event goes to both ObservabilityCollector AND console.log so the event survives no-collector contexts (cron, smoke tests) and remains greppable in Vercel function logs."

key-files:
  created:
    - src/lib/agents/interruption-system-v2/redis-client.ts
    - src/lib/agents/interruption-system-v2/lua-scripts.ts
    - src/lib/agents/interruption-system-v2/lock.ts
    - src/lib/agents/interruption-system-v2/observability.ts
    - src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts
    - src/lib/agents/interruption-system-v2/__tests__/lock.test.ts
    - src/lib/agents/interruption-system-v2/__tests__/observability.test.ts
  modified: []  # Plan 01 is greenfield — no existing code touched outside the new module directory.

key-decisions:
  - "LOCK_TTL_S retained at 45 (D-09 + Plan 00 Task 0.1 fallback rule with N=0 sub-loop measurement). Inline JSDoc comment on the constant cites 00-MEASUREMENTS.md §Sub-loop latency baseline so a future operator can find the rationale without grepping the plan tree."
  - "HEARTBEAT_MS = 5000 — 9x renewal margin over LOCK_TTL_S=45 (RESEARCH Pitfall 7 acceptance criterion). 3 consecutive misses tolerable since Upstash unavailability for 15s implies Redis-as-coordinator is down anyway."
  - "RELEASE_IF_OWNER_LUA script copied byte-for-byte from RESEARCH lines 327-348. pcall(cjson.decode, ...) treats malformed lock values as not-owner (returns 0) — cleanup is delegated to the Plan 06 cron via the REVISION B1 `lock_orphan_swept_by_cron` event."
  - "LockEventLabel union extended to 14 entries (added lock_orphan_swept_by_cron for Plan 06 cron per D-09 verbatim — DISCUSSION-LOG.md row 14)."
  - "Mock-redis helper exports __simulateTtlExpiry and __getAll test-only hooks now (not added later in Plan 02) — keeps the helper API stable across the wave 1..7 lifespan so downstream tests do not have to re-extend it."

patterns-established:
  - "vi.mock async factory + __mock retrieval: see lock.test.ts vi.mock('../redis-client', async () => { ... __mock: instance }) — Plan 02 and Plan 07 tests will follow the same pattern. Avoids the common 'Cannot access X before initialization' trap when the mock instance needs to be addressable from tests."
  - "Lazy singleton via Proxy: tests don't have to set env vars to import the module; only callers that actually invoke redis.* trigger the lazy getRedisClient() and its env-var check."
  - "Inline-cite measurements at constant declaration: when a constant (LOCK_TTL_S, HEARTBEAT_MS) is anchored to an empirical measurement, the JSDoc on the constant cites the measurement document by path + section. Future operators don't need to re-derive the rationale."
  - "Typed union as observability contract: emitLockEvent(label, ...) refuses unknown labels at compile time. Pattern reusable for other subsystems (sales-track, sub-loop, etc.) where label discipline matters."

requirements-completed: [LOCK-01, LOCK-02, LOCK-03, LOCK-07]

# Metrics
duration: 23 min
completed: 2026-05-25
---

# Plan 01 Wave 1 — Primitives: lock, observability, mock-redis

**SET-NX-based distributed lock with D-15 fencing token, atomic Lua release, setInterval heartbeat, and a 14-label typed observability emitter — covered by 18 unit tests.**

## Performance

- **Duration:** ~23 min (Task 1.1 + 1.2 + 1.3 sequential, two TypeScript fixups inline)
- **Started:** 2026-05-25T21:40Z
- **Completed:** 2026-05-25T22:12Z
- **Tasks:** 3 (all autonomous)
- **Files modified:** 7 (all new)

## Accomplishments

- `lock.ts` ships the 5 primitives every downstream plan will consume: `acquireLock`, `assertHoldsLock`, `renewLockTTL`, `releaseLockIfOwner`, `startHeartbeat` — plus `LOCK_TTL_S=45` and `HEARTBEAT_MS=5000` constants with inline citations to `00-MEASUREMENTS.md`.
- `RELEASE_IF_OWNER_LUA` Lua script (in `lua-scripts.ts`) implements atomic compare-and-delete via `redis.call('GET', KEYS[1])` + `pcall(cjson.decode, ...)` + `redis.call('DEL', KEYS[1])` — copied byte-for-byte from RESEARCH Pattern 1 (lines 327-348) so the atomicity guarantee survives any future refactor.
- `releaseLockIfOwner` validates `handle.holderUuid` against `/^[0-9a-f-]{36}$/i` **before** sending to Lua ARGV (Security V5 — Lua injection defense). Validates that the eval ARRAY signature (RESEARCH Pitfall 3) is used — NOT the positional form that fails silently under `@upstash/redis`.
- `observability.ts` LockEventLabel union has all 14 labels (REVISION B1 — Plan 06 cron's `lock_orphan_swept_by_cron` included even though Plan 06 emits it, so the typed contract is the source of truth and consumers can't drift).
- Shared `__tests__/_helpers/mock-redis.ts` implements 9 SDK methods + `__simulateTtlExpiry` + `__getAll`. Reusable by Plan 02 (pending + checkpoints) and Plan 07 (E2E scenarios) — keeps test setup uniform across the wave 1..7 lifespan.
- 18 unit tests green: 12 in `lock.test.ts` (LOCK-01..03) + 6 in `observability.test.ts` (LOCK-07 including the `@ts-expect-error` strict-type test).

## Task Commits

Each task was committed atomically on branch `exec/debounce-v2-wave1`:

1. **Task 1.1: redis-client singleton + RELEASE_IF_OWNER_LUA constant** — `28a2ebde` (feat)
2. **Task 1.2: lock primitives + mock-redis helper + lock.test.ts** — `617d3fc8` (feat)
3. **Task 1.3: observability.ts 14-label typed emitter + tests** — `c5587e6c` (feat)

Plan-metadata commit (this SUMMARY) lands separately so the per-task commits stay clean diff-units.

## Files Created/Modified

All 7 files are NEW under `src/lib/agents/interruption-system-v2/`:

- `redis-client.ts` — lazy singleton @upstash/redis wrapper + Proxy export. Fail-fast on missing env vars at first call (not import time — keeps vi.mock setup safe).
- `lua-scripts.ts` — `RELEASE_IF_OWNER_LUA` constant; byte-for-byte from RESEARCH Pattern 1.
- `lock.ts` — `acquireLock` (SET NX object syntax — D-02), `assertHoldsLock` (D-15 fencing token re-check + defensive JSON parse), `renewLockTTL` (refresh TTL iff owner), `releaseLockIfOwner` (UUID regex validation → atomic Lua eval with ARRAY signature), `startHeartbeat` (setInterval lifecycle returning a stop fn). Constants: `LOCK_TTL_S=45` + `HEARTBEAT_MS=5000` with citations.
- `observability.ts` — `emitLockEvent(label, payload)` with `LockEventLabel` union of 14 labels (13 D-17 + REVISION B1 `lock_orphan_swept_by_cron`). Dual emission (D-11) to `ObservabilityCollector` AND `console.log`.
- `__tests__/_helpers/mock-redis.ts` — 9 SDK method mocks + `__simulateTtlExpiry` + `__getAll`. `eval` mock specifically simulates `RELEASE_IF_OWNER_LUA` semantics.
- `__tests__/lock.test.ts` — 12 tests covering LOCK-01 (acquire happy + collision), LOCK-03 (assertHoldsLock: match + zombie + absent + malformed JSON; releaseLockIfOwner: match + zombie + Security V5 rejection of malicious UUID), LOCK-02 (renew + heartbeat lifecycle with vi.useFakeTimers).
- `__tests__/observability.test.ts` — 6 tests covering LOCK-07: (a) exactly 14 unique labels, (b) all 14 route to `recordEvent('pipeline_decision', ...)`, (c) dual emit to console.log, (d) no-throw when collector null, (e) REVISION B1 `lock_orphan_swept_by_cron` with cron payload shape, (f) `@ts-expect-error` strict-type test.

## Decisions Made

- **Used `vi.hoisted` was NOT the right primitive** — initially tried it for the mock instance, hit "Cannot access mockRedis before initialization" because vi.hoisted's body executes in module-init order. Switched to `vi.mock(name, async () => {...})` factory that creates the instance internally and re-exports via `__mock` so tests retrieve it with `await import('../redis-client')`. This pattern is documented in `patterns-established` for Plan 02+ tests to reuse.
- **`LOCK_TTL_S` JSDoc comment is verbose on purpose** — it explains the N=0 measurement situation AND the fallback rule AND the bump-to-60s trigger. A future operator who sees `lock_force_acquired_after_ttl_expiry` events firing will land on this constant via grep, and the comment tells them exactly what to do without re-reading the plan tree.
- **`releaseLockIfOwner` UUID validation uses `/^[0-9a-f-]{36}$/i`** (per RESEARCH Security V5) — strict enough to catch Lua-injection attempts even though `pcall(cjson.decode, ...)` inside the Lua script would also reject. Two layers of defense at the API boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock hoisting trap broke initial lock.test.ts**
- **Found during:** Task 1.2 (first `npx vitest run` invocation)
- **Issue:** `vi.mock('../redis-client', () => ({ redis: mockRedis }))` failed with `ReferenceError: Cannot access 'mockRedis' before initialization`. The vi.mock factory is hoisted to the top of the file by Vitest's transformer, so the top-level `const mockRedis = createMockRedis()` declaration runs AFTER the factory's first invocation.
- **Fix:** Switched to `vi.mock('../redis-client', async () => { const instance = (await import('./_helpers/mock-redis')).createMockRedis(); return { __mock: instance, redis: instance, getRedisClient: () => instance } })`. Tests retrieve the shared instance via `const mod = await import('../redis-client'); mockRedis = mod.__mock`. The pattern is documented in `patterns-established` for Plan 02+ tests.
- **Files modified:** `__tests__/lock.test.ts`
- **Verification:** All 12 lock tests pass.
- **Committed in:** `617d3fc8` (Task 1.2 commit — fix landed inline before commit).

**2. [Rule 1 - Bug] `vi.spyOn` typing rejected `ReturnType<typeof vi.spyOn>` in observability.test.ts**
- **Found during:** Task 1.3 tsc verification gate
- **Issue:** tsc emitted `TS2322: Type 'MockInstance<[message?: any, ...optionalParams: any[]], void>' is not assignable to type 'MockInstance<unknown[], unknown>'`. Attempt to fix with `ReturnType<typeof vi.spyOn<Console, 'log'>>` triggered `TS2344: Type '"log"' does not satisfy the constraint '"Console"'` — Vitest's generic constraints don't match what one would expect.
- **Fix:** Typed `consoleSpy` as `any` with an explicit ESLint-disable comment explaining the rationale (runtime contract is tested via `toHaveBeenCalled` / `mockClear`; explicit typing adds no safety). Pragmatic — the test is small and the methods called on the spy are not surface area worth typing.
- **Files modified:** `__tests__/observability.test.ts`
- **Verification:** tsc clean on the new module; all 6 observability tests pass.
- **Committed in:** `c5587e6c` (Task 1.3 commit — fix landed inline before commit).

---

**Total deviations:** 2 auto-fixed (both Rule 1 — bugs in initial implementation surfaced by automated verification gates: vitest test run + tsc).
**Impact on plan:** Both fixes were localized to test files; no production code touched. No scope creep. The vi.mock async-factory pattern is now documented as reusable for downstream plans.

## Issues Encountered

None beyond the two Rule 1 deviations above. Both were caught by the per-task automated verification gates (vitest + tsc) before commit, exactly as the plan's `<verify>` blocks specified.

## User Setup Required

None — Plan 00 already provisioned Upstash + env vars. Plan 01 is greenfield code-only.

## Self-Check

**Files exist:**
- `src/lib/agents/interruption-system-v2/redis-client.ts` — FOUND
- `src/lib/agents/interruption-system-v2/lua-scripts.ts` — FOUND
- `src/lib/agents/interruption-system-v2/lock.ts` — FOUND
- `src/lib/agents/interruption-system-v2/observability.ts` — FOUND
- `src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` — FOUND
- `src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` — FOUND
- `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` — FOUND

**Commits exist on `exec/debounce-v2-wave1`:**
- `28a2ebde` — Task 1.1 — FOUND
- `617d3fc8` — Task 1.2 — FOUND
- `c5587e6c` — Task 1.3 — FOUND

**Verification gates:**
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/lock.test.ts` — 12/12 PASS
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` — 6/6 PASS
- `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` (both files together) — 18/18 PASS
- `npx tsc --noEmit -p tsconfig.json` — 0 errors anywhere under `src/lib/agents/interruption-system-v2/**`

**REVISION B1 coverage:**
- `grep -oE "'(lock_acquired|lock_acquire_failed_follower|interrupt_written|interrupt_detected_at_ckpt_N|msg_aborted_path_a_combined|msg_aborted_path_b_solo|lock_released_normal|follower_woke|lock_force_acquired_after_ttl_expiry|zombie_lambda_exit|heartbeat_renewed|pending_list_combined|redis_unavailable_fallback_failed|lock_orphan_swept_by_cron)'" src/lib/agents/interruption-system-v2/observability.ts | sort -u | wc -l` — returns 14 ✓

## Self-Check: PASSED

## Exported Symbols (public surface for downstream plans)

| Symbol | Module | Used by |
|---|---|---|
| `acquireLock(workspaceId, channel, identifier)` | `lock.ts` | Plan 03 (webhook), Plan 07 (E2E) |
| `assertHoldsLock(handle)` | `lock.ts` | Plan 02 (checkpoints) |
| `renewLockTTL(handle)` | `lock.ts` | Plan 05 (runner heartbeat — indirect via startHeartbeat) |
| `releaseLockIfOwner(handle)` | `lock.ts` | Plan 03, Plan 05 (finally block), Plan 06 (cron sweep) |
| `startHeartbeat(handle): () => void` | `lock.ts` | Plan 05 (runner — wrap pipeline body) |
| `LockHandle` interface | `lock.ts` | All downstream plans (passed through Inngest event payloads) |
| `LOCK_TTL_S = 45` constant | `lock.ts` | Plan 06 cron (stale-age threshold derivation) |
| `HEARTBEAT_MS = 5000` constant | `lock.ts` | Plan 05 (telemetry annotation) |
| `RELEASE_IF_OWNER_LUA` constant | `lua-scripts.ts` | tests only (lock.ts is the runtime consumer) |
| `emitLockEvent(label, payload)` | `observability.ts` | All downstream plans |
| `LockEventLabel` type | `observability.ts` | All downstream plans (type narrowing) |
| `redis` Proxy export | `redis-client.ts` | Plan 02 (pending RPUSH/LREM/LRANGE), Plan 04 ({ keepTtl: true } SET), Plan 06 (cron SCAN) |
| `getRedisClient()` | `redis-client.ts` | tests (vi.mock factory verification) |
| `createMockRedis()` | `__tests__/_helpers/mock-redis.ts` | Plan 02, Plan 07 tests |

## Threat Flags

None — Plan 01 is greenfield primitives; no new endpoints, no auth paths, no DB schema. The Security V5 UUID validation in `releaseLockIfOwner` IS in scope (covered by the malicious-UUID test) and is part of the threat-mitigation surface, not new surface.

## Next Plan Readiness

- **Wave 2 / Plan 02** (pending.ts + checkpoints.ts) can start immediately:
  - imports `redis`, `acquireLock`, `assertHoldsLock`, `emitLockEvent` from this module (no re-implementation)
  - reuses `__tests__/_helpers/mock-redis.ts` for its own test file (no copy-paste)
  - follows the `vi.mock('../redis-client', async () => { ... __mock })` pattern documented in `patterns-established`
- DISCUSSION-LOG.md D-17 should gain a row 14 (`lock_orphan_swept_by_cron`) — annotated as "emitted by Plan 06 cron, not turn-time lifecycle" — to keep the documentation in sync with the union. This is a doc-only edit for the orchestrator or Plan 06 author to land separately; not a blocker for Wave 2.

---
*Phase: standalone-debounce-interruption-system-v2*
*Completed: 2026-05-25*
