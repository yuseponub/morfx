---
phase: standalone-debounce-v2-sandbox-integration
plan: 04
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts
  - src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts
  - src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts
autonomous: true
requirements:
  - D-02  # Tests assert channel='whatsapp' literal + 'sandbox-' identifier prefix (R3)
  - D-04  # Tests cover CKPT-0/6/7 dispatch + agent-discriminator (CKPT-3/4/5 via mocked V4AgentOutput.errorMessage prefix)
  - D-06  # Tests cover HOLDER acquires + processes + writes sandbox-result; FOLLOWER returns deferred=true
  - D-07  # Tests cover FOLLOWER response shape exactly: { success, deferred, sandboxSessionId, reason, pendingListLength } + long-poll endpoint coverage (L1/L2)
  - D-14  # Tests: unit tests for engine + route + long-poll endpoint (parallel to D-14 manual smoke in Plan 05)
  - D-15  # Tests assert ZERO module changes + Regla 6 anchors (v1/v2/v3/recompra branches do NOT call acquireLock)

must_haves:
  truths:
    - "NEW file `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` (~180 LOC) with 8 vitest scenarios labeled E1..E8 covering the Plan 01 engine extension."
    - "NEW file `src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` (~220 LOC) with 10 vitest scenarios labeled R1..R10 covering the Plan 02 route HOLDER/FOLLOWER branch."
    - "NEW file `src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` (~60 LOC) with 2 vitest scenarios labeled L1..L2 covering the Plan 02 long-poll endpoint (WARNING 2 fix)."
    - "Engine tests use createMockRedis() helper from `src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts` (already shipped by parent standalone) + vi.mock for `@/lib/agents/interruption-system-v2/redis-client` + vi.mock for `@/lib/observability` to capture emittedEvents."
    - "Engine tests mock the agent module: `vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', () => ({ processMessage: vi.fn() }))` to return canned V4AgentOutput per iteration; iteration N's input verified via `agentMock.mock.calls[N-1][0]`."
    - "E1 (happy CKPT-0/6/7 + lock_released_normal): single agent call returns success; CKPT-0/6/7 all proceed; lock_released_normal emitted; templates_sent equals output.messages.length; sandbox-result:{id} Redis key written before finally release."
    - "E2 (CKPT-0 interrupt + combine + restart): pre-stage pending entry with msg2 + interrupt key; iter 1 CKPT-0 catches → drains pending + restart-continue; iter 2 agent receives [msg1, msg2].join('\\n') chronologically (post-fix 2026-05-27); restart_iteration: 1 in payloads; single lock_released_normal."
    - "E3 (agent-discriminator interrupt → restart): iter 1 agent returns errorMessage='interrupted_at_ckpt_3_post_tooling'; iter 2 returns success; restart_iteration: 1 in payload; tokens accumulate."
    - "E4 (CKPT-6 interrupt → restart): mid-iteration stage msg2 + interrupt → CKPT-6 catches → restart-continue."
    - "E5 (CKPT-7.N first-template interrupt → empty, NO restart): result.messages empty; NO restart_iteration in any ckpt_7 event payload (CKPT-7 is post-send per D-05)."
    - "E6 (CKPT-7.N mid-template interrupt → partial, NO restart): result.messages has only template_0; emits msg_aborted_path_b_solo; templates_sent === 1."
    - "E7 (LostLockError → zombie_lambda_exit): emits zombie_lambda_exit; returns V4EngineOutput with error.code='V4_ZOMBIE_LAMBDA_EXIT'; sandbox-result key written so FOLLOWER long-poll does not hang."
    - "E8 (lockHandle null fail-open): no checkpoint dispatch; no lock events; agent invoked normally; behavior identical to pre-this-standalone."
    - "Route tests mock all 5 interruption-v2 imports (lock, pending, observability, redis-client) + mock SomnioV4Engine + mock runWithCollector pass-through stub."
    - "R1 (HOLDER): acquireLock returns LockHandle → SomnioV4Engine.processMessage called with full lock fields → response is engine result."
    - "R2 (FOLLOWER): acquireLock returns null → pushToPending called + redis.set('interrupt:...') called → response is exact shape { success: true, deferred: true, sandboxSessionId, reason: 'follower_appended_to_pending', pendingListLength } HTTP 200; engine NOT called."
    - "R3 (D-02 Option C lock key shape): acquireLock called with channel='whatsapp' literal AND identifier=`sandbox-${sandboxSessionId}` — NEVER with 'sandbox' channel literal."
    - "R4 (fail-open: acquireLock throws): emitLockEvent called with 'redis_unavailable_fallback_failed'; engine still called with lockHandle=null; HTTP 200 (not 500)."
    - "R5 (sandboxSessionId missing): HTTP 400 with { error: 'sandboxSessionId required for v4 sandbox' }."
    - "R6/R7/R8/R9 (Regla 6 anchors via negative assertion): agentId='somnio-sales-v3' / 'somnio-sales-v2' / 'somnio-recompra-v1' / missing → `acquireLockMock`, `pushToPendingMock`, and `emitLockEventMock` ALL have ZERO calls — REGARDLESS of whether the non-v4 engine itself succeeds or throws under test mocks. Each scenario wraps the POST handler call in `try { await POST(...) } catch { /* expected — engine may fail under mock */ }` so the negative assertion is the test's load-bearing claim, NOT engine success. The value of these tests is proving NO interruption-system-v2 primitive was invoked at the API entrypoint when agentId is not v4, which is the Regla 6 byte-identity claim at the route layer."
    - "R10 (Pitfall 3 collector wrap): runWithCollector spy called with a function whose execution invokes mocked SomnioV4Engine.processMessage."
    - "L1 (long-poll happy): redis.get returns serialized result on first or second poll iteration → endpoint returns { ready: true, result: {...} } AND calls redis.del on the key."
    - "L2 (long-poll timeout): redis.get returns null for all 30s → endpoint returns { ready: false, timeout: true } HTTP 200. Test uses `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)` to avoid real 30s wait."
    - "Existing test suite `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` continues to pass (all 6 prior suites green; this plan adds 3 NEW files OUTSIDE that directory)."
  artifacts:
    - path: "src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts"
      provides: "8 vitest scenarios validating Plan 01 engine extension"
      contains: "E1\\|E2\\|E3\\|E4\\|E5\\|E6\\|E7\\|E8"
    - path: "src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts"
      provides: "10 vitest scenarios validating Plan 02 route HOLDER/FOLLOWER branch + Regla 6 anchors (negative-assertion pattern)"
      contains: "R1\\|R2\\|R3\\|R4\\|R5\\|R6\\|R7\\|R8\\|R9\\|R10"
    - path: "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts"
      provides: "2 vitest scenarios validating Plan 02 long-poll endpoint (L1 happy / L2 timeout with fake timers)"
      contains: "L1\\|L2"
  key_links:
    - from: "src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts"
      to: "src/lib/agents/somnio-v4/engine-v4.ts (Plan 01)"
      via: "imports SomnioV4Engine + V4EngineInput; instantiates with mocked deps; asserts restart-loop + CKPT dispatch"
      pattern: "SomnioV4Engine"
    - from: "src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts"
      to: "src/app/api/sandbox/process/route.ts (Plan 02)"
      via: "imports POST handler + invokes with mocked Request; asserts HOLDER/FOLLOWER + Regla 6 anchors"
      pattern: "agentId.*somnio-sales-v4"
    - from: "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts"
      to: "src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts (Plan 02 long-poll)"
      via: "imports GET handler + mocked NextRequest + vi.useFakeTimers() for L2"
      pattern: "GET.*sandbox-result"
    - from: "Both engine + route test files"
      to: "src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts"
      via: "createMockRedis() shipped by parent standalone (UNCHANGED)"
      pattern: "createMockRedis"
