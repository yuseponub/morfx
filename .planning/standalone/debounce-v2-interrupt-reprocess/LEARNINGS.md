# LEARNINGS — debounce-v2-interrupt-reprocess

**Shipped:** 2026-05-26
**Plans:** 4 (01 runner+agent refactor, 02 unit tests S1-S5, 03 integration test, 04 closure)
**Branch shipped:** `exec/debounce-v2-wave6` → fast-forwarded to `origin/main`
**Production code delta:** ~+70/-8 LOC across 2 files (`v4-production-runner.ts` + `somnio-v4-agent.ts`)
**Test code delta:** ~+1283 LOC across 2 new test files (restart-loop.test.ts 703 LOC + v4-production-runner-restart.test.ts 580 LOC)
**Ship status:** APPROVED — sub-loop + types.ts byte-identical; 5 non-v4 agents byte-identical (Regla 6); v4 still DORMANT in prod (zero customer impact); manual smoke deferred to sibling standalone `debounce-v2-sandbox-integration`

---

## 1. What was built (one-paragraph summary)

Converted the v4 inbound-message pipeline from "silent persist + return on interrupt"
semantics to "restart in-lambda" semantics. When a Path A interrupt fires at CKPT-0
through CKPT-6, the runner now drains the pending list, combines those messages with
the current `effectiveMessage`, and re-runs the turn pipeline within the SAME lambda
invocation under the SAME lock (heartbeat keeps the lock alive). Bot now responds in
~2 seconds after customer stops typing instead of staying mute until a 3rd message
or L1/L2 timer (D-01..D-08 of `debounce-v2-interrupt-reprocess` DISCUSSION-LOG).
Path B (post-send) preserved verbatim per D-01 + D-05. Sub-loop CKPT-3/4/5 interrupts
propagate via a string-prefix discriminator (`errorMessage.startsWith('interrupted_at_ckpt_')`)
that the runner detects after the agent call returns. Pitfall 7 (a SECOND bug
surfaced during research: `mapOutcomeToAgentOutput` silently converting sub-loop
interrupts into handoff-to-human signals) was fixed in the same plan with a 10-line
prefix check in the mapper's no_match branch. CKPT-7.N (per-template send loop) NOT
in scope — its `wasInterruptedWithZeroSends` legacy block remains live for the
first-byte abort edge case (Pitfall 5).

---

## 2. Bugs encountered during execution

