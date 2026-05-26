---
phase: standalone-debounce-v2-interrupt-reprocess
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
autonomous: true
requirements:
  - D-01  # Path B scope (msg1 NOT re-processed)
  - D-02  # Fresh comprehension per restart
  - D-03  # No cap, no timeout — trust natural quiescence
  - D-04  # Same lambda, same lock
  - D-05  # Triggers = all CKPTs 0..6 (CKPT-7.N excluded)
  - D-06  # v4-only scope (Regla 6)
  - D-07  # No feature flag
  - D-08  # No DB migration

must_haves:
  truths:
    - "v4-production-runner.ts wraps the existing processMessage body (steps 1..end) in a `while (shouldRestart)` outer loop with `let shouldRestart = true; while (shouldRestart) { shouldRestart = false; ... }` pattern (R-01)."
    - "CKPT-0 inline site (currently around line 145-181) converts the existing return-after-saveState into `shouldRestart = true; continue` — NO `_v3:pendingUserMessage` saveState during restart iterations."
    - "After the agent call `const output = await processMessage(v4Input)`, the runner adds a discriminator detector: `if (output.success === false && output.errorMessage?.startsWith('interrupted_at_ckpt_'))` → drain pending, combine, emit observability, `shouldRestart = true; continue` (R-04)."
    - "CKPT-6a inline site (pending-templates-Path-A) converts return → `shouldRestart = true; continue` (Path A only; no saveState)."
    - "CKPT-6b inline site preserves D-01 split: if `actuallySentIds.length === 0` (Path A) → restart-continue; if `actuallySentIds.length > 0` (Path B) → preserve current return-with-saveState behavior verbatim (no restart)."
    - "Three outer-scope accumulators added: `let totalTokensAcrossRestarts = 0` (R-05), `let restartIteration = 0` (observability), `let effectiveMessage: string | null = null` (R-03)."
    - "Each iteration recomputes `turnEffectiveMessage` as `effectiveMessage ?? (pendingUserMessage ? \`${pendingUserMessage}\\n${input.message}\` : input.message)` — preserving turn-1 legacy v3 compat (R-03)."
    - "After every `await processMessage(v4Input)`, runner adds `totalTokensAcrossRestarts += (output.totalTokens ?? 0)` (R-05)."
    - "Final return uses `tokensUsed: totalTokensAcrossRestarts` (NOT `output.totalTokens`) — single source of truth for cost accounting across restarts (Pitfall 2)."
    - "Every restart-emitted `msg_aborted_path_a_combined` and `pending_list_combined` event payload includes `restart_iteration: number` (Pitfall 3)."
    - "Lock acquire/heartbeat/release lifecycle remains OUTSIDE the while loop: `startHeartbeat()` runs once before the loop; `stopHeartbeat()` + `releaseLockIfOwner()` run once in finally (Pitfall 6 — no heartbeat stacking)."
    - "Legacy `wasInterruptedWithZeroSends` block (currently lines 623-640) STAYS UNCHANGED — covers the CKPT-7.1 Path A edge case (template aborted at first byte). Add a code comment cross-referencing D-05 + Pitfall 5."
    - "somnio-v4-agent.ts `mapOutcomeToAgentOutput` adds a prefix check at the top of the existing `outcome.status === 'no_match'` branch (line ~892): if `outcome.reason?.startsWith('interrupted_at_ckpt_')` → return `{ ...baseOutput, success: false, errorMessage: outcome.reason, messages: [] }` instead of the existing handoff shape (Pitfall 7 fix)."
    - "Sub-loop file `src/lib/agents/somnio-v4/sub-loop/index.ts` is NOT TOUCHED (R-04 — already emits correct LoopOutcome shape with `reason: 'interrupted_at_ckpt_*'`)."
    - "types.ts (`src/lib/agents/somnio-v4/types.ts`) NOT TOUCHED — `errorMessage?: string` field already exists; the prefix protocol is documented in code comments only."
    - "Regla 6 preserved: v3-production-runner.ts and all sibling agents (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation) show zero diff against main."
  artifacts:
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "Outer restart loop; CKPT-0/6a/6b Path A `continue` semantics; agent-discriminator detector; token accumulator; restart_iteration observability"
      contains: "while (shouldRestart)"
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "Pitfall 7 fix in mapOutcomeToAgentOutput — sub-loop CKPT interrupts now propagate as errorMessage, not silent handoff"
      contains: "interrupted_at_ckpt_"
  key_links:
    - from: "src/lib/agents/engine/v4-production-runner.ts"
      to: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      via: "`output.errorMessage?.startsWith('interrupted_at_ckpt_')` discriminator after agent call"
      pattern: "interrupted_at_ckpt_"
    - from: "src/lib/agents/somnio-v4/somnio-v4-agent.ts (mapOutcomeToAgentOutput)"
      to: "src/lib/agents/somnio-v4/sub-loop/index.ts (LoopOutcome.reason)"
      via: "outcome.reason string prefix detection in no_match branch"
      pattern: "outcome.reason.startsWith"
    - from: "src/lib/agents/engine/v4-production-runner.ts"
      to: "src/lib/agents/interruption-system-v2/pending.ts + observability.ts"
      via: "readAndClearPending + emitLockEvent (UNCHANGED imports — already present)"
      pattern: "readAndClearPending\\|emitLockEvent"