---

<objective>
Wave 3 — Validate Plans 01 + 02 with vitest. Three new test files. Engine tests prove restart-loop semantics + Pitfall 5 sandbox-result write + LostLockError zombie path + lockHandle-null fail-open. Route tests prove HOLDER/FOLLOWER discrimination + D-02 Option C lock-key shape + Regla 6 anchors (zero lock calls in v1/v2/v3/recompra branches, asserted via negative claim that tolerates engine throws under mocks). Long-poll endpoint tests prove the FOLLOWER long-poll happy path + timeout path (using fake timers).

Purpose: catch regressions before manual smoke. The engine + route + long-poll endpoint together implement a distributed-coordination contract — once shipped, every change to either file MUST keep these tests green. R6/R7/R8/R9 are the load-bearing Regla 6 safety net (anti-leak proof) — they tolerate non-v4 engine failures under test mocks because the assertion is "NO interruption-system-v2 primitive was invoked," not "engine succeeded."

Plan 04 runs in PARALLEL with Plan 03 (zero file overlap).

Output: 3 new test files (~+460 LOC total). Existing interruption-v2 test suite continues to pass.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md
@.planning/standalone/debounce-v2-sandbox-integration/01-PLAN.md
@.planning/standalone/debounce-v2-sandbox-integration/01-SUMMARY.md
@.planning/standalone/debounce-v2-sandbox-integration/02-PLAN.md
@.planning/standalone/debounce-v2-sandbox-integration/02-SUMMARY.md
@.planning/standalone/debounce-v2-interrupt-reprocess/02-PLAN.md

<interfaces>
<!-- Test pattern reference — existing parent standalone -->
From `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` lines 1-50 (READ for mock pattern; do NOT modify):

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRedis } from './_helpers/mock-redis'

const mockRedis = createMockRedis()
vi.mock('../redis-client', () => ({ redis: mockRedis, getRedisClient: () => mockRedis }))

