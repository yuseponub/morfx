---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 03
type: execute
wave: 3
depends_on: [01, 02]
files_modified:
  - src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts
autonomous: true
requirements:
  - D-09  # Tests — extends with integration coverage through the actual runner+agent stack

must_haves:
  truths:
    - "New test file `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exercises V4ProductionRunner end-to-end with mocked external boundaries (storage, timer, messaging adapters; mock-redis for the lock primitives) but uses the REAL `somnio-v4-agent.ts` mapper to verify Pitfall 7 fix is wired correctly."
    - "Test asserts: when sub-loop returns a LoopOutcome with `status: 'no_match'` and `reason: 'interrupted_at_ckpt_3_post_tooling'`, the agent's `mapOutcomeToAgentOutput` converts it to `{ success: false, errorMessage: 'interrupted_at_ckpt_3_post_tooling', messages: [] }` AND the runner detects this and restarts (NOT a silent handoff to human — anti-Pitfall 7)."
    - "Test asserts: a Path A interrupt cascading from CKPT-1 (in-agent) AND from CKPT-3 (sub-loop via Pitfall 7 fix) both surface the same way upward through the runner and both trigger restart."
    - "Test asserts: V3MessagingAdapter is NOT instantiated for v4 turn (verify by `vi.spyOn` on the adapter class constructor OR by inspecting the messaging mock's identity)."
    - "Test asserts: lock_released_normal fires exactly once per turn even when restart count is ≥ 2 (one lock lifetime per lambda invocation)."
    - "Test file does NOT modify any production source file — pure addition under `__tests__/`."
    - "Test file passes alongside Plan 02's `restart-loop.test.ts` — both can run via `npx vitest run src/lib/agents/` exits 0."
  artifacts:
    - path: "src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts"
      provides: "Integration test for runner + agent (real mapper) + sub-loop interrupt propagation via Pitfall 7 fix"
      contains: "interrupted_at_ckpt_3_post_tooling"
  key_links:
    - from: "src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts"
      to: "src/lib/agents/somnio-v4/somnio-v4-agent.ts (REAL mapOutcomeToAgentOutput)"
      via: "imports the real agent module; mocks ONLY the sub-loop and comprehension helpers below it"
      pattern: "mapOutcomeToAgentOutput\\|interrupted_at_ckpt_"
    - from: "src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts"
      to: "src/lib/agents/engine/v4-production-runner.ts (Plan 01 scaffolding)"
      via: "instantiates V4ProductionRunner with mocked adapters; asserts integrated behavior end-to-end"
      pattern: "V4ProductionRunner"
---

<objective>
Wave 3 — Integration coverage of the runner + agent + sub-loop interrupt path. Plan 02's unit tests mocked the agent module entirely; this plan removes that mock and uses the REAL `mapOutcomeToAgentOutput` to prove that the Pitfall 7 fix correctly translates sub-loop CKPT-3/4/5 LoopOutcomes into runner-discriminator restart signals.

Purpose: this test is the load-bearing proof that the second bug fix (Pitfall 7) doesn't just compile — it actually triggers the runner restart loop when a sub-loop emits an interrupt. Without this integration test, a future refactor of `mapOutcomeToAgentOutput` could silently re-introduce the silent-handoff bug and the test suite wouldn't catch it.

Output: 1 new test file with ~200 LOC. After this plan, `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exits 0.

**Scope discipline:** if Plan 02's mock-based S2/S3 tests already provide adequate confidence and instrumenting the real agent module is hard (e.g., the real agent imports Anthropic SDK + Gemini SDK + Supabase, all needing mocks), this plan can be REDUCED to a single focused test: the Pitfall 7 propagation path. Document any scope reduction in `03-SUMMARY.md`.
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
@.planning/standalone/debounce-v2-interrupt-reprocess/02-SUMMARY.md

<interfaces>
<!-- Real agent module (Plan 01 modified) -->
From `src/lib/agents/somnio-v4/somnio-v4-agent.ts`:
```typescript
// Exported entry point — invoked by runner
export async function processUserMessage(input: V4AgentInput): Promise<V4AgentOutput>