---

<objective>
Wave 1 — Implement the restart loop at the runner level and fix the Pitfall 7 silent-handoff bug in the agent's mapper. This is the load-bearing implementation plan: ~+70 LOC across 2 files (~+60/-8 net runner, ~+10 net agent). After this plan, v4 turns process combined messages in-lambda via re-comprehension instead of silently persisting and going mute. Sub-loop and types.ts are ZERO TOUCH (R-04).

Purpose: replace the "silent persist + return" pattern at 3 inline CKPT sites (CKPT-0, CKPT-6a, CKPT-6b Path A) with `shouldRestart = true; continue` semantics. Add a 4th interrupt source — the agent's `errorMessage: 'interrupted_at_ckpt_*'` discriminator — which today is ignored by the runner. Also fix the second bug surfaced during research: `mapOutcomeToAgentOutput` was silently converting sub-loop CKPT interrupts into `requiresHuman=true` handoffs. Without the agent mapper fix, the runner restart loop NEVER triggers for CKPT-3/4/5 (sub-loop checkpoints).

Output: 2 files modified. Restart loop verifiable end-to-end via vitest scenarios in Plan 02.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@./.claude/rules/code-changes.md
@.planning/standalone/debounce-v2-interrupt-reprocess/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md

<interfaces>
<!-- Already-shipped primitives from parent standalone debounce-interruption-system-v2 (UNCHANGED) -->

From `src/lib/agents/interruption-system-v2/lock.ts`:
```typescript
export interface LockHandle { key: string; holderUuid: string; startedAt: string }
export async function releaseLockIfOwner(handle: LockHandle): Promise<boolean>
export function startHeartbeat(handle: LockHandle): () => void
```

From `src/lib/agents/interruption-system-v2/checkpoints.ts`:
```typescript
export async function checkpoint(
  ckptId: CheckpointId,
  handle: LockHandle,
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram',
  identifier: string,
  opts?: { templateIndex?: number; hasSentAnything?: boolean },
): Promise<CheckpointResult>
// CheckpointResult = { proceed: true } | { proceed: false; lostLock: true } | { proceed: false; interrupted: {...} }
```

From `src/lib/agents/interruption-system-v2/pending.ts`:
```typescript
export interface PendingEntry { entry_uuid: string; content: string; received_at: string; msg_id: string }
export async function readAndClearPending(
  workspaceId: string,
  channel: 'whatsapp' | 'facebook' | 'instagram',
  identifier: string,
): Promise<PendingEntry[]>
```

From `src/lib/agents/interruption-system-v2/observability.ts`:
```typescript
// 14-label union UNCHANGED (REVISION B1 — `lock_orphan_swept_by_cron` already shipped). Payload is Record<string, unknown> — restart_iteration: number is allowed without union changes.
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void
```

From `src/lib/agents/somnio-v4/types.ts` (V4AgentOutput — UNCHANGED):
```typescript
export interface V4AgentOutput {
  success: boolean
  messages: string[]
  errorMessage?: string        // <-- prefix `interrupted_at_ckpt_*` is the discriminator
  totalTokens?: number          // <-- per-call only (NOT accumulated by agent across iterations)
  newMode?: string
  requiresHuman?: boolean
  // ...other fields
}
```

From `src/lib/agents/somnio-v4/sub-loop/index.ts` (LoopOutcome — UNCHANGED, ZERO TOUCH):
```typescript
type LoopOutcome =
  | { status: 'no_match'; reason: string; requiresHuman: boolean; /* ... */ }
  | { status: 'generated'; /* ... */ }
  | { status: 'template'; /* ... */ }
// sub-loop already emits `reason: 'interrupted_at_ckpt_3_post_tooling' | 'interrupted_at_ckpt_4_post_generation' | 'interrupted_at_ckpt_5_post_compliance'`
```

<!-- Anchors (line numbers as of 2026-05-26 — verify before editing; use structural anchors if shifted) -->

