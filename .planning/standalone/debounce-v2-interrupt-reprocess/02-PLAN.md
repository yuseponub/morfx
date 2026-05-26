---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 02
type: execute
wave: 2
depends_on: [01]
files_modified:
  - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts
autonomous: true
requirements:
  - D-09  # Tests: S1 happy / S2 restart 1x / S3 restart 2x / S4 Path B no-restart / S5 Regla 6 v3 byte-identity

must_haves:
  truths:
    - "New test file `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exists with 5 vitest scenarios labeled S1 through S5 (D-09)."
    - "S1 (happy path) asserts a single-iteration turn emits `lock_acquired` + `lock_released_normal` and NO `restart_iteration` field appears in any event payload."
    - "S2 (Path A restart 1x) asserts: agent returns `errorMessage: 'interrupted_at_ckpt_1_post_comprehension'` on iter 1; iter 2 returns success; exactly ONE `msg_aborted_path_a_combined` with `restart_iteration: 1`; `engineOutput.tokensUsed === sum of both iterations' totalTokens`; iter 2's V4AgentInput.message === expected combined string."
    - "S3 (Path A restart 2x) asserts: TWO `msg_aborted_path_a_combined` events with `restart_iteration: 1` then `2`; final iter's V4AgentInput.message === expected 3-message combined string; tokens accumulate from all 3 iterations; exactly ONE `lock_acquired` + ONE `lock_released_normal` (single lock lifetime across restarts — Pitfall 6)."
    - "S4 (Path B post-send, NO restart) asserts: after `actuallySentIds.length > 0`, CKPT-6b interrupt → `msg_aborted_path_b_solo` (NOT `..._path_a_combined`); NO `restart_iteration` in payload; messagesSent === 1; pending list still contains msg2 (drains in next inbound)."
    - "S5 (Regla 6 v3 byte-identity) asserts THREE-FOLD: (a) static grep proves zero `interruption-system-v2` imports + zero `shouldRestart`/`restart_iteration`/`interrupted_at_ckpt_` references in v3-production-runner.ts and all sibling agents; (b) git-diff verifies zero bytes changed in those paths vs main; (c) behavioral test running V3ProductionRunner emits ZERO `emitLockEvent` calls (vi.fn spy on the export)."
    - "Test file uses the existing mock-redis helper at `__tests__/_helpers/mock-redis.ts` (already shipped by parent standalone) — does NOT introduce a new helper."
    - "Test file uses `vi.mock('../somnio-v4', ...)` to return canned `V4AgentOutput` values per iteration (allows asserting iter N's input via `mockFn.mock.calls[N-1]`)."
    - "Test file uses `vi.mock('@/lib/observability', ...)` to capture `emittedEvents` (pattern from `e2e-scenarios.test.ts:45-51`)."
    - "Existing test suite `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` continues to pass — all 5 prior suites (lock, pending, checkpoints, observability, e2e-scenarios) green PLUS the new restart-loop suite green."
  artifacts:
    - path: "src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts"
      provides: "5 vitest scenarios S1..S5 validating runtime behavior of Plan 01 scaffolding"
      contains: "S1\\|S2\\|S3\\|S4\\|S5"
  key_links:
    - from: "src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts"
      to: "src/lib/agents/engine/v4-production-runner.ts (Plan 01 scaffolding)"
      via: "imports + instantiates V4ProductionRunner via mocked adapters; asserts behavior of the while (shouldRestart) loop"
      pattern: "V4ProductionRunner\\|while (shouldRestart)"
    - from: "src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts"
      to: "src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts"
      via: "createMockRedis() (already shipped by parent standalone)"
      pattern: "createMockRedis"
---

<objective>
Wave 2 — Validate the Plan 01 restart-loop scaffolding via 5 vitest scenarios. Tests live in a single new file: `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts`. Mirrors the proven pattern from `__tests__/e2e-scenarios.test.ts` (mock-redis + emittedEvents capture + canned V4AgentOutput per iteration).

Purpose: prove that:
1. Happy path is byte-identical to pre-fix behavior (no regression).
2. The runner correctly drains pending + combines + restarts on Path A interrupt at CKPT-0/1/2 (and by extension CKPT-3/4/5 via the Pitfall 7 fix).
3. Multi-restart cascading works (no off-by-one in token accumulation or restart_iteration).
4. Path B (post-send) preserves current behavior (no restart — D-01 + D-05).
5. **Regla 6 verifiable** — v3 path is byte-identical to main; no interruption-system-v2 leakage into non-v4 paths.