| Bug | Plan | Cause | Fix | Prevention |
|-----|------|-------|-----|------------|
| TS7022 self-referencing implicit-any on `priorMsg` and `turnEffectiveMessage` | Plan 01 | Outer-scope `let effectiveMessage: string \| null = null` mutated across `continue` boundaries inside the `while` loop; TS could not infer narrowed type from `??` inside the loop body. | Explicit `: string` annotation on both intermediate consts (L191 + L223). No `as` casts, no `!` non-null assertions. | When mutating outer-scope `let X: T \| null` across loop-with-`continue` boundaries, annotate the narrowed inner consts explicitly — TS doesn't follow `??` narrowing across mutation points. |
| Step H scope ambiguity — `output.totalTokens` survived in non-return observability sites | Plan 01 | Plan said "every `tokensUsed:` return site". The grep gate said "0 matches of `tokensUsed: output.totalTokens`". Two non-return sites (user-turn DB row L805 + debug adapter recordTokens L866) used `output.totalTokens`, blowing the strict count. | Converted both to `totalTokensAcrossRestarts`. Semantically correct — both are per-lambda observability sinks that should reflect total resource use across all iterations. | Strict acceptance grep gates expose loose plan wording. Either tighten the plan wording OR document the broadened scope in SUMMARY (we did the latter). |
| S3 cascading-restart infinite loop on first test run | Plan 02 | Plan's original hint said "use CKPT-0 of iter 2 to catch interrupt via staging `interrupt:` key in iter 1's hook." But `readAndClearPending` clears only the pending LIST — NOT the `interrupt:` key. After iter 1's drain, the interrupt key remains, so iter 2's CKPT-0 re-fires restart forever. Hit worker OOM after 136s. | Redesigned S3 to trigger cascading restart via TWO agent-discriminator iterations (iter 1 returns `interrupted_at_ckpt_1`, iter 2 returns `interrupted_at_ckpt_2`, iter 3 returns success). The plan explicitly anticipated this fallback. | When designing a test that depends on side-effect interaction with stateful mocks, trace what the SUT actually does to that mock state. Don't assume `clear` semantics match the test's mental model. |
| mock-redis `multi()` was a no-op chain stub — restart-loop runner couldn't actually clear pending | Plan 02 | Shared `_helpers/mock-redis.ts` `multi()` is intentionally a chain stub (per its docstring); `tx.del(key).exec()` doesn't actually delete from the lists Map. Result: cumulative re-drain produced "msg2\\nmsg3\\nmsg2\\nmsg3\\nmsg1" instead of "msg2\\nmsg3\\nmsg1". | Per-test override of `mockRedis.multi.mockImplementation(...)` inside `beforeEach` wiring `tx.del(key) + tx.exec()` to delete from `allMaps.lists/store/ttls` directly. Did NOT modify the shared helper — preserves 40 existing tests passing semantics. | When a shared test helper stubs a multi-step Redis command, document which state mutations are stubbed and which are call-shape only. Override locally in `beforeEach` when real semantics are needed, restore in `afterEach`. |
| S5b V3ProductionRunner timeout — somnio-v3-agent module load | Plan 02 | V3 runner tried to load `somnio-v3-agent` → real DB / module dependencies that hung at 5s default vitest timeout. | Added `vi.mock('@/lib/agents/somnio-v3/somnio-v3-agent', ...)` returning no-op success output. v3 doesn't import `interruption-system-v2` regardless of agent module, so the behavioral assertion (zero lock events emitted) is still load-bearing. | When testing a "this agent doesn't emit X" invariant, the agent's processing path doesn't need to be REAL — it needs to compile + not crash. Mock at the agent's processMessage boundary. |
| `vi.fn` typed-args syntax — Vitest 1.x vs 2.x | Plan 02 | Used `vi.fn<(input: V4AgentInput) => Promise<V4AgentOutput>>()` (Vitest 2.x form). Vitest 1.x expects `vi.fn<[Args], Return>()`. | Changed to `vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()`. | Pin Vitest major-version assumptions to a brief comment near the first `vi.fn` typed call site; future migrations will pattern-match. |
| Cold-import + per-test timeout collision under WSL2 | Plan 03 | First dynamic `await import('@/lib/agents/somnio-v4')` triggers transitive load of ~50 modules (AI SDK + Gemini SDK + Anthropic SDK + knowledge-base) — takes 20-30s on WSL2. Default 5s vitest timeout fired mid-import, leaving the agent's promise unresolved; when it settled, it consumed the NEXT test's `mockResolvedValueOnce`. | Added `beforeAll` block (120s hook timeout) that pre-imports both modules. After it completes, the module cache is warm and per-test imports are microsecond-fast. Per-test timeout extended from 5s to 30s as belt-and-suspenders. | Use `beforeAll` for cold-import absorption when the SUT transitively pulls heavy SDKs; never rely on per-test imports to warm the cache. |
| Sub-loop mock not matching agent's relative import path | Plan 03 | Vitest's module resolver may treat `'./sub-loop'` (relative, from inside the agent file) and `'@/lib/agents/somnio-v4/sub-loop'` (alias, from the test file) as different module identities. Agent imports `runSubLoop from './sub-loop'` which Vitest resolves to `.../sub-loop/index.ts`; only mocking the alias path didn't intercept consistently. | Mock BOTH variants: `vi.mock('@/lib/agents/somnio-v4/sub-loop', ...)` AND `vi.mock('@/lib/agents/somnio-v4/sub-loop/index', ...)`. | When SUT imports via relative path but tests mock via alias, mock BOTH paths defensively. Vitest resolver consistency across alias vs relative vs explicit /index is not guaranteed. |
| Shared mock factory const hit TDZ at vi.mock hoist time | Plan 03 | Attempted to DRY the dual-path mock by extracting the factory into a shared `const subLoopMockFactory = () => ({...})`. But `vi.mock(...)` calls are HOISTED above the const declaration → temporal dead zone TypeError. | Inline the factory arrow function into each `vi.mock` call. The only safe shared reference is to `subLoopMockFn` (a `vi.fn()` closure variable that the factory body reads lazily at invocation time). | Never extract `vi.mock` factories into shared consts. Inline each factory. The DRY hit is real but the hoisting trap is worse. |

---

## 3. Patterns established (reusable for future migrations)

### 3.1 Restart-loop-in-orchestrator pattern (R-01)