v4-production-runner.ts current structure (854 LOC):
- Line ~100-104: `if (input.lockHandle) { stopHeartbeat = startHeartbeat(...) }` — OUTSIDE while loop (preserved)
- Line ~106: `let templatesSentCount = 0`
- Lines ~111-118: `const session = ...getSession/getOrCreateSession` — INSIDE while loop after refactor (R-02)
- Lines ~145-181: CKPT-0 site — currently `readAndClearPending + emitLockEvent + saveState(_v3:pendingUserMessage) + return` → CHANGE TO `shouldRestart = true; continue` (drop saveState)
- Lines ~187-192: `pendingUserMessage` accumulation — wrap with `effectiveMessage ?? ...` (R-03)
- Lines ~207-212: snapshot vars (`inputIntentsVistos`, `inputTemplatesEnviados`, `inputDatosCapturados`) — already resnap each iteration once body is in while loop
- Line ~262-278: preload idempotency guard — UNCHANGED
- Lines ~344-372: CKPT-6a site — same shape conversion as CKPT-0 site
- Lines ~451-491: CKPT-6b site — split: sentCount==0 → restart-continue; sentCount>0 → preserve current Path B behavior (return-with-saveState)
- Lines ~577-590: existing send-loop interrupt detection setting `wasInterruptedWithZeroSends = true` — UNCHANGED (per D-05 + Pitfall 5)
- Lines ~623-640: `wasInterruptedWithZeroSends` block — UNCHANGED (Pitfall 5)
- Lines ~645-660: final state save block (gated on agent success) — UNCHANGED
- Line ~761: `tokensUsed: output.totalTokens` → CHANGE to `tokensUsed: totalTokensAcrossRestarts`
- Lines ~784, 836, 846: existing emitLockEvent sites in finally — UNCHANGED

