---
phase: standalone-debounce-interruption-system-v2
plan: 05
type: execute
wave: 5
depends_on: [04]
files_modified:
  - src/lib/agents/somnio-v4/types.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/sub-loop/index.ts
autonomous: true
requirements:
  - LOCK-05  # CKPT-1, CKPT-2 in agent; CKPT-3, CKPT-4, CKPT-5 in sub-loop (D-18)
  - LOCK-07  # interrupt_detected_at_ckpt_N + zombie_lambda_exit emitted at right place

must_haves:
  truths:
    - "REVISION W1: `src/lib/agents/somnio-v4/types.ts` is listed in this plan's `files_modified` because Task 5.1 step 2 adds (verifies, since Plan 04 Task 4.1 already added them) the lockChannel + lockIdentifier fields on V4AgentInput. If Plan 04 already shipped these fields, Task 5.1 step 2 is a NO-OP grep check. If for any reason Plan 04 ships without them (regression), Task 5.1 step 2 ADDS them and tsc would have failed earlier — both plans co-list this file for safety."
    - "CKPT-1 fires right after the comprehension Haiku call returns in somnio-v4-agent.ts (RESEARCH line 853 — after current line 106)."
    - "CKPT-2 fires after guards pass and before sales-track resolution in somnio-v4-agent.ts (RESEARCH line 854 — after current line 259, before line 262)."
    - "CKPT-3 fires after the tooling call returns in sub-loop/index.ts runRagSubLoop (RESEARCH line 860 — after current line 224)."
    - "CKPT-4 fires after the generation call returns in sub-loop/index.ts runRagSubLoop (RESEARCH line 861 — after current line 308)."
    - "CKPT-5 fires after the compliance check in sub-loop/index.ts runRagSubLoop (RESEARCH line 862 — after current line 347)."
    - "In sub-loop/index.ts runLegacySubLoop, a single combined CKPT-3+4+5 check fires after the single generateText call returns (RESEARCH line 860 + coverage matrix line 881)."
    - "SubLoopContext type extended with optional `lockHandle?: LockHandle | null` and `lockChannel?: 'whatsapp'|'facebook'|'instagram'` and `lockIdentifier?: string` so the sub-loop can call checkpoint() without re-querying conversation."
    - "Every CKPT in agent/sub-loop, on `lostLock: true`, throws `LostLockError(ckptId)` propagating to V4ProductionRunner's outer catch (Plan 04 Task 4.3 handler emits `zombie_lambda_exit`)."
    - "Every CKPT in agent/sub-loop, on `interrupted: true`, emits `interrupt_detected_at_ckpt_N` with the right ckptId AND returns early in a way the runner can detect (short-circuit V4AgentOutput with success=false + a discriminator field)."
  artifacts:
    - path: "src/lib/agents/somnio-v4/types.ts"
      provides: "V4AgentInput.lockChannel + V4AgentInput.lockIdentifier confirmed present (added by Plan 04 Task 4.1 REVISION W3; Plan 05 verifies and uses)"
      contains: "lockChannel"
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "CKPT-1 + CKPT-2 inserted at exact RESEARCH-cited line locations; lockHandle threaded from V4AgentInput into SubLoopContext"
      contains: "ckpt_1_post_comprehension"
    - path: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      provides: "SubLoopContext extension + CKPT-3, CKPT-4, CKPT-5 in runRagSubLoop + combined post-call CKPT in runLegacySubLoop"
      contains: "ckpt_3_post_tooling"
  key_links:
    - from: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      to: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      via: "import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'"
      pattern: "ckpt_1_post_comprehension"
    - from: "src/lib/agents/somnio-v4/sub-loop/index.ts"
      to: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      via: "ctx.lockHandle threaded → checkpoint() called at 3 points in RAG path + 1 combined point in legacy path"
      pattern: "ckpt_3_post_tooling"
---