When a stateful primitive (lock, transaction, session) wraps a complex async pipeline
and a "retry with combined input" semantic is needed, put the restart loop in the
ORCHESTRATOR (runner), NOT the pipeline (agent). The orchestrator owns:

- State snapshot ("what was the input?")
- Primitive lifecycle (acquire / heartbeat / release)
- Side-channel access (pending-list drain)

The pipeline returns a discriminator outcome; the orchestrator decides whether to retry.

```typescript
// At runner level:
let shouldRestart = true
let restartIteration = 0
let effectiveMessage: string | null = null
let totalTokensAcrossRestarts = 0

while (shouldRestart) {
  shouldRestart = false  // default; only set true to restart
  const turnEffectiveMessage: string = effectiveMessage ?? input.message

  // ...CKPT-0 check, agent call, CKPT-6 check...

  if (isInterruptDetected) {
    const pending = await readAndClearPending(...)
    effectiveMessage = [...pending, turnEffectiveMessage].join('\n')
    restartIteration++
    shouldRestart = true
    continue
  }

  // happy path — break out of loop via return
  return output
}
```

**Critical:** lock acquisition + heartbeat start happens OUTSIDE the loop. Lock release
happens in the OUTER `finally`. Only the inner turn body lives inside the loop.

### 3.2 String-prefix discriminator vs typed boolean (R-04)

When propagating "interrupt detected at point N" signals upward through 3 layers
(sub-loop → agent → runner), reusing the existing `errorMessage?: string` field with
a prefix protocol (`interrupted_at_ckpt_*`) is preferable to introducing a typed
boolean (e.g., `restart: true`). Rationale:

- The prefix is **greppable in Vercel logs** — operators can spot interrupt traffic
  without query DSL.
- The type field **already exists** in the contract — no `types.ts` churn.
- **No two sources of truth** — `errorMessage: 'interrupted_at_ckpt_3_post_tooling'`
  is BOTH the discriminator AND the diagnostic.

The pattern works because the field is `optional` — non-interrupt errors set the
field with any other string; non-error returns leave it undefined. The prefix check
is a single line:

```typescript
if (output.errorMessage?.startsWith('interrupted_at_ckpt_')) {
  // restart path
}
```

### 3.3 In-memory `effectiveMessage` accumulator (R-03 + Pitfall 8)

During restart-loop iterations, keep the combined message in an in-memory
`effectiveMessage: string | null` variable in the runner's outer scope. NEVER write
to DB between iterations.

```typescript
const turnEffectiveMessage: string =
  effectiveMessage
  ?? (pendingUserMessage ? [pendingUserMessage, input.message].join('\n') : input.message)
```

The `??` chain preserves the legacy v3 iter-1 path: if `effectiveMessage` is null
(first iteration), fall back to the pre-existing `pendingUserMessage` blob (loaded
from session state) combined with current `input.message`. On iter 2+,
`effectiveMessage` is set and shadows the legacy path.

Lock + heartbeat already provides exclusion; DB writes inside the loop are pure
overhead and risk a Path B/A reconciliation bug (Pitfall 8). The only remaining
DB-persist site for an interrupt is the legacy `wasInterruptedWithZeroSends` block
for the CKPT-7.1 first-byte abort edge case (Pitfall 5 documented preservation).

### 3.4 Token accumulator: single source of truth across all return sites (R-05 + Pitfall 2)

When the same outer function calls a token-consuming child multiple times within a
single invocation, surface the TOTAL cost at EVERY return site — not just the final
one. Pattern:

```typescript
let totalTokensAcrossRestarts = 0
// inside loop:
totalTokensAcrossRestarts += (output.totalTokens ?? 0)
```

Then replace EVERY `tokensUsed: output.totalTokens` (or equivalent) with
`tokensUsed: totalTokensAcrossRestarts`. Including:

- Final `EngineOutput` return
- Path B early returns (Path A wouldn't return, it would `continue`)
- Per-lambda DB observability rows (e.g., `addTurn({ role: 'user', tokensUsed })`)
- Debug adapter sinks (`debug.recordTokens({ tokensUsed })`)

A grep gate (`grep -c "tokensUsed: output.totalTokens" === 0`) enforces "no stragglers".
Without this, cost dashboards underreport restart-heavy turns by 50-66%.

### 3.5 Legacy block preservation as "known-reachable-rare-case" comment (Pitfall 5)

When a refactor replaces 3 of 4 paths to a piece of code, ADD A COMMENT to the 4th
(now isolated) path documenting which edge case keeps it live. The
`wasInterruptedWithZeroSends` block stayed for the CKPT-7.1 first-byte abort case;
the comment cross-references D-05 + Pitfall 5 so a future refactor doesn't delete
it as "dead code".

Pattern:

```typescript
// LEGACY — preserved per Pitfall 5 + D-05. The restart loop (CKPTs 0..6) handles
// every other interrupt path. This block only fires when CKPT-7.1 (per-template
// send loop) detects an interrupt AFTER the first byte was already sent. That
// path is OUT OF SCOPE for the restart loop — we cannot "rebobinar" a partial send.
if (wasInterruptedWithZeroSends) { ... }
```

### 3.6 Multi-modal Regla 6 verification: static + behavioral + diff (S5)

Three independent gates prove a refactor doesn't leak into protected paths:

- **Static (grep):** no imports of the new module in protected paths.
  ```bash
  grep -rn "interruption-system-v2\|shouldRestart\|interrupted_at_ckpt_" \
    src/lib/agents/engine/v3-production-runner.ts \
    src/lib/agents/{somnio-v3,godentist,godentist-fb-ig,somnio-recompra,somnio-pw-confirmation}/
  ```
  Expected: 0 non-comment lines.

- **Behavioral (vitest):** instantiate the protected runner and assert zero emit calls.
  ```typescript
  it('S5b — V3ProductionRunner emits zero lock events', async () => {
    const runner = new V3ProductionRunner(...)
    await runner.processMessage(v3Input)
    const lockEvents = emittedEvents.filter(e => e.label.startsWith('lock_'))
    expect(lockEvents).toEqual([])
  })
  ```

- **Diff (git):** `git diff --stat main -- <protected paths> | wc -l === 0`.

Each modality catches a different class of mistake:
- Static catches **typos in imports** (e.g., `interruption-systen-v2`).
- Behavioral catches **runtime side-effect leaks** (e.g., shared module-level state).
- Diff catches **silent edits to lines that don't match the grep but do break parity** (e.g., a refactor that touches a sibling helper used by both v4 and v3).

ONE check is insufficient. THREE catches different failure modes.

### 3.7 Trace ALL paths when fixing a "first" bug (Pitfall 7 discovery pattern)

When a bug report mentions interrupt-at-CKPT-N silent persist, don't just patch the
ONE path the customer reported. Trace EVERY path through the function. Pitfall 7
was discovered because research surfaced the FIRST bug (CKPT-0/6 silent persist via
runner-level Path A handler), then traced the sub-loop path and found
`mapOutcomeToAgentOutput` was ALSO silently converting sub-loop interrupts —
but into a DIFFERENT shape (handoff-to-human instead of "stay silent"). Both bugs
share the root cause (interrupts treated as terminal states) but surface in
DIFFERENT code with DIFFERENT visible symptoms.

When adding a new exit reason to a sum-type (here: LoopOutcome.reason string),
audit every consumer that pattern-matches on the OLD reasons. The mapper had a
`no_match` branch that didn't discriminate between "real KB miss" vs
"interrupt-mid-processing" — both came in as `status: 'no_match'`.

### 3.8 mock-redis `multi()` per-test override (Plan 02 deviation)

Don't modify the shared helper for one suite's needs. Override
`mockRedis.multi.mockImplementation(...)` in `beforeEach` to actually delete from
the `lists` Map; restore in `afterEach` (or use a `vi.restoreAllMocks` strategy).

```typescript
beforeEach(() => {
  mockRedis.multi.mockImplementation(() => {
    const tx: MultiTx = {
      del: (key: string) => {
        const all = mockRedis.__getAll()
        all.lists.delete(key)
        all.store.delete(key)
        all.ttls.delete(key)
        return tx
      },
      exec: async () => [],
    }
    return tx
  })
})
```

This preserves the shared helper's existing 40 tests passing (which assert the
chain-stub call shape).

### 3.9 `beforeAll` cold-import pre-warm (Plan 03 deviation)

WSL2 absorbs 20-30s of vitest cold module resolution when the SUT pulls AI SDK +
Gemini SDK + Anthropic SDK + knowledge-base. Doing the cold import in `beforeAll`
(with a 120s hook timeout) keeps per-test timing predictable:

```typescript
beforeAll(async () => {
  await import('@/lib/agents/somnio-v4')
  await import('@/lib/agents/engine/v4-production-runner')
}, 120_000)
```