somnio-v4-agent.ts current structure (982 LOC):
- Lines 137-156: in-agent CKPT-1 interrupt return — UNCHANGED (already correct shape)
- Lines 335-355: in-agent CKPT-2 interrupt return — UNCHANGED
- Lines 844-957: `mapOutcomeToAgentOutput` function
- Lines 892-902: `if (outcome.status === 'no_match')` branch — THIS is the Pitfall 7 fix site
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1.1: Pitfall 7 fix — extend mapOutcomeToAgentOutput to detect sub-loop CKPT interrupt prefix</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts lines 837-902 (the mapOutcomeToAgentOutput function header + the no_match branch)
    - .planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md Pitfall 7 (lines ~367-376) + Example 2 (lines ~632-670)
    - src/lib/agents/somnio-v4/sub-loop/index.ts (READ ONLY — verify LoopOutcome shape; do NOT modify)
  </read_first>
  <action>
    1. Open `src/lib/agents/somnio-v4/somnio-v4-agent.ts`. Locate the `mapOutcomeToAgentOutput` function (line ~844). Locate the `if (outcome.status === 'no_match')` branch at line ~892.

    2. Modify the branch to add a prefix check at the top, BEFORE the existing handoff return:

       ```typescript
       if (outcome.status === 'no_match') {
         // ============================================================
         // Standalone: debounce-v2-interrupt-reprocess (D-05 + Pitfall 7).
         // Sub-loop CKPT-3/4/5 interrupts surface here with
         // outcome.reason = 'interrupted_at_ckpt_3_post_tooling' | 'interrupted_at_ckpt_4_post_generation' | 'interrupted_at_ckpt_5_post_compliance'.
         // BEFORE FIX: this branch silently converted them to requiresHuman=true handoffs
         // (a hidden second bug). AFTER FIX: propagate upward as errorMessage, identical
         // shape to the agent's in-agent CKPT-1/CKPT-2 interrupt returns. The runner's
         // discriminator detector (Plan 01 Task 1.2) consumes this prefix to trigger
         // restart with combined effectiveMessage.
         // DO NOT add newMode='handoff' or requiresHuman=true here — those would have
         // user-facing side effects (mode change persisted to session.state) for what
         // is really just a "we got interrupted mid-process, please restart" signal.
         // ============================================================
         if (typeof outcome.reason === 'string' && outcome.reason.startsWith('interrupted_at_ckpt_')) {
           return {
             ...baseOutput,
             success: false,
             messages: [],
             errorMessage: outcome.reason,
           }
         }
         // Existing handoff path — REAL no_match (sub-loop genuinely couldn't match KB).
         return {
           ...baseOutput,
           messages: [],
           newMode: 'handoff',
           requiresHuman: true, // D-60: flag explícito
           decisionInfo: {
             action: 'handoff',
             reason: outcome.reason,
           },
         }
       }
       ```

       Keep the existing `generated` and `template` branches BELOW this UNTOUCHED.

    3. **Do NOT modify** lines 137-156 (in-agent CKPT-1 return) or 335-355 (in-agent CKPT-2 return) — those already emit the correct shape (`errorMessage: 'interrupted_at_ckpt_*'`). They are the contract we are aligning the mapper to.

    4. **Do NOT modify** `src/lib/agents/somnio-v4/sub-loop/index.ts`. The sub-loop already returns the right LoopOutcome shape; only the agent's mapper consuming it was broken (R-04 + Pitfall 7).

    5. **Do NOT modify** `src/lib/agents/somnio-v4/types.ts`. The `errorMessage?: string` field already exists in `V4AgentOutput`. The prefix protocol lives in code comments only (per R-04 — string prefix is greppable in Vercel logs; adding a typed `restart: true` boolean would create two sources of truth).

    6. `npx tsc --noEmit` MUST stay clean for `src/lib/agents/somnio-v4/somnio-v4-agent.ts`.
  </action>
  <verify>
    <automated>grep -c "interrupted_at_ckpt_" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts && grep -c "outcome.reason.startsWith" /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/somnio-v4-agent.ts && (cd /mnt/c/Users/Usuario/Proyectos/morfx-new && git diff --stat -- src/lib/agents/somnio-v4/sub-loop/index.ts src/lib/agents/somnio-v4/types.ts) && (cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "somnio-v4-agent.ts")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "interrupted_at_ckpt_" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 3 (existing CKPT-1 + CKPT-2 + new mapper prefix check).
    - `grep -c "outcome.reason.startsWith" src/lib/agents/somnio-v4/somnio-v4-agent.ts` ≥ 1 (new prefix check).
    - `git diff --stat src/lib/agents/somnio-v4/sub-loop/index.ts` reports ZERO changes (R-04 zero-touch).
    - `git diff --stat src/lib/agents/somnio-v4/types.ts` reports ZERO changes.
    - `npx tsc --noEmit -p tsconfig.json` reports ZERO new errors attributable to `somnio-v4-agent.ts`.
    - Existing CKPT-1 / CKPT-2 in-agent interrupt return lines (137-156 + 335-355) are unchanged.
  </acceptance_criteria>
  <done>Pitfall 7 fixed — sub-loop CKPT-3/4/5 interrupts now propagate to runner as discriminator instead of silent handoff.</done>
  <atomic_commit>fix(somnio-v4-agent): propagate sub-loop CKPT interrupts via errorMessage (Pitfall 7)</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 1.2: Restart loop scaffolding in v4-production-runner.ts + CKPT-0/6a/6b conversion + agent-discriminator detector + token accumulator</name>
  <read_first>
    - src/lib/agents/engine/v4-production-runner.ts FULL FILE (854 LOC — read once to lock in line numbers for all 7 anchor sites)
    - .planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md Code Examples §Example 1 (lines ~405-630) — full annotated diff shape
    - .planning/standalone/debounce-v2-interrupt-reprocess/RESEARCH.md Pitfalls 1-9 (lines ~292-401) — failure modes to avoid
  </read_first>
  <action>
    **IMPORTANT — re-verify anchor line numbers before editing.** Line numbers in RESEARCH.md are a 2026-05-26 snapshot. Use these STRUCTURAL anchors (greppable):

    | Anchor | Grep |
    |--------|------|
    | startHeartbeat call (stays outside while) | `grep -n "startHeartbeat(input.lockHandle)" src/lib/agents/engine/v4-production-runner.ts` |
    | templatesSentCount declaration (stays outside while) | `grep -n "let templatesSentCount = 0" src/lib/agents/engine/v4-production-runner.ts` |
    | session fetch (move INSIDE while) | `grep -n "input.sessionId" src/lib/agents/engine/v4-production-runner.ts \| head -1` |
    | CKPT-0 site | `grep -n "checkpoint('ckpt_0_post_acquire'" src/lib/agents/engine/v4-production-runner.ts` |
    | pendingUserMessage accumulation | `grep -n "_v3:pendingUserMessage' as string \\| undefined" src/lib/agents/engine/v4-production-runner.ts` |
    | snapshot vars | `grep -n "inputIntentsVistos\\|inputTemplatesEnviados\\|inputDatosCapturados" src/lib/agents/engine/v4-production-runner.ts` |
    | agent call | `grep -n "await processMessage(v4Input)" src/lib/agents/engine/v4-production-runner.ts` |
    | CKPT-6a site (pending templates) | first `checkpoint('ckpt_6_pre_send_loop'` match |
    | CKPT-6b site (main send) | second `checkpoint('ckpt_6_pre_send_loop'` match |
    | wasInterruptedWithZeroSends declaration | `grep -n "let wasInterruptedWithZeroSends = false" src/lib/agents/engine/v4-production-runner.ts` |
    | tokensUsed return field | `grep -n "tokensUsed: output.totalTokens" src/lib/agents/engine/v4-production-runner.ts` |

    ---

    **Step A — Add outer-scope accumulators (before the `try` block, after `templatesSentCount`):**

    Insert after `let templatesSentCount = 0` line:

    ```typescript
    // ============================================================
    // Standalone: debounce-v2-interrupt-reprocess outer-scope state.
    // These persist ACROSS restart-loop iterations within a single lambda
    // invocation; reset to zero at the top of each new processMessage() call.
    // ============================================================
    let totalTokensAcrossRestarts = 0  // R-05: accumulate output.totalTokens per iteration
    let restartIteration = 0           // observability — Pitfall 3 distinguishes restart 1 vs 5
    let effectiveMessage: string | null = null  // R-03: null on iter 1 (legacy v3 path), non-null after first restart
    ```

    Also: `const startMs = Date.now()` if not already present near the top — needed by the existing `lock_released_normal` emit in finally; verify with `grep -n "startMs" src/lib/agents/engine/v4-production-runner.ts`.

    **Step B — Wrap the body in `while (shouldRestart)`:**

    After the heartbeat-start block (`if (input.lockHandle) { stopHeartbeat = startHeartbeat(input.lockHandle) }`) and BEFORE the `try {` that opens the existing body, OR inside the existing top-level try (whichever places it INSIDE the outer try/finally so finally still runs), insert:

    ```typescript
    try {
      // ============================================================
      // Standalone: debounce-v2-interrupt-reprocess restart loop (D-04 + R-01).
      // Wraps the entire turn body so any Path A interrupt at CKPT-0/1/2/3/4/5/6a/6b
      // drains pending, combines into effectiveMessage, and re-runs the turn in
      // the SAME lambda with the SAME lock (heartbeat keeps it alive).
      //
      // CKPT-7.N (send-loop per-template) does NOT restart (D-05) — once we've sent
      // ≥1 template, restarting would re-send what the customer already saw.
      // The existing send-loop branch and wasInterruptedWithZeroSends block
      // are PRESERVED for the rare CKPT-7.1 first-byte abort case (Pitfall 5).
      // ============================================================
      let shouldRestart = true
      while (shouldRestart) {
        shouldRestart = false

        // ... ENTIRE EXISTING BODY MOVES HERE (session fetch through send-loop through state save through return) ...

      }  // end while (shouldRestart)

      // Defensive — exhaustiveness: every code path inside while must return or set shouldRestart=true.
      // Reaching here means a bug.
      throw new Error('[V4-RUNNER] restart loop exited without return — invariant violation')
    } catch (error) {
      // EXISTING outer catch UNCHANGED — LostLockError, VersionConflictError, generic catch
      ...
    } finally {
      // EXISTING finally UNCHANGED — heartbeat stop + lock release + lock_released_normal emit
      ...
    }
    ```

    All existing logic (session fetch, pendingUserMessage accumulation, snapshot, preload, agent call, send loops, state save, returns) goes INSIDE the while.

    **Step C — Convert CKPT-0 inline site from return-with-saveState to restart-continue:**

    Locate the existing CKPT-0 block (currently lines ~143-181 — `if (input.lockHandle && lockCtx) { const ck0 = await checkpoint('ckpt_0_post_acquire', ...)`). Replace the inner `if (!ck0.proceed && ck0.interrupted)` body:

    BEFORE (delete):
    ```typescript
    const pending = await readAndClearPending(...)
    emitLockEvent('msg_aborted_path_a_combined', { /* no restart_iteration */ ... })
    emitLockEvent('pending_list_combined', { ... })
    const combinedMessage = [...pending.map(p => p.content), input.message].join('\n')
    await this.adapters.storage.saveState(session.id, {
      datos_capturados: { ..., '_v3:pendingUserMessage': combinedMessage },
    })
    return { success: true, messages: [], sessionId, messagesSent: 0 }
    ```

    AFTER:
    ```typescript
    const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
    restartIteration++
    const priorMsg = effectiveMessage ?? input.message
    emitLockEvent('msg_aborted_path_a_combined', {
      at_step: 'ckpt_0_post_acquire',
      combined_msg_count: pending.length + 1,
      total_chars: pending.reduce((s, p) => s + p.content.length, 0) + priorMsg.length,
      restart_iteration: restartIteration,
    })
    emitLockEvent('pending_list_combined', {
      at_step: 'ckpt_0_post_acquire',
      entries_count: pending.length,
      total_chars: pending.reduce((s, p) => s + p.content.length, 0),
      restart_iteration: restartIteration,
    })
    effectiveMessage = [...pending.map(p => p.content), priorMsg].join('\n')
    // Pitfall 8: NO saveState during restart iterations.
    // The combined message lives in-memory in effectiveMessage until the iteration completes successfully.
    shouldRestart = true
    continue
    ```

    The `ck0.lostLock` branch (`if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')`) UNCHANGED.

    **Step D — Hook effectiveMessage into the pendingUserMessage accumulator (R-03):**

    Locate the existing line (~187-190):
    ```typescript
    const pendingUserMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined
    const turnEffectiveMessage = pendingUserMessage ? `${pendingUserMessage}\n${input.message}` : input.message
    ```

    Replace with:
    ```typescript
    const pendingUserMessage = currentDatos['_v3:pendingUserMessage'] as string | undefined
    const turnEffectiveMessage = effectiveMessage
      ?? (pendingUserMessage ? `${pendingUserMessage}\n${input.message}` : input.message)
    ```

    Iter 1 (`effectiveMessage === null`) preserves legacy v3 path; restart iterations use the in-memory combined string (R-03 + Pitfall 8).

    **Step E — Add the agent-discriminator detector AFTER `const output = await processMessage(v4Input)` (R-04):**

    Right after the `await processMessage(v4Input)` line (~line 296 — find with `grep -n "await processMessage(v4Input)"`), insert:

    ```typescript
    // R-05: accumulate per-call tokens across restart iterations (final return uses totalTokensAcrossRestarts).
    totalTokensAcrossRestarts += (output.totalTokens ?? 0)

    // ============================================================
    // R-04 + Pitfall 7: detect Path A interrupt surfaced by the agent (in-agent
    // CKPT-1/CKPT-2 OR sub-loop CKPT-3/4/5 propagated via mapOutcomeToAgentOutput).
    // The prefix 'interrupted_at_ckpt_' is the discriminator — string match (NOT a
    // typed boolean — see R-04 rationale: greppable in Vercel logs).
    // ============================================================
    if (
      output.success === false &&
      typeof output.errorMessage === 'string' &&
      output.errorMessage.startsWith('interrupted_at_ckpt_')
    ) {
      if (!lockCtx) {
        // Should be impossible (agent only emits this discriminator when invoked under a lock),
        // but if it happens we fall through to error handling rather than corrupting state.
        throw new Error(`[V4-RUNNER] agent emitted ${output.errorMessage} but lockCtx is null`)
      }
      const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
      restartIteration++
      emitLockEvent('msg_aborted_path_a_combined', {
        at_step: output.errorMessage,
        combined_msg_count: pending.length + 1,
        total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
        restart_iteration: restartIteration,
      })
      emitLockEvent('pending_list_combined', {
        at_step: output.errorMessage,
        entries_count: pending.length,
        total_chars: pending.reduce((s, p) => s + p.content.length, 0),
        restart_iteration: restartIteration,
      })
      effectiveMessage = [...pending.map(p => p.content), turnEffectiveMessage].join('\n')
      shouldRestart = true
      continue
    }
    ```

    **Step F — Convert CKPT-6a (pending-templates Path A) from return-with-saveState to restart-continue:**

    Locate first `checkpoint('ckpt_6_pre_send_loop', ...)` (currently around line 344-372). Same pattern as Step C:
    - Keep the `lostLock` throw.
    - Inside `if (!ck6a.proceed && ck6a.interrupted)`: drain pending, increment restartIteration, emit both events WITH `restart_iteration: restartIteration` and `at_step: 'ckpt_6_pre_send_loop_pending_templates'`, set effectiveMessage to `[...pending, turnEffectiveMessage].join('\n')`, `shouldRestart = true; continue`.
    - **Remove** the existing `saveState({ '_v3:pendingUserMessage': combinedMessage })` call from this site.

    **Step G — Convert CKPT-6b (main send) to D-01 split:**

    Locate second `checkpoint('ckpt_6_pre_send_loop', ...)` (currently around line 451-491). The current code already has the `sentCount === 0 vs > 0` distinction; modify ONLY the `sentCount === 0` Path A branch to restart-continue (per D-01):

    Inside `if (!ck6b.proceed && ck6b.interrupted)`:
    ```typescript
    const sentCount = actuallySentIds.length
    if (sentCount === 0) {
      // Path A — restart-continue (D-01 + D-05)
      const pending = await readAndClearPending(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
      restartIteration++
      emitLockEvent('msg_aborted_path_a_combined', {
        at_step: 'ckpt_6_pre_send_loop_main',
        templates_sent_before_abort: 0,
        restart_iteration: restartIteration,
      })
      emitLockEvent('pending_list_combined', {
        at_step: 'ckpt_6_pre_send_loop_main',
        entries_count: pending.length,
        total_chars: pending.reduce((s, p) => s + p.content.length, 0),
        restart_iteration: restartIteration,
      })
      effectiveMessage = [...pending.map(p => p.content), turnEffectiveMessage].join('\n')
      shouldRestart = true
      continue
    } else {
      // Path B — D-01: msg1 already had templates sent; do NOT restart, do NOT re-include msg1.
      // Preserve current behavior verbatim: emit Path B event, persist pending_templates if mid-template,
      // return success with sentCount.
      emitLockEvent('msg_aborted_path_b_solo', {
        at_step: 'ckpt_6_pre_send_loop_main',
        templates_sent_before_abort: sentCount,
      })
      templatesSentCount = sentCount
      // Existing logic for Path B preserved (state save for partial-send already happens elsewhere).
      // The outer-scope tokensUsed accumulator surfaces below.
      return {
        success: true,
        messages: [],
        sessionId: session.id,
        messagesSent: sentCount,
        tokensUsed: totalTokensAcrossRestarts,
        // ...preserve any other fields the existing Path B return uses
      }
    }
    ```

    Verify the EXISTING Path B branch had `messagesSent: sentCount` and similar — re-emit those exact fields plus the new `tokensUsed: totalTokensAcrossRestarts`.

    **Step H — Change final return to use the accumulator:**

    Locate the final return statement (around line 758-769). Change:
    ```typescript
    tokensUsed: output.totalTokens
    ```
    to:
    ```typescript
    tokensUsed: totalTokensAcrossRestarts
    ```

    NOTE: there may be multiple return sites (Path B return inside CKPT-6b, regular success return at end). Every return that the new restart loop touches MUST use `tokensUsed: totalTokensAcrossRestarts`. Use `grep -n "tokensUsed:" src/lib/agents/engine/v4-production-runner.ts` to find them all (likely 2-3 sites). For the `wasInterruptedWithZeroSends` block return (line ~660-665), also use `totalTokensAcrossRestarts` since that block is reached AFTER `totalTokensAcrossRestarts += output.totalTokens` ran.

    **Step I — Preserve `wasInterruptedWithZeroSends` block VERBATIM (Pitfall 5):**

    Lines ~623-640. Do NOT remove. Do NOT modify behavior. ADD a comment above it:

    ```typescript
    // ============================================================
    // Pitfall 5 (Standalone debounce-v2-interrupt-reprocess): this block remains
    // live for the CKPT-7.N Path A edge case (template_1 send aborted at first byte
    // by V4MessagingAdapter.shouldAbortBeforeTemplate). Per D-05 explicit:
    // CKPT-7.N does NOT trigger restart. The next inbound's lambda will see
    // _v3:pendingUserMessage in session state and accumulate via R-03 iter-1 path.
    // ============================================================
    if (wasInterruptedWithZeroSends) {
      // ... existing UNCHANGED ...
    }
    ```

    **Step J — Comment update on misleading "discard turn" phrases:**

    Search for the strings "discard turn" / "discard message" / "Path A discard" in v4-production-runner.ts (grep `discard\|silente`). Update to "restart turn with combined effectiveMessage" or similar. This is per State of the Art table in RESEARCH.

    **Step K — TypeScript clean check:**

    `npx tsc --noEmit -p tsconfig.json` MUST report zero new errors in `v4-production-runner.ts`. If errors appear:
    - `'shouldRestart' is declared but never used` → ensure the `while` consumes it
    - `'effectiveMessage' is possibly null` → narrow with the `?? ` pattern in Step D
    - Unreachable code after `throw new Error('[V4-RUNNER] restart loop exited without return...')` → expected; TS may flag, add `// eslint-disable-next-line` if necessary

    **Step L — Regla 6 zero-diff verification (CRITICAL):**

    Before committing, run:
    ```bash
    git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/
    ```
    Output MUST be empty (no lines). If any of those paths show in the diff stat, REVERT those changes before committing this task.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "while (shouldRestart)" src/lib/agents/engine/v4-production-runner.ts && grep -c "restart_iteration:" src/lib/agents/engine/v4-production-runner.ts && grep -c "totalTokensAcrossRestarts" src/lib/agents/engine/v4-production-runner.ts && grep -c "effectiveMessage" src/lib/agents/engine/v4-production-runner.ts && grep -c "shouldRestart = true" src/lib/agents/engine/v4-production-runner.ts && grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')" src/lib/agents/engine/v4-production-runner.ts && grep -c "wasInterruptedWithZeroSends" src/lib/agents/engine/v4-production-runner.ts && grep -c "tokensUsed: output.totalTokens" src/lib/agents/engine/v4-production-runner.ts && git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ && npx tsc --noEmit -p tsconfig.json 2>&1 | grep "v4-production-runner.ts" | head -10</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "while (shouldRestart)" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "let shouldRestart = true" src/lib/agents/engine/v4-production-runner.ts` ≥ 1.
    - `grep -c "shouldRestart = true" src/lib/agents/engine/v4-production-runner.ts` ≥ 4 (CKPT-0 + agent-discriminator + CKPT-6a + CKPT-6b Path A — minimum 4 sites; CKPT-7.N excluded per D-05).
    - `grep -c "restart_iteration:" src/lib/agents/engine/v4-production-runner.ts` ≥ 8 (each of the 4 restart sites emits TWO events `msg_aborted_path_a_combined` + `pending_list_combined`, each with `restart_iteration` field — Pitfall 3).
    - `grep -c "totalTokensAcrossRestarts" src/lib/agents/engine/v4-production-runner.ts` ≥ 4 (declaration + 1 accumulator update + return sites — Pitfall 2).
    - `grep -c "tokensUsed: output.totalTokens" src/lib/agents/engine/v4-production-runner.ts` == 0 (every `tokensUsed:` return site now uses the accumulator — Pitfall 2).
    - `grep -c "effectiveMessage" src/lib/agents/engine/v4-production-runner.ts` ≥ 5 (declaration + `effectiveMessage ??` in Step D + 3 restart-site assignments).
    - `grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')" src/lib/agents/engine/v4-production-runner.ts` ≥ 1 (R-04 discriminator detector).
    - `grep -c "wasInterruptedWithZeroSends" src/lib/agents/engine/v4-production-runner.ts` ≥ 3 (declaration + assignment + check — Pitfall 5 preserved).
    - `grep -c "startHeartbeat(input.lockHandle)" src/lib/agents/engine/v4-production-runner.ts` == 1 AND that line is BEFORE the `while (shouldRestart)` line (verify by reading 5 lines context — Pitfall 6 no heartbeat stacking).
    - **Regla 6 zero-diff gate:** `git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/` produces ZERO lines of output (Pitfall 1).
    - **Sub-loop zero-touch gate:** `git diff --stat main -- src/lib/agents/somnio-v4/sub-loop/index.ts` produces ZERO lines of output (R-04).
    - **types.ts zero-touch gate:** `git diff --stat main -- src/lib/agents/somnio-v4/types.ts` produces ZERO lines of output.
    - `npx tsc --noEmit -p tsconfig.json` reports ZERO new errors attributable to `v4-production-runner.ts`.
  </acceptance_criteria>
  <done>Restart loop scaffolding in place; CKPT-0/6a/6b Path A continue-restart; agent-discriminator detector consumes `interrupted_at_ckpt_*`; token accumulator surfaces at every return; Pitfall 5 legacy block preserved; Regla 6 + sub-loop + types.ts zero-diff.</done>
  <atomic_commit>feat(v4-runner): outer restart loop for Path A interrupts (D-04 + R-01) — drains pending in-lambda instead of silent persist</atomic_commit>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for both modified files (no new errors).