const emittedEvents: Array<{ label: string; payload: Record<string, unknown> }> = []
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({
    recordEvent: (cat: string, label: string, payload: Record<string, unknown>) => {
      emittedEvents.push({ label, payload })
    },
  }),
}))
```

<!-- Restart-loop test pattern from sibling shipped 2026-05-26 (closest analog) -->
From `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts`:
- `agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()`
- `agentMockFn.mockResolvedValueOnce({...})` per iteration
- `agentMockFn.mock.calls[N-1][0].message` inspects iter N's effective message after combine
- `emittedEvents.filter(e => e.label === 'msg_aborted_path_a_combined' && e.payload.restart_iteration === 1).length === 1`

<!-- mock-redis helper -->
From `_helpers/mock-redis.ts`:
```typescript
export function createMockRedis(): MockRedis & {
  __getAll(): { store: Map<string, string>; ttls: Map<string, number>; lists: Map<string, string[]> }
  __simulateTtlExpiry(key: string): void
}
```

<!-- UnifiedEngine constructor shape (CONFIRMED 2026-05-27 via Read of unified-engine.ts:40): -->
```typescript
constructor(adapters: EngineAdapters, config: EngineConfig)
```
The constructor takes 2 args (adapters + config); the route's default v1 path constructs it and calls processMessage. Under test mocks (R9 scenario), our mock for `'@/lib/agents/engine-adapters/sandbox'` returns `createSandboxAdapters: () => ({})` which gives the engine an empty adapters object. The engine WILL throw when it tries to access `this.adapters.storage` etc. The R9 test ACCEPTS this throw — see Note about negative-assertion pattern under R6-R9 in must_haves.

<!-- Plan 01 V4EngineInput contract -->
Accepts: message, state, history, turnNumber, workspaceId, systemEvent + lockHandle?, lockChannel?, lockIdentifier?, ownPendingEntryJson?, sandboxSessionId?
Returns V4EngineOutput: success, messages, newState, debugTurn, timerSignal?, error?

<!-- Plan 02 route contract -->
POST /api/sandbox/process v4 branch returns either:
- HOLDER: V4EngineOutput shape from engine
- FOLLOWER: { success: true, deferred: true, sandboxSessionId, reason: 'follower_appended_to_pending', pendingListLength }
- 400 on missing sandboxSessionId

<!-- Plan 02 long-poll endpoint contract -->
GET /api/sandbox/lock-result/[sandboxSessionId] returns:
- { ready: true, result: <parsed V4EngineOutput> } HTTP 200 + DELs key
- { ready: false, timeout: true } HTTP 200 after 30s
- { error: 'Authentication required' } HTTP 401 if no user
- { ready: false, error: 'Redis unavailable', ... } HTTP 503 if redis.get throws
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 4.1: Create engine-v4-lock.test.ts with 8 scenarios E1..E8</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts (post Plan 01 state)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts FULL FILE (sibling shipped — closest analog)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/sandbox/types.ts (SandboxState shape)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts (V4AgentOutput shape for canned returns)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/types.ts (V4AgentInput + V4AgentOutput type definitions)
  </read_first>
  <behavior>
    See must_haves for E1..E8 specs. Summary:
    - E1 happy: all CKPTs proceed; lock released; sandbox-result written.
    - E2 CKPT-0 interrupt + combine + restart: iter 2 receives chronologically-combined message.
    - E3 agent-discriminator restart: tokens accumulate across iterations.
    - E4 CKPT-6 interrupt: mid-iteration restart.
    - E5 CKPT-7 first-template Path A: empty messages, NO restart.
    - E6 CKPT-7 mid-template Path B: partial messages, NO restart.
    - E7 LostLockError: V4_ZOMBIE_LAMBDA_EXIT + sandbox-result still written.
    - E8 lockHandle null fail-open: no event emits.
  </behavior>
  <action>
    1. Create directory if missing: `mkdir -p src/lib/agents/somnio-v4/__tests__`.

    2. Create `src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` mirroring the sibling pattern from `restart-loop.test.ts`. Boilerplate (top of file):

       - Import vitest helpers + `createMockRedis` from `@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis`.
       - `vi.mock('@/lib/agents/interruption-system-v2/redis-client', ...)` to inject mockRedis.
       - `vi.mock('@/lib/observability', ...)` to capture `emittedEvents` via collector.
       - `agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()` + `vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', ...)` to inject canned outputs.
       - Helper factories: `makeBaseState()`, `makeBaseInput(overrides)`, `makeAgentOutputSuccess(messages, totalTokens)`.
       - `beforeEach`: clear `emittedEvents`, `agentMockFn.mockReset()`, clear mockRedis store/ttls/lists.

    3. Implement E1 through E8 scenarios. **Key implementation notes:**

       - **E2:** Pre-stage msg2 in pending list + interrupt key via `pushToPending(WORKSPACE_ID, 'whatsapp', 'sandbox-test-abc', { ... })` + `mockRedis.set('interrupt:ws-test-1:whatsapp:sandbox-test-abc', 'm2', { ex: 60 })`. Acquire lock. Call engine.processMessage with lockHandle present. Assert `agentMockFn.mock.calls[0][0].message === 'msg1\\nmsg2'` (chronological order: turnEffectiveMessage FIRST, pending APPENDED — verify against Plan 01 Step C implementation).
       - **E3:** Iter 1 agent returns `{ success: false, errorMessage: 'interrupted_at_ckpt_3_post_tooling', totalTokens: 50, ... }`. Pre-stage msg2 in pending. Iter 2 agent returns success. Assert `result.debugTurn?.tokens?.tokensUsed === 130` (50 + 80) — verifies the `totalTokensAcrossRestarts` accumulator from Plan 01 Step D.
       - **E4:** Use `agentMockFn.mockImplementationOnce(async () => { await pushToPending(...); await mockRedis.set('interrupt:...'); return makeAgentOutputSuccess(...); })` — side-effect during iter 1 agent call stages interrupt for iter 1's CKPT-6 (which runs AFTER the agent call). Iter 2 returns success. Assert one `msg_aborted_path_a_combined` event with `at_step === 'ckpt_6_pre_send_loop'`.
       - **E5/E6:** These need precise control over CKPT-7.N return values. If state-mutation approach (E4-style side-effect) is unreliable for distinguishing CKPT-6 catches vs CKPT-7 catches, add `vi.mock('@/lib/agents/interruption-system-v2/checkpoints', async (orig) => { const actual = await orig() as any; return { ...actual, checkpoint: vi.fn(...) } })` with selective interrupt-by-ckptId logic. Document the approach in 04-SUMMARY.md.
       - **E7:** Acquire lock, then `await mockRedis.del(lockHandle.key)` to simulate TTL-expired-then-stolen. The next checkpoint call will see `proceed: false, lostLock: true` and engine throws LostLockError. Assert `result.error?.code === 'V4_ZOMBIE_LAMBDA_EXIT'` and `emittedEvents.find(e => e.label === 'zombie_lambda_exit')` is defined.
       - **E8:** Pass `lockHandle: undefined` (or omit). Assert `emittedEvents.filter(e => e.label.startsWith('lock_') || e.label.includes('aborted') || e.label.includes('interrupt') || e.label === 'zombie_lambda_exit').length === 0`.

    4. **Pitfall 5 verification in E1 and E7:**

       The engine writes `redis.set('sandbox-result:{sandboxSessionId}', JSON.stringify(result), { ex: 60 })` BEFORE the finally block. In tests, after engine returns, check `mockRedis.__getAll().store.get('sandbox-result:sandbox-test-abc')` — should be defined (or was defined; depending on mock-redis TTL semantics, the value may be in the store map). If mock-redis doesn't surface set() calls in `__getAll()`, alternative: spy on `mockRedis.set` directly via `vi.spyOn(mockRedis, 'set')` and assert it was called with the sandbox-result key. Choose the approach that works with the actual mock-redis implementation.

    5. Run the test file:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts --reporter=verbose
       ```
       All 8 scenarios MUST pass green. If E5/E6 need additional mocking of the checkpoint helper that breaks E2/E3/E4, split into two describe blocks with different mocks OR mark E5/E6 with a precise `vi.mock` setup that only affects those `it()` blocks.

    6. No regression sweep:
       ```bash
       npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -10
       # exits 0; 6 suites green
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts && (grep -c "it('E[1-8]" src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts) && (npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts --reporter=verbose 2>&1 | tail -20) && (npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -5)</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` succeeds.
    - `grep -c "it('E[1-8]" src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` ≥ 8 (all 8 scenarios labeled).
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` exits 0 with at least 8 passing tests reported.
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (no regression in parent's 6 prior suites).
    - `grep -c "lockChannel = 'sandbox'\|channel: 'sandbox'" src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts` == 0 (anti-Pitfall 1; D-02 Option C compliance in test setup — tests must use `'whatsapp'` literal as channel).
  </acceptance_criteria>
  <done>8 vitest scenarios E1..E8 validate Plan 01 engine extension; all green; no regression to parent's interruption-v2 suite.</done>
  <atomic_commit>test(somnio-v4-engine): add E1..E8 lock-lifecycle scenarios (D-04 + D-06 + D-14)</atomic_commit>
</task>

<task type="auto" tdd="true">
  <name>Task 4.2: Create route-v4-lock.test.ts with 10 scenarios R1..R10 (HOLDER/FOLLOWER + Regla 6 anchors with negative-assertion pattern)</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/sandbox/process/route.ts (post Plan 02 state)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/lock.ts (acquireLock signature)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/pending.ts (pushToPending signature)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine/unified-engine.ts (constructor shape — 2 args: adapters + config; informs R9 mock strategy)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Test Strategy (lines 793-820)
    - Check how other Next.js route POST tests structure mocked NextRequest — search for existing `__tests__` directories under `src/app/api/` for any working pattern
  </read_first>
  <behavior>
    See must_haves for R1..R10 specs. Tests instantiate a mocked NextRequest with JSON body, invoke the `POST(req)` handler exported from route.ts, and assert on the NextResponse JSON body + status code.

    **R6/R7/R8/R9 negative-assertion pattern (BLOCKER 2 fix):** Per RESEARCH and post-Plan-04 BLOCKER 2 revision, these scenarios MUST wrap the POST call in `try { ... } catch { /* expected — engine may fail under mock */ }`. The mock for `'@/lib/agents/engine-adapters/sandbox'` returns `createSandboxAdapters: () => ({})` — an empty adapters object. UnifiedEngine.processMessage accesses `this.adapters.storage` and will throw `TypeError` because storage is undefined. The R9 test does NOT care about engine success — it cares about the negative assertion `expect(acquireLockMock).not.toHaveBeenCalled()` + `expect(pushToPendingMock).not.toHaveBeenCalled()` + `expect(emitLockEventMock).not.toHaveBeenCalled()`. These assertions execute REGARDLESS of whether the engine threw, because vitest spies record call-counts in real time. R6/R7/R8 follow the same pattern even though their respective engine mocks (`v2EngineProcessMock`/`v3EngineProcessMock`/`recompraEngineProcessMock`) are pre-resolved to success — wrapping with try/catch is defensive in case the route's import-chain or branch path throws something else under mocks.
  </behavior>
  <action>
    1. Create directory: `mkdir -p src/app/api/sandbox/process/__tests__`.

    2. Create `src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts`. Mocks setup (top of file):

       ```typescript
       import { describe, it, expect, vi, beforeEach } from 'vitest'
       import { NextRequest } from 'next/server'

       // Mock all interruption-v2 module exports
       const acquireLockMock = vi.fn()
       const pushToPendingMock = vi.fn()
       const emitLockEventMock = vi.fn()
       const redisSetMock = vi.fn()
       const redisGetMock = vi.fn()
       const redisDelMock = vi.fn()

       vi.mock('@/lib/agents/interruption-system-v2/lock', () => ({
         acquireLock: acquireLockMock,
         // releaseLockIfOwner / startHeartbeat unused by the route directly; engine handles them.
       }))
       vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({
         pushToPending: pushToPendingMock,
       }))
       vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({
         emitLockEvent: emitLockEventMock,
       }))
       vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
         redis: {
           set: redisSetMock,
           get: redisGetMock,
           del: redisDelMock,
         },
       }))

       // Mock SomnioV4Engine (and other engines for Regla 6 anchor tests)
       const v4EngineProcessMock = vi.fn()
       vi.mock('@/lib/agents/somnio-v4/engine-v4', () => ({
         SomnioV4Engine: vi.fn().mockImplementation(() => ({ processMessage: v4EngineProcessMock })),
       }))

       const v2EngineProcessMock = vi.fn()
       vi.mock('@/lib/agents/somnio-v2/engine-v2', () => ({
         SomnioV2Engine: vi.fn().mockImplementation(() => ({ processMessage: v2EngineProcessMock })),
       }))

       const v3EngineProcessMock = vi.fn()
       vi.mock('@/lib/agents/somnio-v3/engine-v3', () => ({
         SomnioV3Engine: vi.fn().mockImplementation(() => ({ processMessage: v3EngineProcessMock })),
       }))

       const recompraEngineProcessMock = vi.fn()
       vi.mock('@/lib/agents/somnio-recompra/engine-recompra', () => ({
         SomnioRecompraEngine: vi.fn().mockImplementation(() => ({ processMessage: recompraEngineProcessMock })),
       }))

       // Mock UnifiedEngine for v1 default path. The real UnifiedEngine constructor is
       // `(adapters, config)` (per src/lib/agents/engine/unified-engine.ts:40); under our
       // mock we replace the class entirely with one whose processMessage is a vitest
       // mock function. We do NOT need to honor the constructor signature.
       const unifiedEngineProcessMock = vi.fn()
       vi.mock('@/lib/agents/engine/unified-engine', () => ({
         UnifiedEngine: vi.fn().mockImplementation(() => ({ processMessage: unifiedEngineProcessMock })),
       }))

       // Mock createSandboxAdapters (v1 default path uses this). Returning {} means the real
       // UnifiedEngine would throw on `this.adapters.storage.getSession`, BUT we replace
       // UnifiedEngine itself above, so the empty adapters object is benign for the v1 path.
       // The R9 test STILL wraps the POST call in try/catch as defensive insurance against
       // any other unexpected throws from the v1 import/branch chain under mocks (BLOCKER 2).
       vi.mock('@/lib/agents/engine-adapters/sandbox', () => ({
         createSandboxAdapters: vi.fn(() => ({})),
       }))

       // Mock observability collector + runWithCollector pass-through
       const recordEventMock = vi.fn()
       const runWithCollectorMock = vi.fn((collector: any, fn: () => any) => fn())
       vi.mock('@/lib/observability', () => ({
         runWithCollector: runWithCollectorMock,
         ObservabilityCollector: vi.fn().mockImplementation(() => ({ recordEvent: recordEventMock })),
       }))

       // Mock Supabase auth (user always authenticated in tests)
       vi.mock('@/lib/supabase/server', () => ({
         createClient: vi.fn(async () => ({
           auth: {
             getUser: async () => ({ data: { user: { id: 'test-user-id' } } }),
           },
           from: vi.fn(() => ({
             select: vi.fn().mockReturnThis(),
             eq: vi.fn().mockReturnThis(),
             single: vi.fn().mockResolvedValue({ data: { role: 'admin' } }),
           })),
         })),
       }))

       // Mock initializeTools + side-effect imports (no-op)
       vi.mock('@/lib/tools/init', () => ({ initializeTools: vi.fn() }))
       vi.mock('@/lib/agents/somnio', () => ({}))
       vi.mock('@/lib/agents/crm', () => ({}))

       // Helper to build mocked NextRequest
       function makeReq(body: Record<string, unknown>): NextRequest {
         return new NextRequest('http://localhost:3020/api/sandbox/process', {
           method: 'POST',
           headers: { 'content-type': 'application/json' },
           body: JSON.stringify(body),
         })
       }

       // Import the POST handler AFTER all mocks
       import { POST } from '@/app/api/sandbox/process/route'

       beforeEach(() => {
         vi.clearAllMocks()
         // Default behavior: lockHandle null (FOLLOWER) unless overridden in test
         acquireLockMock.mockResolvedValue(null)
         pushToPendingMock.mockResolvedValue({ exactJson: '{}', pendingListLength: 1 })
         v4EngineProcessMock.mockResolvedValue({ success: true, messages: ['v4 reply'], newState: {}, debugTurn: {} })
         v2EngineProcessMock.mockResolvedValue({ success: true, messages: ['v2 reply'] })
         v3EngineProcessMock.mockResolvedValue({ success: true, messages: ['v3 reply'] })
         recompraEngineProcessMock.mockResolvedValue({ success: true, messages: ['recompra reply'] })
         unifiedEngineProcessMock.mockResolvedValue({ success: true, messages: ['v1 reply'], newState: {}, debugTurn: {} })
         runWithCollectorMock.mockImplementation((_c, fn) => fn())
       })
       ```

    3. Implement R1..R10 scenarios:

       **R1 HOLDER:** Override `acquireLockMock.mockResolvedValueOnce({ key: 'lock:ws:whatsapp:sandbox-abc', holderUuid: 'h1', startedAt: '2026-05-27T00:00:00Z' })`. POST body with agentId='somnio-sales-v4' + sandboxSessionId='abc' + state, message, etc. Assert response status 200, JSON body NOT equal to deferred shape, `v4EngineProcessMock` called once with `lockHandle.holderUuid === 'h1'` and `lockChannel === 'whatsapp'` and `lockIdentifier === 'sandbox-abc'`.

       **R2 FOLLOWER:** `acquireLockMock.mockResolvedValueOnce(null)`. Assert response JSON exactly:
       ```typescript
       expect(json).toEqual({
         success: true,
         deferred: true,
         sandboxSessionId: 'abc',
         reason: 'follower_appended_to_pending',
         pendingListLength: 1,
       })
       expect(v4EngineProcessMock).not.toHaveBeenCalled()
       expect(pushToPendingMock).toHaveBeenCalled()
       expect(redisSetMock).toHaveBeenCalledWith(
         expect.stringMatching(/^interrupt:.*:whatsapp:sandbox-abc$/),
         expect.any(String),
         expect.objectContaining({ ex: 60 }),
       )
       ```

       **R3 D-02 Option C lock-key shape:** In any test that calls acquireLock (R1 or R2), assert `acquireLockMock.mock.calls[0]` has args `[expect.any(String) /* wsId */, 'whatsapp', expect.stringMatching(/^sandbox-/)]`. Specifically verify the second arg is the LITERAL 'whatsapp', NOT 'sandbox'.

       **R4 fail-open:** `acquireLockMock.mockRejectedValueOnce(new Error('Redis down'))`. POST v4 body. Assert: `emitLockEventMock` was called with first arg 'redis_unavailable_fallback_failed'. Assert `v4EngineProcessMock` was called with `lockHandle: null`. Assert HTTP status 200 (not 500).

       **R5 sandboxSessionId missing:** POST v4 body WITHOUT sandboxSessionId field. Assert status 400 and JSON `{ error: 'sandboxSessionId required for v4 sandbox' }`.

       **R6 Regla 6 anchor v3 (BLOCKER 2 negative-assertion pattern):** POST body with `agentId: 'somnio-sales-v3'` (NO sandboxSessionId — v3 doesn't need it). Wrap in try/catch:
       ```typescript
       // We accept non-v3 engine instantiation failures under test mocks — the assertion
       // is that NO interruption-system-v2 primitive was invoked, which proves Regla 6
       // byte-identity at the API entrypoint when agentId !== 'somnio-sales-v4'.
       try { await POST(makeReq({ agentId: 'somnio-sales-v3', message: 'hi', state: {}, history: [], turnNumber: 1 })) } catch { /* expected — engine may fail under mock */ }
       expect(acquireLockMock).not.toHaveBeenCalled()
       expect(pushToPendingMock).not.toHaveBeenCalled()
       expect(emitLockEventMock).not.toHaveBeenCalled()
       // Optional positive: if the v3 import chain succeeds under mocks, v3EngineProcessMock
       // should have been called once. If not (engine threw earlier), skip this assertion.
       // Load-bearing claim is the negative assertions above.
       ```

       **R7 Regla 6 anchor v2 (same negative-assertion pattern):** Same try/catch wrapping with `agentId: 'somnio-sales-v2'` → assert the three lock spies have ZERO calls.

       **R8 Regla 6 anchor recompra (same negative-assertion pattern):** `agentId: 'somnio-recompra-v1'` → assert the three lock spies have ZERO calls.

       **R9 Regla 6 anchor v1 default (BLOCKER 2 critical case):** POST body without `agentId` (undefined). The default v1 path constructs UnifiedEngine. Even though we replace UnifiedEngine via vi.mock and force the constructor to ignore its args, defense-in-depth wraps the call:
       ```typescript
       // BLOCKER 2 reframing: the test's load-bearing claim is the negative assertion
       // that NO interruption-system-v2 primitive was invoked when agentId is not v4.
       // We accept that the non-v4 engine (UnifiedEngine + createSandboxAdapters mocks)
       // may throw under our minimal mock chain — that DOES NOT INVALIDATE the negative
       // assertion, which is the Regla 6 byte-identity claim at the route's API entrypoint.
       try { await POST(makeReq({ message: 'hi', state: {}, history: [], turnNumber: 1 })) } catch { /* expected — engine may fail under mock */ }
       expect(acquireLockMock).not.toHaveBeenCalled()
       expect(pushToPendingMock).not.toHaveBeenCalled()
       expect(emitLockEventMock).not.toHaveBeenCalled()
       ```

       **R10 collector wrap (Pitfall 3):** R1 HOLDER setup. Assert `runWithCollectorMock` was called with a function as its second arg, and that calling the spy returns the engine result (verifies pass-through behavior). Assert `ObservabilityCollector` constructor was called with shape including `conversationId: 'abc'`, `agentId: 'somnio-sales-v4'`, `triggerKind: 'sandbox'`.

    4. Run tests:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx vitest run src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts --reporter=verbose
       ```
       All 10 MUST pass.

    5. Final sweep:
       ```bash
       npx vitest run src/lib/agents/interruption-system-v2/__tests__/ src/lib/agents/somnio-v4/__tests__/ src/app/api/sandbox/process/__tests__/ 2>&1 | tail -15
       ```
       All test files exit 0.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts && (grep -cE "it\\('R[0-9]+" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts) && (npx vitest run src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts --reporter=verbose 2>&1 | tail -25) && (grep -c "'whatsapp'" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts) && (grep -c "channel: 'sandbox'\|'sandbox' as.*channel" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts) && (grep -cE "try \\{ await POST|catch \\{ /\\* expected" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts)</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` succeeds.
    - `grep -cE "it\('R[0-9]+" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` ≥ 10 (all 10 R-prefixed scenarios labeled).
    - `npx vitest run src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` exits 0 with at least 10 passing tests reported.
    - `grep -c "'whatsapp'" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` ≥ 1 (D-02 Option C — tests assert 'whatsapp' channel literal).
    - `grep -c "channel: 'sandbox'" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` == 0 (D-02 Option C compliance — never reference 'sandbox' channel).
    - **BLOCKER 2 try/catch wrapping present:** `grep -cE "try \{ await POST|catch \{ /\* expected" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` ≥ 4 (R6/R7/R8/R9 all wrap their POST call in try/catch; defensive pattern documented in comments).
    - R6/R7/R8/R9 anchor scenarios PASS (verified by `acquireLockMock).not.toHaveBeenCalled()` assertion in each — if any fires acquireLock, Regla 6 has broken in route.ts).
    - `grep -c "triggerKind: 'sandbox'" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` ≥ 1 (R10 asserts ObservabilityCollector got triggerKind='sandbox' per Task 2.0 union extension).
  </acceptance_criteria>
  <done>10 vitest scenarios R1..R10 validate Plan 02 route HOLDER/FOLLOWER branch + Regla 6 anchors (negative-assertion pattern that tolerates non-v4 engine throws under mocks); all green.</done>
  <atomic_commit>test(sandbox-route): add R1..R10 HOLDER/FOLLOWER + Regla 6 anchor scenarios (D-06 + D-07 + D-14 + D-15)</atomic_commit>
</task>

<task type="auto" tdd="true">
  <name>Task 4.3: Create lock-result/[id]/__tests__/route.test.ts with L1 happy + L2 timeout scenarios (WARNING 2 fix)</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/sandbox/lock-result/[sandboxSessionId]/route.ts (post Plan 02 state — the long-poll endpoint)
    - vitest docs on `vi.useFakeTimers()` + `vi.advanceTimersByTime(...)` for the L2 30s timeout case
  </read_first>
  <behavior>
    - **L1:** Returns `{ ready: true, result: ... }` when Redis key set before timeout, and DELs the key.
    - **L2:** Returns `{ ready: false, timeout: true }` after 30s with key absent. Uses `vi.useFakeTimers()` to avoid real 30s wait.
  </behavior>
  <action>
    1. Create directory: `mkdir -p "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__"`.

    2. Create `src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts`:

       ```typescript
       import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
       import { NextRequest } from 'next/server'

       const redisGetMock = vi.fn()
       const redisDelMock = vi.fn()
       vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
         redis: { get: redisGetMock, del: redisDelMock },
       }))

       // Authed user always
       vi.mock('@/lib/supabase/server', () => ({
         createClient: vi.fn(async () => ({
           auth: { getUser: async () => ({ data: { user: { id: 'test-user-id' } } }) },
         })),
       }))

       // Import GET handler AFTER all mocks
       import { GET } from '@/app/api/sandbox/lock-result/[sandboxSessionId]/route'

       function makeReq(): NextRequest {
         return new NextRequest('http://localhost:3020/api/sandbox/lock-result/abc')
       }
       function makeCtx(id = 'abc'): { params: Promise<{ sandboxSessionId: string }> } {
         return { params: Promise.resolve({ sandboxSessionId: id }) }
       }

       beforeEach(() => {
         vi.clearAllMocks()
       })

       afterEach(() => {
         vi.useRealTimers()
       })

       describe('GET /api/sandbox/lock-result/[sandboxSessionId]', () => {
         it('L1: returns ready=true + DELs key when result available', async () => {
           const fakeResult = { success: true, messages: ['combined reply'], newState: {}, debugTurn: {} }
           // First poll: key absent. Second poll: key set. Test that endpoint polls again
           // and returns the result. We use real timers here because the inter-poll
           // setTimeout is 300ms (negligible for one extra poll iteration).
           redisGetMock
             .mockResolvedValueOnce(null)               // poll 1: not yet
             .mockResolvedValueOnce(JSON.stringify(fakeResult))  // poll 2: ready
           redisDelMock.mockResolvedValueOnce(1)

           const resp = await GET(makeReq(), makeCtx('abc'))
           const json = await resp.json()
           expect(json).toEqual({ ready: true, result: fakeResult })
           expect(redisDelMock).toHaveBeenCalledWith('sandbox-result:abc')
         })

         it('L2: returns timeout=true after 30s with no key (fake timers)', async () => {
           // Always returns null — never ready. Use fake timers to fast-forward through
           // the 30s POLL_TIMEOUT_MS loop without real wait.
           redisGetMock.mockResolvedValue(null)
           vi.useFakeTimers()

           const respPromise = GET(makeReq(), makeCtx('abc'))

           // Drive the event loop: each poll iteration awaits redis.get (resolves immediately
           // under mock) then `setTimeout(300)`. We advance 31s total to exceed POLL_TIMEOUT_MS.
           // Run microtasks between time-advances to let the awaited mocks resolve.
           for (let elapsed = 0; elapsed < 31000; elapsed += 300) {
             await vi.advanceTimersByTimeAsync(300)
           }

           const resp = await respPromise
           const json = await resp.json()
           expect(json).toEqual({ ready: false, timeout: true })
           expect(redisDelMock).not.toHaveBeenCalled()
         })
       })
       ```

       NOTE: vitest's `vi.advanceTimersByTimeAsync` is the right helper for promise-aware advance (vs `vi.advanceTimersByTime` which is sync-only). If the loop doesn't terminate cleanly, fall back to mocking `setTimeout` directly via `vi.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0 as any })` and let elapsed time be the wall clock from a `vi.spyOn(Date, 'now')` increment.

    3. Run:
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx vitest run "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts" --reporter=verbose
       ```
       Both L1 + L2 MUST pass. If L2 hangs in real time, switch to the setTimeout-spy fallback documented in step 2 NOTE.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts" && (grep -cE "it\\('L[12]" "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts") && (grep -c "useFakeTimers\\|advanceTimersByTimeAsync\\|spyOn.*setTimeout" "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts") && (npx vitest run "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts" --reporter=verbose 2>&1 | tail -15)</automated>
  </verify>
  <acceptance_criteria>
    - `test -f "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts"` succeeds.
    - `grep -cE "it\('L[12]" src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` ≥ 2 (L1 + L2 both labeled).
    - `grep -c "useFakeTimers\|advanceTimersByTimeAsync\|spyOn.*setTimeout" src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts` ≥ 1 (fake-timer mechanism present — no real 30s wait in CI).
    - `npx vitest run "src/app/api/sandbox/lock-result/[sandboxSessionId]/__tests__/route.test.ts"` exits 0 with 2 passing tests.
    - Test wall-clock duration < 5s (L2 should NOT take a real 30s — fake timers).
  </acceptance_criteria>
  <done>L1 + L2 scenarios validate Plan 02 long-poll endpoint; both green; total test duration <5s wall-clock.</done>
  <atomic_commit>test(sandbox-route): add L1/L2 long-poll endpoint scenarios (D-07 + D-14 + WARNING 2)</atomic_commit>
</task>

</tasks>

<verification>
1. All 3 new test files exist + 8 + 10 + 2 = 20 scenarios pass.
2. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` (parent's 6 suites) exits 0 — no regression.
3. `npx tsc --noEmit -p tsconfig.json` clean for all three test files.
4. D-15 module untouched gate: `git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l` returns 0.
5. Regla 6 anti-leak in tests: `grep -c "channel: 'sandbox'" src/lib/agents/somnio-v4/__tests__/engine-v4-lock.test.ts src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` returns 0 (test files do NOT reference 'sandbox' channel literal — anti-Pitfall 1 anchor).
6. **BLOCKER 2 negative-assertion pattern present:** `grep -cE "try \{ await POST|catch \{ /\* expected" src/app/api/sandbox/process/__tests__/route-v4-lock.test.ts` ≥ 4 (R6/R7/R8/R9 all wrap POST in try/catch).
</verification>

<success_criteria>
- 3 new test files (engine-v4-lock.test.ts + route-v4-lock.test.ts + lock-result/[id]/__tests__/route.test.ts) with 20 total scenarios.
- All 20 scenarios pass green.
- Parent interruption-v2 suite (6 files) continues green — no regression.
- D-02 + D-04 + D-06 + D-07 + D-14 + D-15 all verifiable via the new tests.
- R6/R7/R8/R9 Regla 6 anchors stand as CI-enforceable contracts using BLOCKER-2 negative-assertion pattern: future edits that accidentally pull lock logic out of the v4 branch will break these tests, AND the tests are robust to non-v4 engine mock failures (don't conflate engine-success with Regla-6 enforcement).
- L1/L2 cover the long-poll endpoint per WARNING 2.
</success_criteria>

<push_to_vercel>
After all 3 atomic commits land, push (Regla 1):
```bash
git push origin HEAD:main
```
Tests-only plan. Zero production code touched. Safe to push immediately.
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-sandbox-integration/04-SUMMARY.md` documenting:
- Final pass count from each of the 3 test commands (expected: 8 + 10 + 2 = 20 tests).
- Whether E5/E6 required `vi.mock('@/lib/agents/interruption-system-v2/checkpoints', ...)` to control return-by-ckptId (and how the per-it mock-scoping was achieved if E2/E3/E4 needed the real checkpoint).
- Whether sandbox-result write verification used `mockRedis.__getAll().store` or `vi.spyOn(mockRedis, 'set')` (depends on mock-redis implementation surface).
- Any TypeScript narrowing issues with the V4AgentOutput cast in `makeAgentOutputSuccess`.
- Whether L2 used `vi.advanceTimersByTimeAsync` (preferred) or the `setTimeout-spy` fallback (document which).
- Confirmation that R6/R7/R8/R9 acquireLock spies report ZERO invocations (the BLOCKER-2 negative-assertion test pattern is the load-bearing claim — engine throws under mocks are accepted).
- Cross-reference to Plan 05 (manual smoke S1/S2/S3 + LEARNINGS.md + SUMMARY.md).
</output>
</content>