<objective>
Wave 5 — Finish the 8-checkpoint coverage by inserting CKPT-1 + CKPT-2 in the somnio-v4 agent (post-comprehension, post-state-machine) and CKPT-3 + CKPT-4 + CKPT-5 in the RAG sub-loop (post-tooling, post-generation, post-compliance). The legacy sub-loop (crm_mutation/cas_reject) gets a single combined check after `runLegacySubLoop`'s only generateText call (per RESEARCH coverage matrix).

REVISION W1: this plan's `files_modified` frontmatter now lists `src/lib/agents/somnio-v4/types.ts` explicitly (both Plan 04 and Plan 05 co-list this file because both touch V4AgentInput). Plan 04 Task 4.1 ADDS the 4 lock fields (REVISION W3 — lockHandle/ownPendingEntryJson/lockChannel/lockIdentifier). Plan 05 Task 5.1 step 2 VERIFIES the channel/identifier fields are present (grep check) and CONSUMES them in the agent body.

Purpose: complete D-18 coverage so the conventional (no sub-loop) path runs through 5 checkpoints (0, 1, 2, 6, 7.N) and the sub-loop RAG path runs through 8 checkpoints (0, 1, 2, 3, 4, 5, 6, 7.N). This closes the "no protection during LLM calls" gap (G4 in DISCUSSION-LOG.md).

Output: 3 files modified (1 type file + 2 logic files). After this plan, the lock infrastructure is fully integrated and the only remaining work is the cron + sandbox tab (Plan 06) and the E2E + ship gate (Plan 07).
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
@.planning/standalone/debounce-interruption-system-v2/04-SUMMARY.md

<interfaces>
<!-- From Plan 04 Task 4.1 (REVISION W3) -->
From src/lib/agents/somnio-v4/types.ts (extended in Plan 04):
```typescript
export interface V4AgentInput {
  // ...existing fields
  lockHandle?: LockHandle | null
  ownPendingEntryJson?: string | null
  lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
  lockIdentifier?: string | null
}
```

<!-- This plan extends -->
From src/lib/agents/somnio-v4/sub-loop/index.ts (lines 55-64):
```typescript
export interface SubLoopContext extends SubLoopToolsContext {
  userMessage: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  // NEW (this plan): lockHandle? + lockChannel? + lockIdentifier?
}
```

<!-- From Plan 01+02 -->
From src/lib/agents/interruption-system-v2/checkpoints.ts:
```typescript
export async function checkpoint(
  ckptId: CheckpointId,
  handle: LockHandle,
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram',
  identifier: string,
  opts?: { templateIndex?: number; hasSentAnything?: boolean },
): Promise<CheckpointResult>
```