2. **Regla 6 byte-identity gates (CRITICAL — Pitfall 1):**
   ```bash
   git diff --stat main -- src/lib/agents/engine/v3-production-runner.ts | wc -l            # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v3/ | wc -l                                # MUST be 0
   git diff --stat main -- src/lib/agents/godentist/ | wc -l                                # MUST be 0
   git diff --stat main -- src/lib/agents/godentist-fb-ig/ | wc -l                          # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-recompra/ | wc -l                          # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-pw-confirmation/ | wc -l                   # MUST be 0
   grep -rn "while.*shouldRestart\|restart_iteration\|interrupted_at_ckpt_" src/lib/agents/engine/v3-production-runner.ts src/lib/agents/somnio-v3/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-recompra/ src/lib/agents/somnio-pw-confirmation/ | wc -l  # MUST be 0
   ```
3. **Sub-loop + types.ts zero-touch (R-04):**
   ```bash
   git diff --stat main -- src/lib/agents/somnio-v4/sub-loop/index.ts | wc -l   # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v4/types.ts | wc -l            # MUST be 0
   ```
4. **No DB writes during restart iterations (Pitfall 8):**
   ```bash
   # Verify saveState(_v3:pendingUserMessage) calls happen ONLY in the wasInterruptedWithZeroSends legacy block
   grep -n "saveState.*_v3:pendingUserMessage\|'_v3:pendingUserMessage':" src/lib/agents/engine/v4-production-runner.ts
   # Expected: ≤ 1 site (the legacy wasInterruptedWithZeroSends block at ~line 623-640); the 3 old CKPT-0/6a/6b sites should be REMOVED.
   ```