Per-test timeout can then stay at the default (or 30s as belt-and-suspenders).

### 3.10 Dual-path module mock (Plan 03 deviation)

When Vitest's resolver might pick either path (alias `@/lib/agents/somnio-v4/sub-loop`
or explicit `/index`), mock BOTH to avoid bypass:

```typescript
const subLoopMockFn = vi.fn<[unknown], Promise<LoopOutcome>>()
vi.mock('@/lib/agents/somnio-v4/sub-loop', () => ({ runSubLoop: subLoopMockFn }))
vi.mock('@/lib/agents/somnio-v4/sub-loop/index', () => ({ runSubLoop: subLoopMockFn }))
```

DO NOT extract the factory into a shared const — vi.mock hoisting will hit TDZ.
Inline both factories. The only safe shared reference is to the `vi.fn()` closure
variable (which the factory body reads lazily at invocation time).

---

## 4. Second bug surfaced during research (Pitfall 7)

`mapOutcomeToAgentOutput` was silently converting sub-loop CKPT-3/4/5 interrupts
(`outcome.reason: 'interrupted_at_ckpt_3_post_tooling'` etc.) into
`{ newMode: 'handoff', requiresHuman: true }` — meaning a customer typing fast
during the sub-loop would have their session converted to "handoff to human agent"
mode without ever reaching a human. This was a hidden second bug that the
discuss-phase did not foresee; research surfaced it by reading
`mapOutcomeToAgentOutput` and noticing the no_match branch wasn't discriminating
between "real KB miss" vs "interrupt-mid-processing".