// Internal mapper (Pitfall 7 fix site — lines ~844-957)
function mapOutcomeToAgentOutput(args: {
  outcome: LoopOutcome
  // ... other fields
}): V4AgentOutput
// After Plan 01: detects outcome.reason.startsWith('interrupted_at_ckpt_') in the no_match branch
// and returns { success: false, errorMessage: outcome.reason, messages: [] }.
```

<!-- Sub-loop signature (UNCHANGED — ZERO TOUCH per R-04) -->
From `src/lib/agents/somnio-v4/sub-loop/index.ts`:
```typescript
export async function runRagSubLoop(...): Promise<LoopOutcome>
export async function runLegacySubLoop(...): Promise<LoopOutcome>
type LoopOutcome =
  | { status: 'no_match'; reason: string; requiresHuman: boolean; /* ... */ }
  | { status: 'generated'; /* ... */ }
  | { status: 'template'; /* ... */ }
```

<!-- Comprehension module (the agent calls this before deciding to escalate to sub-loop) -->
The agent module's `processUserMessage` typically calls a `comprehend()` helper to get intent/sentiment, then routes to sub-loop if escalation needed. For this integration test, mock the sub-loop's `run*SubLoop` exports to return canned LoopOutcomes (so we don't depend on Gemini/Anthropic).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 3.1: Create v4-production-runner-restart.test.ts — Pitfall 7 propagation through real mapper</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (READ — find `processUserMessage` export + understand which sub-loop helpers it imports + identify what comprehension/state-machine modules need mocking)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (READ — identify the exact export name `runRagSubLoop` / `runLegacySubLoop`)
    - src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts (Plan 02 — pattern for mock-redis + adapter mocks + emittedEvents capture)
    - src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts (pattern reference)
  </read_first>
  <behavior>
    - Test 1 (Pitfall 7 — sub-loop CKPT-3 propagation): mock sub-loop's `runRagSubLoop` to return `{ status: 'no_match', reason: 'interrupted_at_ckpt_3_post_tooling', requiresHuman: false }` on iter 1, and a clean success outcome on iter 2. Push msg2 to pending pre-test. Run V4ProductionRunner. Assert:
      - Agent's REAL mapper receives the no_match LoopOutcome
      - Agent returns `V4AgentOutput` with `errorMessage: 'interrupted_at_ckpt_3_post_tooling'` (NOT `newMode: 'handoff'` — anti-Pitfall 7)
      - Runner's discriminator detector triggers
      - Pending drained + restart emitted with `restart_iteration: 1`
      - Iter 2 completes successfully
      - Final `engineOutput.success === true` AND NO `requires_human` side-effect persisted
    - Test 2 (control case — same path BEFORE fix would fail): document the assertion that distinguishes fixed-vs-unfixed: `engineOutput.requiresHuman ?? false === false`. Pre-fix, the silent handoff would set this to true.
    - Test 3 (regression guard — real `no_match` handoffs still work): mock sub-loop to return `{ status: 'no_match', reason: 'genuine_kb_miss', requiresHuman: true }`. Assert that the agent's mapper takes the EXISTING handoff branch (returns `newMode: 'handoff'`, `requiresHuman: true`) — NOT the new errorMessage branch. This verifies the prefix check is correctly scoped.
  </behavior>
  <action>
    1. Locate the real exports to mock. Run:
       ```bash
       grep -n "export async function\|export const\|export function" src/lib/agents/somnio-v4/sub-loop/index.ts
       grep -n "export async function\|export const\|export function" src/lib/agents/somnio-v4/somnio-v4-agent.ts
       grep -n "from '@/lib/agents/somnio-v4'" src/lib/agents/engine/v4-production-runner.ts
       ```
       Note: the runner does `const { processMessage } = await import('../somnio-v4')` — so the test mock target depends on the module index file. Check `src/lib/agents/somnio-v4/index.ts` (or similar) to confirm the re-export.

    2. Create `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts`:

       ```typescript
       import { describe, it, expect, vi, beforeEach } from 'vitest'
       import { createMockRedis } from '@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis'

       // -- Mock Redis (mock-redis shared helper) --
       const mockRedis = createMockRedis()
       vi.mock('@/lib/agents/interruption-system-v2/redis-client', () => ({
         redis: mockRedis,
         getRedisClient: () => mockRedis,
       }))

       // -- Mock observability collector --
       const emittedEvents: Array<{ label: string; payload: Record<string, unknown> }> = []
       vi.mock('@/lib/observability', () => ({
         getCollector: () => ({
           recordEvent: (_cat: string, label: string, payload: Record<string, unknown>) => {
             emittedEvents.push({ label, payload })
           },
         }),
       }))

       // -- Mock the sub-loop module (R-04: ZERO TOUCH the source, but mock for tests) --
       // The exact export name(s) come from `src/lib/agents/somnio-v4/sub-loop/index.ts`.
       const subLoopMock = vi.fn()
       vi.mock('@/lib/agents/somnio-v4/sub-loop', () => ({
         runRagSubLoop: (...args: unknown[]) => subLoopMock(...args),
         runLegacySubLoop: (...args: unknown[]) => subLoopMock(...args),
         // ... preserve any other exports as identity or noop as needed
       }))

       // -- Mock the comprehension / KB / LLM dependencies the agent calls.
       // The agent module typically imports an Anthropic Haiku call + Gemini KB embedding.
       // Inspect imports of somnio-v4-agent.ts to know what to stub; minimum:
       //   - The Haiku comprehend() helper → return canned intent
       //   - Any Supabase / fetch / etc. → noop
       // If the agent imports too many helpers, this test may need to be reduced (see scope discipline note in <objective>).
       //
       // Example mocks (refine based on actual imports):
       vi.mock('@/lib/agents/somnio-v4/comprehension', () => ({
         comprehend: vi.fn().mockResolvedValue({
           intent: 'precio',
           sentiment: 'neutral',
           classification: { category: 'precio', sentiment: 'neutral' },
           tokensUsed: 50,
         }),
       }))
       // ...add more vi.mock blocks as needed once agent imports are surveyed

       // -- Helpers (similar to Plan 02 restart-loop.test.ts) --
       function makeMockStorage() { /* same as Plan 02 */ }
       function makeMockMessaging() {
         return { send: vi.fn().mockResolvedValue({ messagesSent: 1, sentIds: ['m1-tmpl1'] }) }
       }
       function makeMockTimer() {
         return { setSessionId: vi.fn(), onCustomerMessage: vi.fn().mockResolvedValue(undefined) }
       }

       beforeEach(() => {
         emittedEvents.length = 0
         const all = mockRedis.__getAll()
         all.store.clear()
         all.ttls.clear()
         all.lists.clear()
         subLoopMock.mockReset()
       })

       describe('V4ProductionRunner — restart loop integration (Pitfall 7 via real mapper)', () => {

         it('sub-loop CKPT-3 interrupt → real mapper propagates as errorMessage → runner restarts (anti-Pitfall 7)', async () => {
           // ARRANGE: sub-loop returns interrupt on iter 1, success on iter 2
           subLoopMock
             .mockResolvedValueOnce({
               status: 'no_match',
               reason: 'interrupted_at_ckpt_3_post_tooling',
               requiresHuman: false,
               // ... other LoopOutcome fields as null/undefined
             })
             .mockResolvedValueOnce({
               status: 'generated',
               responseText: 'final reply',
               sourceTopic: 'precio',
               responseConfidence: 0.85,
               reason: 'kb_match',
             })

           // Pre-stage pending list
           const { pushToPending } = await import('@/lib/agents/interruption-system-v2/pending')
           const { acquireLock } = await import('@/lib/agents/interruption-system-v2/lock')
           const { randomUUID } = await import('crypto')

           const lockHandle = await acquireLock('ws-1', 'whatsapp', '+57300')
           expect(lockHandle).not.toBeNull()
           await pushToPending('ws-1', 'whatsapp', '+57300', {
             entry_uuid: randomUUID(),
             content: 'msg2',
             received_at: new Date().toISOString(),
             msg_id: 'm2',
           })

           // ACT
           const { V4ProductionRunner } = await import('@/lib/agents/engine/v4-production-runner')
           const adapters = {
             storage: makeMockStorage(),
             messaging: makeMockMessaging(),
             timer: makeMockTimer(),
           }
           const runner = new V4ProductionRunner(adapters as any, { workspaceId: 'ws-1' })
           const output = await runner.processMessage({
             sessionId: 'sess-1',
             conversationId: 'conv-1',
             contactId: 'contact-1',
             message: 'msg1',
             workspaceId: 'ws-1',
             history: [],
             lockHandle,
             lockChannel: 'whatsapp',
             lockIdentifier: '+57300',
             ownPendingEntryJson: null,
           } as any)

           // ASSERT
           expect(output.success).toBe(true)

           // anti-Pitfall 7: NO requires_human flag set
           expect((output as any).requiresHuman ?? false).toBe(false)
           // The runner should have emitted exactly one restart event with restart_iteration: 1
           const restarts = emittedEvents.filter(e =>
             e.label === 'msg_aborted_path_a_combined' &&
             (e.payload as Record<string, unknown>).restart_iteration === 1
           )
           expect(restarts).toHaveLength(1)

           // Sub-loop was invoked TWICE (iter 1 + iter 2)
           expect(subLoopMock).toHaveBeenCalledTimes(2)
         })

         it('sub-loop CKPT-3 interrupt: real mapper produces errorMessage shape (NOT handoff shape) — Pitfall 7 isolated assertion', async () => {
           // This test bypasses the runner and directly tests the agent's mapOutcomeToAgentOutput
           // via a tightly-controlled scenario: invoke the agent directly with a canned sub-loop interrupt.
           //
           // Implementation: depends on whether mapOutcomeToAgentOutput is exported or not.
           // If NOT exported (current state: it's a private function), this test must run via
           // processUserMessage with mocked sub-loop. If exported, can be tested in isolation.
           //
           // Recommended: mock sub-loop + call agent.processUserMessage directly, assert returned shape.

           subLoopMock.mockResolvedValueOnce({
             status: 'no_match',
             reason: 'interrupted_at_ckpt_3_post_tooling',
             requiresHuman: false,
           })

           const agent = await import('@/lib/agents/somnio-v4')
           const result = await agent.processMessage({
             message: 'test',
             history: [],
             currentMode: 'initial',
             intentsVistos: [],
             templatesEnviados: [],
             datosCapturados: {},
             packSeleccionado: null,
             turnNumber: 1,
             workspaceId: 'ws-1',
             sessionId: 'sess-1',
             lockHandle: null,
             lockChannel: null,
             lockIdentifier: null,
             ownPendingEntryJson: null,
           } as any)

           // Pitfall 7 fix: errorMessage prefix path
           expect(result.success).toBe(false)
           expect(result.errorMessage).toBe('interrupted_at_ckpt_3_post_tooling')

           // Anti-Pitfall 7: NO handoff side-effect
           expect(result.newMode).not.toBe('handoff')
           expect(result.requiresHuman ?? false).toBe(false)
         })

         it('regression guard: genuine no_match (NOT interrupt) still triggers handoff', async () => {
           subLoopMock.mockResolvedValueOnce({
             status: 'no_match',
             reason: 'genuine_kb_miss',  // does NOT start with 'interrupted_at_ckpt_'
             requiresHuman: true,
           })

           const agent = await import('@/lib/agents/somnio-v4')
           const result = await agent.processMessage({
             message: 'random gibberish nobody knows about',
             history: [],
             currentMode: 'initial',
             intentsVistos: [],
             templatesEnviados: [],
             datosCapturados: {},
             packSeleccionado: null,
             turnNumber: 1,
             workspaceId: 'ws-1',
             sessionId: 'sess-1',
           } as any)

           // Existing handoff path UNCHANGED
           expect(result.newMode).toBe('handoff')
           expect(result.requiresHuman).toBe(true)
           expect(result.errorMessage).toBeUndefined()  // no errorMessage on real handoff
         })

       })
       ```

    3. **Mock surveying step (CRITICAL):** before finalizing the file, RUN:
       ```bash
       grep -n "^import\|^const.*require" src/lib/agents/somnio-v4/somnio-v4-agent.ts | head -40
       ```
       Look for imports of: `@anthropic-ai/sdk`, `@google/generative-ai`, `@supabase/...`, fetch wrappers, etc. Each external dependency the agent calls during `processUserMessage` needs a `vi.mock(...)` stub. If the count is large (>5 distinct mocks needed), **reduce scope** — keep only Test 2 (Pitfall 7 isolated assertion) and Test 3 (regression guard), drop Test 1 (full runner integration). Document the reduction in `03-SUMMARY.md`.

    4. Run the new file:
       ```bash
       npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts --reporter=verbose
       ```
       Either all 3 tests pass, OR the reduced 2-test version passes. If a test cannot pass because the agent has too many unmocked deps, skip it with `.skip` and a clear comment citing the reason — the unit-test coverage in Plan 02 still provides the load-bearing assertion via mock.

    5. Final sanity:
       ```bash
       npx vitest run src/lib/agents/ 2>&1 | tail -10
       ```
       All `src/lib/agents/` tests green (Plan 02 + Plan 03 + prior parent standalone tests).
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && test -f src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts && grep -c "interrupted_at_ckpt_3_post_tooling\|interrupted_at_ckpt_" src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts && npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts --reporter=verbose 2>&1 | tail -30</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` succeeds.
    - `grep -c "interrupted_at_ckpt_3_post_tooling\|interrupted_at_ckpt_" src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` ≥ 2 (test cases reference the prefix).
    - `grep -c "anti-Pitfall 7\|Pitfall 7" src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` ≥ 1 (comment trail for future readers).
    - `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exits 0 with ≥ 2 passing tests (3 if full integration possible; 2 if reduced).
    - `npx vitest run src/lib/agents/` exits 0 (no regression).
  </acceptance_criteria>
  <done>Integration coverage of Pitfall 7 fix through real mapper — guarantees future refactors of `mapOutcomeToAgentOutput` cannot silently re-introduce the silent-handoff bug.</done>
  <atomic_commit>test(v4-runner): integration coverage of Pitfall 7 via real agent mapper</atomic_commit>
</task>

</tasks>

<verification>
1. `npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts` exits 0 with ≥ 2 passing tests.
2. `npx vitest run src/lib/agents/` exits 0 (full agents test corpus green — Plan 02 + Plan 03 + parent suites).
3. `npx tsc --noEmit -p tsconfig.json` reports zero new errors in the new test file.
4. **Production code untouched:** `git diff --stat main -- src/lib/agents/` shows ONLY the 2 files modified by Plan 01 (v4-production-runner.ts + somnio-v4-agent.ts) PLUS the 2 NEW test files (Plan 02's `restart-loop.test.ts` + Plan 03's `v4-production-runner-restart.test.ts`). No other production source modified.
</verification>

<success_criteria>
- Integration test asserts the Pitfall 7 fix is wired correctly through the REAL `mapOutcomeToAgentOutput` (not just the mock-based unit test from Plan 02).
- Test 3 (regression guard) ensures the existing genuine-no_match handoff path is UNAFFECTED — confirms the prefix check is correctly scoped.
- If full integration impossible due to too many transitive deps, scope is gracefully reduced to direct-call-to-agent-with-mocked-sub-loop coverage (still proves Pitfall 7) — documented in 03-SUMMARY.md.
</success_criteria>

<push_to_vercel>
After the atomic commit lands, push to Vercel (Regla 1):
```bash
git push origin HEAD:main
```
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-interrupt-reprocess/03-SUMMARY.md` documenting:
- Final test count and pass status.
- Which mocks were needed (list of `vi.mock(...)` calls actually used — informs future test author estimates).
- Whether scope reduction was applied (Test 1 dropped if agent has too many transitive deps).
- Cross-reference to Plan 02 (which provides mock-based unit coverage) — explain how the two plans complement each other.
</output>