5. **Heartbeat outside while (Pitfall 6):**
   ```bash
   # The startHeartbeat call must precede the while; visual inspection of 10-line context above it shows it's outside any loop.
   grep -B 2 -A 2 "startHeartbeat(input.lockHandle)" src/lib/agents/engine/v4-production-runner.ts
   ```
6. No Inngest `step.run` wrapping `processMessage` (Pitfall 9 — confirm baseline unchanged):
   ```bash
   grep -n "step.run" src/inngest/functions/agent-production.ts | grep -i "processMessage" | wc -l  # Expected: 0
   ```
7. Existing test suite still green (no regression to lock + checkpoints + observability + pending unit tests):
   ```bash
   npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -10  # exits 0
   ```
</verification>

<success_criteria>
- 2 files modified (v4-production-runner.ts + somnio-v4-agent.ts); sub-loop + types.ts byte-identical.
- Path A interrupt at CKPT-0/1/2/3/4/5/6a triggers `shouldRestart = true; continue` instead of return-with-saveState.
- Agent's `errorMessage: 'interrupted_at_ckpt_*'` discriminator (including sub-loop CKPT-3/4/5 via Pitfall 7 fix) is consumed by the runner to drain pending + restart.
- Tokens accumulate across iterations via `totalTokensAcrossRestarts`.
- Every restart-event payload includes `restart_iteration` for downstream observability disambiguation.
- Lock/heartbeat lifecycle untouched (outside while loop) — Pitfall 6 prevented.
- Regla 6 + sub-loop zero-touch gates all green.
- Legacy `wasInterruptedWithZeroSends` block preserved for CKPT-7.1 edge case (Pitfall 5).
</success_criteria>

<push_to_vercel>
After both atomic commits land on the branch, push to Vercel (Regla 1):
```bash
git push origin HEAD:main
```
(Or push the branch + open PR if working off a feature branch.)

The fix is v4-only and v4 is dormant in prod (D-06 + D-07 — zero traffic to v4 today), so a direct push is safe per Regla 6.
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-interrupt-reprocess/01-SUMMARY.md` documenting:
- Actual line numbers used for CKPT-0/6a/6b insertions and agent-discriminator detector (may differ from RESEARCH 2026-05-26 snapshot).
- Any TypeScript narrowing issues encountered (e.g., `effectiveMessage` null-narrowing, `lockCtx` non-null assertions) and how resolved.
- Confirmation that Regla 6 + sub-loop + types.ts zero-diff gates passed.
- Token accumulator sites count (should be ≥ 4 return-site references — list them).
- Cross-reference to Plan 02 (vitest scenarios S1..S5) which validates the runtime behavior of this scaffolding.
</output>