**Fix:** 10-line prefix check at the top of the no_match branch. If `outcome.reason`
starts with `interrupted_at_ckpt_`, return
`{ success: false, errorMessage: outcome.reason, messages: [] }` (matches the
agent's in-agent CKPT-1/CKPT-2 interrupt return shape). Else fall through to the
existing handoff path.

**Test coverage (Plan 03):** 5 vitest scenarios assert the fix end-to-end:
- 3 in-isolation tests (CKPT-3 / CKPT-4 / CKPT-5) prove the mapper produces the
  errorMessage shape for each propagating checkpoint.
- 1 regression guard test proves genuine `no_match` (with `requiresHuman: true`)
  still produces handoff shape.
- 1 full runner integration test proves the runner discriminator detector picks up
  the mapper's shape and restarts the loop.

**Pattern reminder:** when adding a new exit reason to a sum-type (here:
LoopOutcome.reason string), audit every consumer that pattern-matches on the OLD
reasons to ensure they correctly route the new reason.

---

## 5. Anti-patterns avoided

- **Did NOT** put the restart loop in the agent. Agent's job is "given THIS message,
  what's the output?" — a pure function. Loop is an orchestration concern (R-01).
- **Did NOT** introduce a typed `restart: true` boolean. Reused `errorMessage` field
  with prefix protocol (R-04).
- **Did NOT** modify `sub-loop/index.ts`. Sub-loop already emitted the correct shape;
  only the consuming mapper needed fixing (R-04 + Pitfall 7 isolation).
- **Did NOT** modify `types.ts`. Existing `errorMessage?: string` field supports the
  prefix protocol via convention, not via type system.
- **Did NOT** add a feature flag. v4 is dormant in prod (D-07); flag would be pure
  ceremony.
- **Did NOT** add a DB migration. Pure control-flow change (D-08).
- **Did NOT** add a restart cap or timeout. Trust natural quiescence; lock TTL +
  heartbeat keep lambda alive (D-03). If runaway scenarios appear in prod, revisit
  in v2.1.
- **Did NOT** persist `_v3:pendingUserMessage` during restart iterations. In-memory
  `effectiveMessage` only. Legacy `wasInterruptedWithZeroSends` block (CKPT-7.1 edge
  case) is the ONLY remaining DB-persist site (Pitfall 8).
- **Did NOT** restart the heartbeat per iteration. `startHeartbeat()` runs once
  OUTSIDE the while loop; `stopHeartbeat()` runs once in finally (Pitfall 6).
- **Did NOT** wrap `processMessage` in Inngest `step.run`. Replay semantics + restart
  loop would multiply iterations exponentially (Pitfall 9). `step.run` is for
  durable-step idempotency, not for in-lambda control flow.
- **Did NOT** modify the shared `mock-redis.ts` helper's `multi()` stub. Per-test
  override only (preserves the 40 prior tests' call-shape assertions).
- **Did NOT** add a typed `restart: true` boolean to V4AgentOutput or LoopOutcome.
  The string-prefix discriminator on existing `errorMessage` is the contract.

---

## 6. Things deferred to follow-up

| Item | Where it goes | Why deferred |
|------|---------------|--------------|
| Sandbox visual smoke | `debounce-v2-sandbox-integration` sibling | Per DISCUSSION-LOG.md "Out of scope" section. That sibling consumes the same observability events (`msg_aborted_path_a_combined` + `pending_list_combined` with `restart_iteration` field) and renders them in the sandbox `/sandbox` Interruption tab. |
| Real WhatsApp smoke | Activation moment of v4 per workspace | v4 is dormant in prod (zero workspaces have `conversational_agent_id='somnio-sales-v4'`). The fix activates only when v4 is enabled per-workspace via SQL flip (same migration path as parent standalone). Same code, same env vars; the activation moment IS the smoke. |
| Restart cap / runaway-troll protection | v2.1 if observed | D-03 explicit: re-evaluate if prod shows pathological restart counts. Default position: trust quiescence. |
| Semantic synthesis of combined message | `debounce-v2-semantic-synthesis` v2.1 | Currently `\n`-concat. Could be smarter (e.g., "user typed: msg1. then added: msg2. final: msg3") for better LLM comprehension. Defer to v2.1 if UX warrants. |
| Migration to v3 / godentist / godentist-fb-ig / recompra / pw-confirmation | Per-agent follow-up standalones | Per parent D-06 + this standalone D-06. After v4 has soaked in prod for ≥1 month. |
| `mapOutcomeToAgentOutput` exported for direct testing | If future refactors need it | Currently private to the agent module. Plan 03 had to drive it via `processMessage` to exercise the real mapper. If future refactors need direct testing, consider exporting via a `__test__` re-export. |

---

## 7. Verification evidence

- Plan 01 SUMMARY: confirms restart-loop scaffolding (4 restart sites) + Pitfall 7 fix
  in mapper + Regla 6 + sub-loop zero-touch + types.ts zero-touch gates all green.
  `npx tsc --noEmit` clean for both modified files. Heartbeat at L104 outside
  while-at-L139 (Pitfall 6 verified).
- Plan 02 SUMMARY: confirms 6 vitest scenarios pass (S1, S2, S3, S4, S5a, S5b) + full
  module suite green (46/46 across 6 suites). Three-fold Regla 6 verification
  (static grep + git-diff + behavioral V3 zero-lock-events) all green.
- Plan 03 SUMMARY: confirms 5 integration vitest scenarios pass (3 in-isolation for
  CKPT-3/4/5 + 1 regression guard + 1 full runner integration) via REAL
  `mapOutcomeToAgentOutput` mapper. Full corpora green (51/51 across 7 suites).

---

## 8. Cost telemetry estimate

- **Per-restart customer cost:** ~$0.001 USD (Haiku re-comprehension) per D-02.
- **Worst-case troll scenario:** 50 msgs / 30s → ~$0.05 USD/turn — trivial vs
  handoff-to-human cost.
- **Token accumulator dashboards** now report accurate cost per restart-heavy turn
  (previously underreported by 50-66% due to last-iter-only return).

---

## 9. Future migration playbook (for v3 / godentist / recompra / pw-confirmation → v4 restart)

1. **Audit the target agent's checkpoint surface** — does it use `interruption-system-v2`?
   If not, FIRST run the parent-standalone migration (`debounce-interruption-system-v2`
   per-agent variant) to install the lock + checkpoint sites.

2. **Apply this standalone's pattern:**
   - Wrap target runner's body in `while (shouldRestart)`.
   - Convert Path A return-with-saveState to `shouldRestart=true; continue`.
   - Add agent discriminator detector (`output.errorMessage?.startsWith('interrupted_at_ckpt_')`).
   - Add `totalTokensAcrossRestarts` accumulator at every return site (including
     DB observability rows + debug adapter).
   - Preserve any equivalent of the `wasInterruptedWithZeroSends` block for the
     per-template-send edge case.
   - Heartbeat start/stop OUTSIDE the while loop (Pitfall 6).

3. **Apply the 3-fold Regla 6 verification template** against ALL OTHER agents (i.e.,
   when migrating v3, the gate is "godentist + godentist-fb-ig + recompra +
   pw-confirmation + somnio-v4 paths byte-identical"; when migrating godentist, the
   gate is "v3 + v4 + the rest").

4. **Write 5 vitest scenarios** matching S1..S5 of this standalone, adapting names for
   the new agent. The patterns to copy:
   - Factory-closure `vi.mock` for `redis-client`.
   - Per-test `multi()` override for actual list deletion.
   - Canned per-iteration `mockResolvedValueOnce` for agent processMessage.
   - Static grep + behavioral V3-equivalent zero-emit test for the other agents.

5. **Apply Pitfall 7 audit:** if the target agent has its own `mapOutcomeToAgentOutput`
   equivalent (i.e., a sub-loop-result-to-output translator), audit it for silent
   interrupt-to-handoff conversion. Add a prefix check identical to this standalone's.

6. **Document in `.claude/rules/agent-scope.md`** under the existing Module Scope
   block for `interruption-system-v2`.

---

## 10. Tips para futuros agentes

### Lo que funcionó bien

- **Sequential plans + atomic commits per task** — bisect-friendly, per-commit
  verification.
- **Wave-by-wave push** — push to main only after wave's all commits landed + spot-checked.
- **Multi-modal Regla 6** — caught a case that grep alone would have missed.
- **`beforeAll` pre-warm** — predictable per-test timing on WSL2.

### Lo que NO hacer

- Don't extract `vi.mock` factories into shared consts (TDZ trap).
- Don't modify the shared mock-redis helper for one suite's needs (override locally).
- Don't trust Vitest resolver consistency across alias vs relative vs explicit `/index`
  (mock both defensively).
- Don't add a typed `restart: true` boolean to existing AgentOutput contracts
  (string-prefix discriminator on existing `errorMessage` is sufficient + greppable).
- Don't write to DB between restart iterations (in-memory `effectiveMessage` only).

### Comandos útiles

```bash
# Verify restart-loop scaffolding is present
grep -c "while (shouldRestart)" src/lib/agents/engine/v4-production-runner.ts        # ≥ 1
grep -c "totalTokensAcrossRestarts" src/lib/agents/engine/v4-production-runner.ts    # ≥ 4
grep -c "restart_iteration:" src/lib/agents/engine/v4-production-runner.ts           # ≥ 8

# Verify Pitfall 7 fix is present
grep -c "outcome.reason.startsWith('interrupted_at_ckpt_')" src/lib/agents/somnio-v4/somnio-v4-agent.ts  # ≥ 1

# Verify Regla 6: sub-loop + types.ts + 5 sibling agents byte-identical
git diff --stat main -- src/lib/agents/somnio-v4/sub-loop/index.ts src/lib/agents/somnio-v4/types.ts \
  src/lib/agents/engine/v3-production-runner.ts \
  src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ \
  src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ \
  | wc -l
# expect: 0

# Run the restart-loop test suites
npx vitest run src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts          # 6 pass
npx vitest run src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts          # 5 pass

# Full module suite
npx vitest run src/lib/agents/interruption-system-v2/__tests__/                              # 46 pass
```

---

## 11. Deuda técnica identificada

| Item | Prioridad | Fase sugerida |
|------|-----------|---------------|
| Sandbox visual smoke (sibling standalone consumer of restart events) | Media | `debounce-v2-sandbox-integration` (unblocked by this ship) |
| Real WhatsApp smoke on activation moment | Baja | When user flips `conversational_agent_id='somnio-sales-v4'` for a workspace |
| Migration to other agents (v3, godentist, godentist-fb-ig, recompra, pw-confirmation) | Baja | After v4 has soaked in prod for ≥1 month |
| Restart cap / runaway-troll protection | Muy baja | v2.1 if prod shows pathological restart counts |
| Semantic synthesis of combined message | Muy baja | v2.1 if UX warrants |
| `mapOutcomeToAgentOutput` exposed for direct testing | Documental | If future refactors need direct testing |

---

## 12. Notas para el módulo

Información específica que un agente de documentación de este módulo necesitaría saber:

- This standalone is a follow-up to the parent `debounce-interruption-system-v2`
  shipped 2026-05-26.
- Production code touches only 2 files:
  `src/lib/agents/engine/v4-production-runner.ts` and
  `src/lib/agents/somnio-v4/somnio-v4-agent.ts`.
- The mapper fix (Pitfall 7) lives at
  `src/lib/agents/somnio-v4/somnio-v4-agent.ts:892-927` (the `no_match` branch of
  `mapOutcomeToAgentOutput`).
- The outer restart loop lives at
  `src/lib/agents/engine/v4-production-runner.ts:138-901` (while loop) with
  outer-scope accumulators declared at L119-121.
- The 4 restart sites are: CKPT-0 inline (L165-209), agent-discriminator detector
  (L326-371), CKPT-6a inline (L422-460), CKPT-6b Path A (L530-572). Path B preserved
  at L574-588.
- The legacy `wasInterruptedWithZeroSends` block at L715-742 is PRESERVED for the
  CKPT-7.1 first-byte abort edge case (Pitfall 5 documented).
- The 2 new test files are:
  `src/lib/agents/interruption-system-v2/__tests__/restart-loop.test.ts` (703 LOC,
  6 tests) and `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts`
  (580 LOC, 5 tests).
- Module Scope is documented in `.claude/rules/agent-scope.md` under
  `### Module Scope: interruption-system-v2` (parent module's block, extended with a
  follow-up bullet referencing this standalone — added by Plan 04 Task 4.3).
- For activation playbook, the parent standalone's HANDOFF.md "Plan 07 dependency
  graph" + UAT.md "Phase 3 deferral" sections apply unchanged. This standalone does
  NOT introduce a new activation gate.

---

## Post-ship correction 2026-05-27 — chronological combine order

**Bug:** The 4 `effectiveMessage = [...pending, priorMsg].join('\n')` sites in
`v4-production-runner.ts` (CKPT-0, agent-discriminator detector, CKPT-6a,
CKPT-6b Path A) shipped with **reversed** chronological order — pending entries
(newer, arrived during processing) came FIRST and `priorMsg` / `turnEffectiveMessage`
(older, was being processed) came LAST. The order was inherited verbatim from the
parent standalone's pre-fix silent-persist code without questioning the semantics.

**Symptom:** Haiku comprehension on a restart read the combined string in reverse
chronological order:
```
msg2: "quiero comprar"        ← newer, but read first
msg1: "hola buenos días"      ← older, but read last
```

vs the natural / chronological reading the user originally specified in
DISCUSSION-LOG.md line 40 ("se une 1+2"):
```
msg1: "hola buenos días"      ← older, read first
msg2: "quiero comprar"        ← newer, read last
```

**Fix:** flip the 4 production sites to `[priorMsg, ...pending].join('\n')` and
`[turnEffectiveMessage, ...pending].join('\n')` respectively. Updated 2 hard
asserts in `restart-loop.test.ts` (S2 line 417 + S3 line 510) + ~6 comment lines
across both test files + UAT.md line 63 (forward-looking checklist).

**What we did NOT touch:**
- DISCUSSION-LOG.md, RESEARCH.md, 01..04-PLAN.md, 01..04-SUMMARY.md — these are
  historical artifacts documenting what shipped at the time. Rewriting them
  would erase the audit trail of the inverted-order period (commits `e5ead607`
  through `38ead22b` carried inverted order; `<fix-commit>` is the fix-forward).
- Path B (D-01) — already chronological because it processes pending-only in
  RPUSH arrival order with NO priorMsg re-included.
- Legacy `_v3:pendingUserMessage` accumulator on line 224
  (`${pendingUserMessage}\n${input.message}`) — already chronological because
  the only writer of `_v3:pendingUserMessage` (line 745 in `wasInterruptedWithZeroSends`
  legacy block) saves the original `input.message`, so on the next turn the
  formula `[saved-msg1]\n[new-msg2]` is naturally chronological.
- Sub-loop + types.ts — still R-04 zero-touch.

**Lesson (12th pattern):** when a fix inherits a code pattern verbatim from
parent / prior code, audit the **semantic** of the pattern against the user's
stated intent — not just the control-flow correctness. DISCUSSION-LOG.md
line 40 verbatim said "se une 1+2" (chronological); the inherited `[pending, input]`
shape silently subverted that intent. The unit tests passed because they
asserted the implementation's order, not the user's order — locking in the
deviation. Lesson reusable: **when migrating a code pattern across a fix, re-read
the original user requirement and verify the pattern still expresses it.**

---

*Generated at standalone ship time (2026-05-26). Input for training agents that
document control-flow refactors of distributed-coordination consumer subsystems +
for the eventual per-agent follow-up standalones listed in section 6.*
*Post-ship correction appended 2026-05-27 — chronological combine order.*