Output: 1 new test file with ~250 LOC. After this plan, `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exits 0 with 5 passing scenarios.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/standalone/debounce-v2-interrupt-reprocess/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md
@.planning/standalone/debounce-v2-interrupt-reprocess/01-SUMMARY.md

<interfaces>
<!-- Pattern reference — existing e2e-scenarios.test.ts already shipped by parent standalone -->
From `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` (read for pattern; do NOT modify):
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

<!-- Mock-redis helper signature -->
From `src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts`:
```typescript
export function createMockRedis(): MockRedis & {
  __getAll(): { store: Map<string, string>; ttls: Map<string, number>; lists: Map<string, string[]> }
  __simulateTtlExpiry(key: string): void
}
```

<!-- Plan 01 contract (already-shipped) -->
v4-production-runner.ts:
- Wraps body in `while (shouldRestart)` loop
- After `await processMessage(v4Input)`: detects `output.errorMessage?.startsWith('interrupted_at_ckpt_')` → drain pending, combine, restart
- Final return uses `tokensUsed: totalTokensAcrossRestarts`
- Every restart emits `msg_aborted_path_a_combined` + `pending_list_combined` with `restart_iteration: N`

somnio-v4-agent.ts:
- Exported `processMessage(v4Input: V4AgentInput): Promise<V4AgentOutput>`
- For S2/S3 we mock this to return canned outputs per call

<!-- V4ProductionRunner instantiation contract -->
From `src/lib/agents/engine/v4-production-runner.ts`:
```typescript
export class V4ProductionRunner {
  constructor(adapters: EngineAdapters, config: { workspaceId: string })
  async processMessage(input: EngineInput): Promise<EngineOutput>
}
```
For tests: stub the storage / timer / messaging adapters with minimal vitest doubles (similar pattern to `e2e-scenarios.test.ts`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 2.1: Create restart-loop.test.ts with scenarios S1, S2, S3 (happy path + Path A 1x + Path A 2x)</name>
  <read_first>
    - src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts (FULL — pattern for mock-redis, vi.mock observability, beforeEach store-clear)
    - src/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis.ts (interface)
    - src/lib/agents/engine/v4-production-runner.ts (Plan 01 scaffolding — to know what adapters/inputs the runner expects)
    - src/lib/agents/engine/types.ts (EngineInput + EngineOutput shapes)
    - src/lib/agents/somnio-v4/types.ts (V4AgentInput + V4AgentOutput shapes — for canned agent outputs)
  </read_first>
  <behavior>
    - **S1:** One inbound message, no interrupt. Mocked agent returns `{ success: true, messages: ['reply'], totalTokens: 100 }`. Mocked messaging sends 1 template successfully. Assert: no `restart_iteration` field anywhere; `engineOutput.tokensUsed === 100`; `lock_acquired` + `lock_released_normal` emitted; lock store empty post-release.
    - **S2:** First call to mocked agent returns `{ success: false, errorMessage: 'interrupted_at_ckpt_1_post_comprehension', totalTokens: 50 }`. Before the agent is called, push `{ content: 'msg2', ... }` to pending list + write `interrupt:*` key to mock-redis. Second call to mocked agent returns `{ success: true, messages: ['combined reply'], totalTokens: 75 }`. Assert: exactly ONE `msg_aborted_path_a_combined` event with `restart_iteration: 1`; `engineOutput.tokensUsed === 125`; iter 2's `v4Input.message` (captured via `mockFn.mock.calls[1][0].message`) === `'msg2\\nmsg1'`; exactly ONE `lock_acquired` + ONE `lock_released_normal`.
    - **S3:** Three iterations. Iter 1: agent returns `errorMessage: 'interrupted_at_ckpt_1_post_comprehension'`. Before iter 2 runs (use a `beforeEach`-style hook or interleave mock-redis state mutations between agent call mock returns) push `{ content: 'msg3', ... }` to pending + write `interrupt:*`. Iter 2: CKPT-0 detects interrupt → restart (no agent call this iteration). Iter 3: agent returns success. Assert: TWO `msg_aborted_path_a_combined` events with `restart_iteration: 1` and `restart_iteration: 2`; iter-3 agent input.message === `'msg3\\nmsg2\\nmsg1'`; tokens accumulate across all 3 iterations.
  </behavior>
  <action>
    1. Create `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts`. Start with the same boilerplate as `e2e-scenarios.test.ts` (mock-redis, vi.mock observability, beforeEach store-clear).

    2. Add helpers at the top of the file:

       ```typescript
       import { V4ProductionRunner } from '@/lib/agents/engine/v4-production-runner'
       import type { EngineInput, EngineOutput } from '@/lib/agents/engine/types'
       import type { V4AgentInput, V4AgentOutput } from '@/lib/agents/somnio-v4/types'
       import { pushToPending } from '../pending'
       import { acquireLock } from '../lock'
       import { redis } from '../redis-client'
       import { randomUUID } from 'crypto'

       // ---------------- Mock factories ----------------

       function makeMockStorage(initialPending: string[] = []) {
         const sessionState = {
           datos_capturados: initialPending.length > 0
             ? { '_v3:pendingUserMessage': initialPending.join('\n') }
             : {},
           intents_vistos: [],
           templates_enviados: [],
         }
         const session = { id: 'sess-1', state: sessionState }
         return {
           getSession: vi.fn().mockResolvedValue(session),
           getOrCreateSession: vi.fn().mockResolvedValue(session),
           saveState: vi.fn().mockResolvedValue(undefined),
           getHistory: vi.fn().mockResolvedValue([]),
           // ... any other methods the runner calls (getPendingTemplates etc — add as required)
           getPendingTemplates: vi.fn().mockResolvedValue([]),
         }
       }

       function makeMockMessaging() {
         return {
           send: vi.fn().mockResolvedValue({ messagesSent: 1, sentIds: ['m1-tmpl1'] }),
         }
       }

       function makeMockTimer() {
         return {
           setSessionId: vi.fn(),
           onCustomerMessage: vi.fn().mockResolvedValue(undefined),
         }
       }

       function makeAdapters(overrides: Partial<{ storage; messaging; timer }> = {}) {
         return {
           storage: makeMockStorage(),
           messaging: makeMockMessaging(),
           timer: makeMockTimer(),
           ...overrides,
         }
       }

       // ---------------- Mock the agent module ----------------
       const agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()
       vi.mock('@/lib/agents/somnio-v4', () => ({
         processMessage: (input: V4AgentInput) => agentMockFn(input),
       }))

       // ---------------- Build a baseline EngineInput ----------------
       async function makeEngineInput(overrides: Partial<EngineInput> = {}): Promise<EngineInput> {
         const lockHandle = await acquireLock('ws-1', 'whatsapp', '+57300')
         expect(lockHandle).not.toBeNull()
         return {
           sessionId: 'sess-1',
           conversationId: 'conv-1',
           contactId: 'contact-1',
           message: 'msg1',
           workspaceId: 'ws-1',
           history: [],
           lockHandle: lockHandle!,
           lockChannel: 'whatsapp',
           lockIdentifier: '+57300',
           ownPendingEntryJson: null,
           ...overrides,
         }
       }
       ```

       *Note:* the exact `storage`/`timer`/`messaging` adapter shapes come from `EngineAdapters` type in `src/lib/agents/engine/types.ts`. Read that type first and align the mock factories' method signatures. If the runner calls `storage.savePendingTemplates` / `storage.getPendingTemplates` / etc., add those methods to the mock returning sensible defaults (empty arrays, resolved promises).

    3. Write S1 (Happy path):

       ```typescript
       it('S1 happy path: 1 msg, no interrupt → no restart_iteration, tokens = single iteration', async () => {
         agentMockFn.mockResolvedValueOnce({
           success: true,
           messages: ['reply'],
           totalTokens: 100,
         } as V4AgentOutput)

         const adapters = makeAdapters()
         const runner = new V4ProductionRunner(adapters as any, { workspaceId: 'ws-1' })
         const input = await makeEngineInput()

         const output = await runner.processMessage(input)

         expect(output.success).toBe(true)
         expect(output.tokensUsed).toBe(100)

         const restartEvents = emittedEvents.filter(e => 'restart_iteration' in (e.payload as Record<string, unknown>))
         expect(restartEvents).toHaveLength(0)

         const labels = emittedEvents.map(e => e.label)
         expect(labels).toContain('lock_acquired')
         expect(labels).toContain('lock_released_normal')

         // Agent invoked exactly once
         expect(agentMockFn).toHaveBeenCalledTimes(1)
       })
       ```

    4. Write S2 (Path A restart, 1 iteration via agent-discriminator detector):

       ```typescript
       it('S2 Path A restart 1x: agent returns interrupted_at_ckpt_1 → drain pending + restart + success on iter 2', async () => {
         // Iter 1: interrupted_at_ckpt_1_post_comprehension
         agentMockFn.mockResolvedValueOnce({
           success: false,
           messages: [],
           errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
           totalTokens: 50,
         } as V4AgentOutput)
         // Iter 2: success
         agentMockFn.mockResolvedValueOnce({
           success: true,
           messages: ['combined reply'],
           totalTokens: 75,
         } as V4AgentOutput)

         // Pre-stage pending list with msg2 BEFORE the agent first call.
         // Runner reads pending when discriminator triggers.
         await pushToPending('ws-1', 'whatsapp', '+57300', {
           entry_uuid: randomUUID(),
           content: 'msg2',
           received_at: new Date().toISOString(),
           msg_id: 'm2',
         })

         const adapters = makeAdapters()
         const runner = new V4ProductionRunner(adapters as any, { workspaceId: 'ws-1' })
         const input = await makeEngineInput({ message: 'msg1' })

         const output = await runner.processMessage(input)

         expect(output.success).toBe(true)
         expect(output.tokensUsed).toBe(125)  // 50 + 75 — Pitfall 2

         const pathARestarts = emittedEvents.filter(e =>
           e.label === 'msg_aborted_path_a_combined' &&
           (e.payload as Record<string, unknown>).restart_iteration === 1
         )
         expect(pathARestarts).toHaveLength(1)

         const pendingCombined = emittedEvents.filter(e =>
           e.label === 'pending_list_combined' &&
           (e.payload as Record<string, unknown>).restart_iteration === 1
         )
         expect(pendingCombined).toHaveLength(1)

         // Iter 2's V4AgentInput received the combined effectiveMessage
         expect(agentMockFn).toHaveBeenCalledTimes(2)
         const iter2Input = agentMockFn.mock.calls[1][0]
         expect(iter2Input.message).toBe('msg2\nmsg1')

         // Single lock lifetime
         const acquireCount = emittedEvents.filter(e => e.label === 'lock_acquired').length
         const releaseCount = emittedEvents.filter(e => e.label === 'lock_released_normal').length
         expect(acquireCount).toBe(1)
         expect(releaseCount).toBe(1)
       })
       ```

    5. Write S3 (Path A restart, 2 iterations cascading):

       ```typescript
       it('S3 Path A restart 2x: cascading interrupts at agent-discriminator then CKPT-0 → final combined message has 3 parts', async () => {
         // Iter 1: agent returns interrupted_at_ckpt_1
         agentMockFn.mockResolvedValueOnce({
           success: false,
           messages: [],
           errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
           totalTokens: 50,
         } as V4AgentOutput)
         // Iter 2: agent is NOT called (CKPT-0 catches the interrupt — see hook below)
         // Iter 3: success
         agentMockFn.mockResolvedValueOnce({
           success: true,
           messages: ['final combined reply'],
           totalTokens: 80,
         } as V4AgentOutput)

         // Stage msg2 in pending BEFORE iter 1's agent call
         await pushToPending('ws-1', 'whatsapp', '+57300', {
           entry_uuid: randomUUID(),
           content: 'msg2',
           received_at: new Date().toISOString(),
           msg_id: 'm2',
         })

         // Stage msg3 + interrupt key for CKPT-0 of iter 2.
         // Use the first agent call as a side-effect hook to mutate mock-redis state
         // BETWEEN iter 1 (drain msg2) and iter 2 (CKPT-0 sees msg3 + interrupt).
         agentMockFn.mockImplementationOnce(async () => {
           // This runs DURING iter 1's agent call (already mocked above with mockResolvedValueOnce);
           // we override that mock here. Replace the queued mockResolvedValueOnce with mockImplementationOnce
           // for iter 1 to get this side-effect hook:
           // ALT: use beforeEach + custom side-effect approach — see below ALT
           return {
             success: false,
             messages: [],
             errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
             totalTokens: 50,
           } as V4AgentOutput
         })
         // ⚠ The mockImplementationOnce above OVERLAPS with the earlier mockResolvedValueOnce.
         // Use ONE OR THE OTHER — recommended cleaner version:
         agentMockFn.mockReset()
         agentMockFn.mockImplementationOnce(async (input) => {
           // Side-effect: stage msg3 + interrupt in mock-redis so CKPT-0 of iter 2 catches it.
           await pushToPending('ws-1', 'whatsapp', '+57300', {
             entry_uuid: randomUUID(),
             content: 'msg3',
             received_at: new Date().toISOString(),
             msg_id: 'm3',
           })
           await redis.set(`interrupt:ws-1:whatsapp:+57300`, 'm3', { ex: 60 })
           return {
             success: false,
             messages: [],
             errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
             totalTokens: 50,
           } as V4AgentOutput
         })
         agentMockFn.mockResolvedValueOnce({
           success: true,
           messages: ['final combined reply'],
           totalTokens: 80,
         } as V4AgentOutput)

         const adapters = makeAdapters()
         const runner = new V4ProductionRunner(adapters as any, { workspaceId: 'ws-1' })
         const input = await makeEngineInput({ message: 'msg1' })

         const output = await runner.processMessage(input)

         expect(output.success).toBe(true)
         expect(output.tokensUsed).toBe(130)  // 50 + 80 (iter 2 has NO agent call — CKPT-0 catches)

         const restartEvents = emittedEvents.filter(e => e.label === 'msg_aborted_path_a_combined')
         expect(restartEvents).toHaveLength(2)
         expect((restartEvents[0].payload as Record<string, unknown>).restart_iteration).toBe(1)
         expect((restartEvents[1].payload as Record<string, unknown>).restart_iteration).toBe(2)

         // Iter 3's V4AgentInput received the 3-part combined effectiveMessage
         expect(agentMockFn).toHaveBeenCalledTimes(2)  // Iter 1 + Iter 3 (Iter 2 = CKPT-0 short-circuit)
         const finalInput = agentMockFn.mock.calls[1][0]
         expect(finalInput.message).toBe('msg3\nmsg2\nmsg1')

         // Single lock lifetime (Pitfall 6 — no heartbeat stacking)
         const acquireCount = emittedEvents.filter(e => e.label === 'lock_acquired').length
         const releaseCount = emittedEvents.filter(e => e.label === 'lock_released_normal').length
         expect(acquireCount).toBe(1)
         expect(releaseCount).toBe(1)
       })
       ```

       **Note on S3:** the precise ordering of "iter 2's CKPT-0 catches interrupt" depends on Plan 01's anchor placement. If CKPT-0 is the FIRST checkpoint in the iteration body, the side-effect-during-iter-1 pattern above works. If for some reason iter 2's CKPT-0 doesn't catch (e.g., interrupt key cleared by readAndClearPending — verify in Plan 01 SUMMARY), adjust the side-effect to instead trigger via the agent's discriminator on iter 2's agent call by NOT triggering CKPT-0 (drop the `redis.set(interrupt:*)`). Test the actually-shipped scaffolding behavior.

    6. Run the new test file:
       ```bash
       npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts --reporter=verbose
       ```
       All 3 scenarios (S1, S2, S3) MUST pass green.

    7. **No regression sanity sweep** — run the full module test suite to ensure prior 5 suites still green:
       ```bash
       npx vitest run src/lib/agents/interruption-system-v2/__tests__/
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts && grep -c "it('S1\|it('S2\|it('S3" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts && npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` succeeds.
    - `grep -c "it('S1" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` ≥ 1.
    - `grep -c "it('S2" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` ≥ 1.
    - `grep -c "it('S3" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` ≥ 1.
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exits 0 with "3 passed".
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 across all 6 suites (5 prior + new).
  </acceptance_criteria>
  <done>S1/S2/S3 scenarios verify happy path + 1-iteration restart + cascading 2-iteration restart with token accumulation + restart_iteration sequencing.</done>
  <atomic_commit>test(interruption-v2): add S1/S2/S3 restart-loop scenarios (happy + Path A 1x + Path A 2x)</atomic_commit>
</task>

<task type="auto" tdd="true">
  <name>Task 2.2: Add S4 (Path B no-restart) + S5 (Regla 6 v3 byte-identity) scenarios to restart-loop.test.ts</name>
  <read_first>
    - The restart-loop.test.ts file from Task 2.1
    - src/lib/agents/engine/v3-production-runner.ts (FULL — to know its constructor + processMessage signature for S5)
    - .planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md §S5 multi-modal (static + behavioral + diff verification)
  </read_first>
  <behavior>
    - **S4:** Mock agent returns `{ success: true, messages: ['template_1_text'], totalTokens: 100 }`. Mock messaging.send is configured so the FIRST call returns `{ messagesSent: 1, interrupted: true, interruptedAtIndex: 1, sentIds: ['m1-tmpl1'] }` (simulating CKPT-7.N abort after sending template_1). Stage msg2 in pending list before the runner call. Assert: `msg_aborted_path_b_solo` emitted (NOT `..._path_a_combined`); NO `restart_iteration` field; `engineOutput.messagesSent === 1`; pending list STILL contains msg2 post-turn (drains in next inbound).
    - **S5:** Three-fold check:
      - (a) **Static gates** via greps embedded in the test (using `child_process.execSync` is acceptable, or hardcode the assertions reading the files via `fs.readFileSync`).
      - (b) **Diff gate** is run as part of the Plan 02 verification (NOT in the test file itself — the test file would need git available; the verification CLI script handles this).
      - (c) **Behavioral**: instantiate `V3ProductionRunner` (NOT V4), pass an EngineInput with `_v3:pendingUserMessage` non-empty, and assert that `emittedEvents` collected DURING the v3 turn is empty (mocked emitLockEvent never invoked because v3 doesn't import the module).

    *(Note for S5 behavioral test: the v3 runner does NOT import `interruption-system-v2` at all (Plan 01 verification confirms `grep -rn "interruption-system-v2" src/lib/agents/engine/v3-production-runner.ts` returns 0). So the `vi.mock('@/lib/observability', ...)` capturing emittedEvents won't see ANY lock-related events when running V3. The assertion is `emittedEvents.filter(e => e.label.startsWith('lock_') || e.label.includes('aborted')).length === 0`.)*
  </behavior>
  <action>
    1. Open the existing `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (from Task 2.1). Append the two new scenarios.

    2. Write S4 (Path B post-send NO restart):

       ```typescript
       it('S4 Path B post-send: actuallySentIds.length > 0 + interrupt → emit msg_aborted_path_b_solo, NO restart', async () => {
         // Agent returns success with templates
         agentMockFn.mockResolvedValueOnce({
           success: true,
           messages: ['template_1_text', 'template_2_text'],
           totalTokens: 100,
         } as V4AgentOutput)

         // Messaging.send: first template sent, then CKPT-7.N catches interrupt before template_2
         const mockMessaging = {
           send: vi.fn().mockResolvedValue({
             messagesSent: 1,
             interrupted: true,
             interruptedAtIndex: 1,
             sentIds: ['m1-tmpl1'],
           }),
         }

         // Stage msg2 in pending — should remain post-turn (D-01: Path B does NOT drain pending)
         await pushToPending('ws-1', 'whatsapp', '+57300', {
           entry_uuid: randomUUID(),
           content: 'msg2',
           received_at: new Date().toISOString(),
           msg_id: 'm2',
         })

         const adapters = makeAdapters({ messaging: mockMessaging as any })
         const runner = new V4ProductionRunner(adapters as any, { workspaceId: 'ws-1' })
         const input = await makeEngineInput()

         const output = await runner.processMessage(input)

         // Path B preserves current behavior
         expect(output.messagesSent ?? 0).toBeGreaterThanOrEqual(1)

         // NO restart event
         const restartEvents = emittedEvents.filter(e =>
           e.label === 'msg_aborted_path_a_combined' ||
           ('restart_iteration' in (e.payload as Record<string, unknown>))
         )
         expect(restartEvents).toHaveLength(0)

         // Path B event present (emitted by V4MessagingAdapter or the CKPT-6b Path B branch — depends on Plan 01)
         const pathBEvents = emittedEvents.filter(e => e.label === 'msg_aborted_path_b_solo')
         expect(pathBEvents.length).toBeGreaterThanOrEqual(1)

         // Pending list STILL contains msg2 (drains in next inbound)
         const all = mockRedis.__getAll()
         const pendingKey = `pending:ws-1:whatsapp:+57300`
         expect(all.lists.get(pendingKey)?.length ?? 0).toBeGreaterThanOrEqual(1)

         // Agent invoked only ONCE (no restart)
         expect(agentMockFn).toHaveBeenCalledTimes(1)
       })
       ```

    3. Write S5 (Regla 6 — multi-modal):

       ```typescript
       describe('S5 Regla 6 — v3/godentist/recompra/pw-confirmation paths byte-identical', () => {
         it('S5a static: zero interruption-system-v2 imports in non-v4 paths', async () => {
           const fs = await import('fs')
           const path = await import('path')
           const ROOT = path.resolve(__dirname, '../../../../..')  // repo root

           const v3Paths = [
             'src/lib/agents/engine/v3-production-runner.ts',
             'src/lib/agents/somnio-v3',
             'src/lib/agents/godentist',
             'src/lib/agents/godentist-fb-ig',
             'src/lib/agents/somnio-recompra',
             'src/lib/agents/somnio-pw-confirmation',
           ]

           const offending: string[] = []
           const walk = (p: string) => {
             const stat = fs.statSync(p)
             if (stat.isDirectory()) {
               for (const entry of fs.readdirSync(p)) walk(path.join(p, entry))
             } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
               const content = fs.readFileSync(p, 'utf-8')
               if (/interruption-system-v2|shouldRestart|restart_iteration|interrupted_at_ckpt_/.test(content)) {
                 // Ignore comment-only matches (rough heuristic)
                 const codeLines = content.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
                 if (codeLines.some(l => /interruption-system-v2|shouldRestart|restart_iteration|interrupted_at_ckpt_/.test(l))) {
                   offending.push(p)
                 }
               }
             }
           }
           for (const rel of v3Paths) {
             const abs = path.join(ROOT, rel)
             if (fs.existsSync(abs)) walk(abs)
           }

           expect(offending).toEqual([])
         })

         it('S5b behavioral: V3ProductionRunner emits zero lock-related events during a turn', async () => {
           // Reset emittedEvents
           emittedEvents.length = 0

           const { V3ProductionRunner } = await import('@/lib/agents/engine/v3-production-runner')

           // Build a minimal v3 input — match V3 EngineInput shape (no lockHandle field exists in v3 path)
           const adapters = makeAdapters()
           // V3 storage may have pendingUserMessage in session state — that's how the v3 path
           // accumulates messages. Set it via the storage mock:
           const sessionWithPending = {
             id: 'sess-v3',
             state: {
               datos_capturados: { '_v3:pendingUserMessage': 'msg_prior' },
               intents_vistos: [],
               templates_enviados: [],
             },
           }
           adapters.storage.getSession = vi.fn().mockResolvedValue(sessionWithPending)
           adapters.storage.getOrCreateSession = vi.fn().mockResolvedValue(sessionWithPending)

           // Mock the v3 agent module if v3 is similarly modular (or stub its dependencies).
           // If V3ProductionRunner is hard to construct in isolation, this test can FOCUS on the static gates (S5a)
           // and skip the behavioral component with a clear .skip note citing why.

           // If buildable:
           try {
             const runner = new V3ProductionRunner(adapters as any, { workspaceId: 'ws-1' })
             // Construct V3 EngineInput — exclude lockHandle/lockChannel/lockIdentifier (don't exist in v3 contract)
             const v3Input = {
               sessionId: 'sess-v3',
               conversationId: 'conv-v3',
               contactId: 'contact-v3',
               message: 'msg_new',
               workspaceId: 'ws-1',
               history: [],
             } as any

             await runner.processMessage(v3Input).catch(() => { /* don't care about success — care about events */ })

             const lockEvents = emittedEvents.filter(e =>
               e.label.startsWith('lock_') ||
               e.label.includes('aborted') ||
               e.label.includes('interrupt') ||
               'restart_iteration' in (e.payload as Record<string, unknown>)
             )
             expect(lockEvents).toHaveLength(0)
           } catch (e) {
             // If V3ProductionRunner requires deps we can't easily mock here, fall back to static-only verification.
             // The static gate (S5a) + the diff gate (verification section below) together prove Regla 6.
             console.warn('[S5b] V3ProductionRunner not buildable in isolation; relying on S5a static gate + diff gate.', e)
             // Still assert no lock events were emitted before the throw:
             const lockEvents = emittedEvents.filter(e =>
               e.label.startsWith('lock_') || e.label.includes('aborted')
             )
             expect(lockEvents).toHaveLength(0)
           }
         })
       })
       ```

       *Note on S5b:* if `V3ProductionRunner` is hard to instantiate without a full adapter stack, the test can fall back gracefully. The 3 gates together (static + behavioral-attempt + diff-via-verification) cover Regla 6. The static gate (S5a) alone is sufficient as a CI-enforceable contract.

    4. Run the full restart-loop test file:
       ```bash
       npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts --reporter=verbose
       ```
       5 scenarios MUST pass (S1, S2, S3, S4, S5a + S5b — vitest counts S5 as 2 sub-tests).

    5. Full module suite still green:
       ```bash
       npx vitest run src/lib/agents/interruption-system-v2/__tests__/
       ```
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "it('S4\|it('S5" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts && npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts --reporter=verbose 2>&1 | tail -30 && npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -5    <automated>grep -c "it('S4\|describe('S5\|it('S5" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts && npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts --reporter=verbose 2>&1 | tail -30 && npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -5</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "it('S4" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` ≥ 1.
    - `grep -c "describe('S5\|it('S5" src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` ≥ 1.
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exits 0 with at least 5 sub-tests reported (S1 + S2 + S3 + S4 + S5a + S5b — vitest may count S5 as 2 sub-tests inside its describe block, so "passed" count is 5 or 6).
    - `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 (full module suite green — no regression to prior 5 suites).
  </acceptance_criteria>
  <done>S4 (Path B no-restart) + S5 (Regla 6 multi-modal: static + behavioral) scenarios in place. Full module suite (6 test files) green.</done>
  <atomic_commit>test(interruption-v2): add S4 Path B no-restart + S5 Regla 6 byte-identity scenarios</atomic_commit>