<!-- From Plan 04 -->
From src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts:
```typescript
export class LostLockError extends Error { constructor(public ckptId: string) }
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 5.1: Insert CKPT-1 + CKPT-2 in somnio-v4-agent.ts (RESEARCH lines 853-854) + REVISION W1 verify V4AgentInput fields present</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts (lines 1-260 — focus 95-110 comprehension call + 250-262 guards pass / sales track)
    - src/lib/agents/somnio-v4/types.ts (verify V4AgentInput has lockHandle + lockChannel + lockIdentifier from Plan 04 Task 4.1)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 849-855 (Exact Line Numbers for CKPT-1, CKPT-2)
    - .planning/standalone/debounce-interruption-system-v2/DISCUSSION-LOG.md (D-18 — 8 checkpoints with coverage matrix)
  </read_first>
  <action>
    **IMPORTANT — re-verify line numbers before editing.** RESEARCH cites "after line 106" for CKPT-1 and "after line 259" for CKPT-2 (snapshot 2026-05-25). If shifted, anchor structurally:
    - CKPT-1: immediately after `const { analysis, tokensUsed } = await comprehend(...)` returns, BEFORE `const { state: mergedState, changes } = mergeAnalysis(state, analysis)`.
    - CKPT-2: immediately after the `getCollector()?.recordEvent('guard', 'passed', ...)` call, BEFORE the `// 8. Sales track` block.

    1. Add imports at top of `src/lib/agents/somnio-v4/somnio-v4-agent.ts`:
       ```ts
       import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { LostLockError } from '../engine-adapters/production/v4-messaging-adapter'
       ```

    2. **REVISION W1 verify step — V4AgentInput fields present:** run `grep -c "lockChannel\|lockIdentifier" src/lib/agents/somnio-v4/types.ts`. Expected ≥ 2 (Plan 04 Task 4.1 already added these per REVISION W3).

       **If grep returns 0 (regression — Plan 04 didn't ship these correctly):** ADD them now:
       ```ts
       // V4AgentInput interface — append:
       lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
       lockIdentifier?: string | null
       ```
       This is defense-in-depth — both Plan 04 and Plan 05 list types.ts in files_modified for this exact reason.

    3. **Insert CKPT-1 after the comprehension call (around line 107):**
       ```ts
       if (input.lockHandle && input.lockChannel && input.lockIdentifier) {
         const ck1 = await checkpoint(
           'ckpt_1_post_comprehension',
           input.lockHandle,
           input.workspaceId,
           input.lockChannel,
           input.lockIdentifier,
         )
         if (ck1.lostLock) throw new LostLockError('ckpt_1_post_comprehension')
         if (!ck1.proceed && ck1.interrupted) {
           // Path A: no sends yet — let runner read pending and combine on next turn.
           emitLockEvent('msg_aborted_path_a_combined', {
             combined_msg_count: 1, // self only at this point; runner will read pending later
             total_chars: input.message.length,
           })
           return {
             success: false,
             messages: [],
             // ...minimal V4AgentOutput shape; mark a field the runner can detect (e.g., add discriminator)
             errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
           } as V4AgentOutput
         }
       }
       ```

    4. **Insert CKPT-2 after guards pass (around line 260):**
       ```ts
       if (input.lockHandle && input.lockChannel && input.lockIdentifier) {
         const ck2 = await checkpoint(
           'ckpt_2_post_state_machine',
           input.lockHandle,
           input.workspaceId,
           input.lockChannel,
           input.lockIdentifier,
         )
         if (ck2.lostLock) throw new LostLockError('ckpt_2_post_state_machine')
         if (!ck2.proceed && ck2.interrupted) {
           emitLockEvent('msg_aborted_path_a_combined', {
             combined_msg_count: 1,
             total_chars: input.message.length,
           })
           return { success: false, messages: [], errorMessage: 'interrupted_at_ckpt_2_post_state_machine' } as V4AgentOutput
         }
       }
       ```

    5. **Thread lockHandle/lockChannel/lockIdentifier into SubLoopContext when calling runSubLoop:** find the call site (use `grep -n "runSubLoop\|runRagSubLoop\|runLegacySubLoop" src/lib/agents/somnio-v4/somnio-v4-agent.ts`). Wherever `ctx: SubLoopContext` is built, append:
       ```ts
       lockHandle: input.lockHandle ?? null,
       lockChannel: input.lockChannel ?? null,
       lockIdentifier: input.lockIdentifier ?? null,
       ```

    6. **The runner needs to detect the discriminator `errorMessage: 'interrupted_at_ckpt_N...'`** to trigger Path A pending list combine. Plan 04 Task 4.3 already wraps in try/catch, so the runner sees `output.errorMessage` and can branch on it. If a cleaner discriminator is needed, add an explicit `interrupted?: { ckpt: string }` field to V4AgentOutput — but `errorMessage` works for now since it's already extracted in Plan 04 logic.
  </action>
  <verify>
    <automated>grep -c "checkpoint('ckpt_1_post_comprehension'" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -c "checkpoint('ckpt_2_post_state_machine'" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -c "LostLockError" src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -c "lockChannel\|lockIdentifier" src/lib/agents/somnio-v4/types.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "src/lib/agents/somnio-v4"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "checkpoint('ckpt_1_post_comprehension'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 1.
    - `grep -c "checkpoint('ckpt_2_post_state_machine'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 1.
    - `grep -c "LostLockError" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 2 (CKPT-1 throw + CKPT-2 throw).
    - `grep -c "msg_aborted_path_a_combined" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 2 (both CKPT branches).
    - `grep -c "lockChannel\|lockIdentifier" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 2 (V4AgentInput fields used).
    - `grep -c "lockChannel\|lockIdentifier" src/lib/agents/somnio-v4/types.ts` ≥ 2 (REVISION W1 — Plan 04 already added; Plan 05 verifies presence).
    - `npx tsc --noEmit -p tsconfig.json` reports zero new errors.
  </acceptance_criteria>
  <done>CKPT-1 + CKPT-2 firing post-comprehension and post-state-machine; lockHandle threaded into SubLoopContext; V4AgentInput fields verified (REVISION W1).</done>
</task>

<task type="auto" tdd="false">
  <name>Task 5.2: Insert CKPT-3/4/5 (RAG path) + combined CKPT (legacy path) in sub-loop/index.ts (RESEARCH lines 856-862 + 881)</name>
  <read_first>
    - src/lib/agents/somnio-v4/sub-loop/index.ts (lines 55-71 SubLoopContext + 193-205 runSubLoop entry + 207-460 runRagSubLoop + 600-650 runLegacySubLoop)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md lines 856-862 (exact line numbers for CKPT-3,4,5 in sub-loop/index.ts)
    - .planning/standalone/debounce-interruption-system-v2/RESEARCH.md line 881 (Coverage matrix — legacy path: combined CKPT-3+4+5 after runLegacySubLoop line 626)
  </read_first>
  <action>
    **IMPORTANT — re-verify line numbers before editing.** RESEARCH cites:
    - CKPT-3 after line 224 (after `runToolingCall` try/catch).
    - CKPT-4 after line 308 (after `runGenerationCall` try/catch).
    - CKPT-5 after line 347 (after `checkCompliance` call).
    - Combined CKPT for legacy path after line 626 (`output = safeAccessOutput(...)`).

    Anchor structurally:
    - CKPT-3 RAG: immediately after `const tooling = toolingResult.output` (currently line 226 area) — but BEFORE the `if (tooling.should_handoff || ...)` branch.
    - CKPT-4 RAG: immediately after `const generation = generationResult.output` (currently line 310 area) — BEFORE the threshold check.
    - CKPT-5 RAG: immediately after `const compliance = await checkCompliance(...)` (currently line 347) — BEFORE `if (compliance.nuncaDecirViolation)`.
    - Combined LEGACY: immediately after `output = safeAccessOutput(subLoopResult, LoopOutcomeSchema)` (currently line 626 area).

    1. Add imports at top of `src/lib/agents/somnio-v4/sub-loop/index.ts`:
       ```ts
       import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { LostLockError } from '../../engine-adapters/production/v4-messaging-adapter'
       import type { LockHandle } from '@/lib/agents/interruption-system-v2/lock'
       ```

    2. Extend `SubLoopContext` interface (lines ~55-64):
       ```ts
       export interface SubLoopContext extends SubLoopToolsContext {
         userMessage: string
         recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
         /** Standalone: debounce-interruption-system-v2 (D-18). */
         lockHandle?: LockHandle | null
         lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null
         lockIdentifier?: string | null
       }
       ```

    3. Define a helper `await ckptInSubLoop(ckptId: CheckpointId, ctx: SubLoopContext): Promise<{ proceed: boolean }>` at module scope:
       ```ts
       async function ckptInSubLoop(
         ckptId: 'ckpt_3_post_tooling' | 'ckpt_4_post_generation' | 'ckpt_5_post_compliance',
         ctx: SubLoopContext,
       ): Promise<{ proceed: boolean }> {
         if (!ctx.lockHandle || !ctx.lockChannel || !ctx.lockIdentifier) return { proceed: true }
         const ck = await checkpoint(ckptId, ctx.lockHandle, ctx.workspaceId, ctx.lockChannel, ctx.lockIdentifier)
         if (ck.lostLock) throw new LostLockError(ckptId)
         if (!ck.proceed && ck.interrupted) {
           emitLockEvent('msg_aborted_path_a_combined', {
             combined_msg_count: 1,
             total_chars: ctx.userMessage.length,
           })
           return { proceed: false }
         }
         return { proceed: true }
       }
       ```

    4. **In `runRagSubLoop` (around lines 207-460), insert 3 checkpoint calls:**

       After CKPT-3 anchor (post-tooling, around line 226):
       ```ts
       const tooling = toolingResult.output
       const toolingStep = extractStepData(toolingResult.rawResult)

       // [NEW] CKPT-3: post-tooling (D-18)
       const ck3 = await ckptInSubLoop('ckpt_3_post_tooling', args.ctx)
       if (!ck3.proceed) {
         return { status: 'no_match', responseText: null, sourceTopic: null, responseConfidence: null } as LoopOutcome
       }
       // ...existing tooling handling continues
       ```

       After CKPT-4 anchor (post-generation, around line 310):
       ```ts
       const generation = generationResult.output

       // [NEW] CKPT-4: post-generation (D-18)
       const ck4 = await ckptInSubLoop('ckpt_4_post_generation', args.ctx)
       if (!ck4.proceed) {
         return { status: 'no_match', responseText: null, sourceTopic: null, responseConfidence: null } as LoopOutcome
       }
       // ...existing threshold checks continue
       ```

       After CKPT-5 anchor (post-compliance, around line 347-348):
       ```ts
       const compliance = await checkCompliance({...})

       // [NEW] CKPT-5: post-compliance (D-18)
       const ck5 = await ckptInSubLoop('ckpt_5_post_compliance', args.ctx)
       if (!ck5.proceed) {
         return { status: 'no_match', responseText: null, sourceTopic: null, responseConfidence: null } as LoopOutcome
       }
       // ...existing compliance handling continues
       ```

       **Return shape:** the sub-loop returns `LoopOutcome` — `{ status: 'no_match', ... }` is the safe escalation outcome. The runner already handles `no_match` by escalating to handoff. This is the right early-return when the user interrupted: cancel cleanly, the lock release in the runner's finally cleans up.

    5. **In `runLegacySubLoop` (around line 603-650), insert ONE combined check after the single generateText call (around line 626):**
       ```ts
       output = safeAccessOutput(subLoopResult, LoopOutcomeSchema)

       // [NEW] Combined CKPT-3+4+5 for legacy path (RESEARCH coverage matrix line 881)
       if (args.ctx.lockHandle && args.ctx.lockChannel && args.ctx.lockIdentifier) {
         const ckLegacy = await checkpoint(
           'ckpt_3_post_tooling',  // CKPT-3 representative — legacy is a single-call path
           args.ctx.lockHandle,
           args.ctx.workspaceId,
           args.ctx.lockChannel,
           args.ctx.lockIdentifier,
         )
         if (ckLegacy.lostLock) throw new LostLockError('ckpt_3_post_tooling_legacy_combined')
         if (!ckLegacy.proceed && ckLegacy.interrupted) {
           emitLockEvent('msg_aborted_path_a_combined', {
             combined_msg_count: 1,
             total_chars: args.ctx.userMessage.length,
           })
           return { status: 'no_match', responseText: null, sourceTopic: null, responseConfidence: null } as LoopOutcome
         }
       }
       ```

    6. **Smoke test — confirm coverage matrix:**
       - Conventional path (no sub-loop): grep CKPT-0, 1, 2, 6, 7.N hits across runner + agent + adapter = 5 distinct.
       - Sub-loop RAG: same + 3, 4, 5 = 8.
       - Sub-loop legacy: 0, 1, 2, [combined 3-as-proxy], 6, 7.N = 6 distinct.
       - Sub-loop tooling-handoff (tooling returns escalation): 0, 1, 2, 3, then handoff = no 4/5 (early return after CKPT-3). Matches RESEARCH line 882.
  </action>
  <verify>
    <automated>grep -c "ckpt_3_post_tooling\|ckpt_4_post_generation\|ckpt_5_post_compliance" src/lib/agents/somnio-v4/sub-loop/index.ts && grep -c "LostLockError\|ckptInSubLoop" src/lib/agents/somnio-v4/sub-loop/index.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "src/lib/agents/somnio-v4/sub-loop"</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "ckpt_3_post_tooling" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 2 (helper signature + RAG call + legacy call).
    - `grep -c "ckpt_4_post_generation" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1.
    - `grep -c "ckpt_5_post_compliance" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1.
    - `grep -c "lockHandle" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 2 (SubLoopContext extension + usage).
    - `grep -c "LostLockError" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 1.
    - `grep -c "ckptInSubLoop" src/lib/agents/somnio-v4/sub-loop/index.ts` ≥ 4 (helper definition + 3 calls in RAG path).
    - `npx tsc --noEmit -p tsconfig.json` reports zero new errors in `src/lib/agents/somnio-v4/sub-loop/`.
    - Existing sub-loop tests still pass: `npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/somnio-v4/sub-loop/__tests__/ 2>&1 | tail -10` exits 0 (or whatever subset existed pre-this-plan — confirm no regression).
  </acceptance_criteria>
  <done>CKPT-3, 4, 5 in RAG path + combined check in legacy path; SubLoopContext extended.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for all 3 modified files (types.ts + somnio-v4-agent.ts + sub-loop/index.ts).
2. Coverage of 8 checkpoint IDs across the codebase:
   - `grep -rn "ckpt_0_post_acquire" src/` ≥ 2 (v4-runner + checkpoints.ts union).
   - `grep -rn "ckpt_1_post_comprehension" src/` ≥ 2 (agent + checkpoints.ts).
   - `grep -rn "ckpt_2_post_state_machine" src/` ≥ 2 (agent + checkpoints.ts).
   - `grep -rn "ckpt_3_post_tooling" src/` ≥ 3 (sub-loop RAG + legacy + checkpoints.ts).
   - `grep -rn "ckpt_4_post_generation" src/` ≥ 2 (sub-loop + checkpoints.ts).
   - `grep -rn "ckpt_5_post_compliance" src/` ≥ 2 (sub-loop + checkpoints.ts).
   - `grep -rn "ckpt_6_pre_send_loop" src/` ≥ 3 (runner ×2 + checkpoints.ts).
   - `grep -rn "ckpt_7_pre_template" src/` ≥ 2 (v4-messaging-adapter + checkpoints.ts).
3. Existing somnio-v4 + sub-loop tests pass (no regression).
4. REVISION W1: `grep -c "lockChannel\|lockIdentifier" src/lib/agents/somnio-v4/types.ts` ≥ 2.
</verification>

<success_criteria>
- All 8 D-18 checkpoints have at least one call site in production code.
- Conventional path covers 5 checkpoints; RAG sub-loop covers 8; legacy sub-loop covers 6.
- LostLockError throws propagate cleanly to the runner's outer handler.
- REVISION W1: types.ts listed in this plan's files_modified for defense-in-depth.
</success_criteria>

<output>
After completion, create `.planning/standalone/debounce-interruption-system-v2/05-SUMMARY.md` with the final coverage-matrix verification: a table mapping each of the 8 ckpt IDs to the actual file:line where it's called, confirming the coverage matrix in RESEARCH lines 875-886.
</output>