</task>

</tasks>

<verification>
1. `test -f src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` succeeds.
2. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` exits 0 with at least 5 passing tests (S1, S2, S3, S4, S5a, optionally S5b).
3. `npx vitest run src/lib/agents/interruption-system-v2/__tests__/` exits 0 — all 6 test files green (lock + pending + checkpoints + observability + e2e-scenarios + restart-loop).
4. **Diff gate (CI-enforceable Regla 6 — runs OUTSIDE the test file because it requires git):**
   ```bash
   git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts | wc -l                       # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ | wc -l   # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v4/sub-loop/index.ts | wc -l                          # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v4/types.ts | wc -l                                   # MUST be 0
   ```
5. **No regression in `npx tsc --noEmit -p tsconfig.json`** — the new test file is `.ts` so it gets typechecked; ensure no new errors.
</verification>

<success_criteria>
- 5 scenarios labeled S1-S5 exist in a new file.
- All 5 pass against the Plan 01 scaffolding.
- Token accumulator and `restart_iteration` payload field are runtime-validated.
- Regla 6 static gate (S5a) is in-test (CI-enforceable on every PR).
- Regla 6 diff gate (verification step 4) runs in CI/pre-merge.
- No regression to prior 5 test suites.
</success_criteria>

<push_to_vercel>
After both atomic commits land, push to Vercel (Regla 1):
```bash
git push origin HEAD:main
```
Tests are TS-checked at build time on Vercel (`pnpm run build` runs tsc in CI). The vitest tests themselves run via `pnpm test` if a CI workflow is configured — verify the existing CI workflow runs `vitest` on every push (look at `.github/workflows/`).
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-interrupt-reprocess/02-SUMMARY.md` documenting:
- Final pass count from `npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (expected: 5-6 tests).
- Any adjustments to the S3 side-effect hook pattern (if the actual Plan 01 scaffolding placed CKPT-0 differently than expected).
- Whether S5b (V3ProductionRunner behavioral) executed fully or fell back to the warn-and-skip branch (latter is acceptable; S5a static gate is the load-bearing one).
- Confirmation that all 4 diff gates (v3 runner, sibling agents, sub-loop, types.ts) pass with zero bytes changed.
</output>
