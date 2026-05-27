---
phase: standalone-debounce-v2-sandbox-integration
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/somnio-v4/engine-v4.ts
autonomous: true
requirements:
  - D-04  # 8 checkpoints paridad total (CKPT-0 + CKPT-6 + CKPT-7.N synthetic added to engine; CKPT-1..5 fire by threading)
  - D-05  # Heartbeat startHeartbeat/stop in engine lifecycle
  - D-06  # Mirror restart-loop from V4ProductionRunner (3 Path A sites in sandbox engine; Path B preserved)
  - D-12  # Sin migración DB (acceptance: zero SQL files added)
  - D-13  # Sin feature flag (acceptance: engine behavior gated purely on lockHandle nullability)
  - D-15  # Out of scope — module interruption-system-v2/ untouched (acceptance: zero diff against module files)

must_haves:
  truths:
    - "src/lib/agents/somnio-v4/engine-v4.ts exports `V4EngineInput` interface with 5 NEW optional fields: `lockHandle?: LockHandle | null`, `lockChannel?: 'whatsapp' | 'facebook' | 'instagram' | null`, `lockIdentifier?: string | null`, `ownPendingEntryJson?: string | null`, `sandboxSessionId?: string`."
    - "All 5 NEW fields are OPTIONAL (preserve existing callers that do not pass them — Plan 02 will be the first caller in the sandbox route)."
    - "`SomnioV4Engine.processMessage` body is wrapped in an outer `while (shouldRestart) { shouldRestart = false; ... }` loop mirroring v4-production-runner.ts post-`debounce-v2-interrupt-reprocess` (R-01)."
    - "Lock acquire is NOT done inside the engine — it is the route handler's responsibility (Plan 02). The engine RECEIVES `lockHandle` as optional input. When null, all checkpoint sites + heartbeat + release are skip-guarded (sandbox keeps working for callers that do not opt-in)."
    - "Heartbeat lifecycle is OUTSIDE the while loop: `if (input.lockHandle) stopHeartbeat = startHeartbeat(input.lockHandle)` runs ONCE before the loop; `if (stopHeartbeat) stopHeartbeat()` runs ONCE in `finally` (D-05 + Pitfall 6 from parent — no heartbeat stacking across restart iterations)."
    - "3 Path A restart sites in the sandbox engine (CKPT-0, agent-discriminator, CKPT-6) — one fewer than V4ProductionRunner (which has 4: CKPT-0, agent-discriminator, CKPT-6a pending-templates pre-send, CKPT-6b main). The omitted CKPT-6a pre-send is N/A because the sandbox engine does not have a pending-templates branch (sandbox doesn't pre-send templates from prior turn). A code comment near CKPT-6 in `engine-v4.ts` MUST cross-reference `v4-production-runner.ts:464` (or the equivalent CKPT-6a anchor) explaining the omission."
    - "Chronological combine order: `effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\\n')` — priorMsg FIRST, pending entries APPENDED (verbatim mirror of commit `494d3bb4` 2026-05-27 chronological-fix on v4-production-runner)."
    - "CKPT-7.N synthetic loop inside the while body wraps the `output.messages[]` mapping: per index `i`, call `checkpoint('ckpt_7_pre_template', handle, ws, channel, identifier, { templateIndex: i, hasSentAnything: i > 0 })`. On interrupt: emit `i === 0 ? 'msg_aborted_path_a_combined' : 'msg_aborted_path_b_solo'`, BREAK (do NOT restart — D-05 from parent: CKPT-7.N is post-send, Path B preserved)."
    - "On LostLockError (any checkpoint returning `lostLock: true`): throw new LostLockError(ckptId). Outer catch emits `zombie_lambda_exit` + returns V4EngineOutput with `error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message }`, `success: false`, `messages: []`."
    - "Pitfall 5 (Standalone debounce-v2-sandbox-integration RESEARCH §Pitfall 5): when the engine returns successfully AND `input.sandboxSessionId` AND `input.lockHandle` are both present, the engine writes `redis.set('sandbox-result:{sandboxSessionId}', JSON.stringify(result), { ex: 60 })` BEFORE the `finally` block executes (the finally block then releases the lock). The grep order check is: `redis.set('sandbox-result:` appears in the source BEFORE the `} finally {` closing brace block — verifiable by `grep -n` line numbers."
    - "Outer-scope accumulators inside processMessage (declared BEFORE `try { while (shouldRestart) {`): `let totalTokensAcrossRestarts = 0`, `let restartIteration = 0`, `let effectiveMessage: string | null = null`, `let templatesSentCount = 0`, `const startMs = Date.now()`."
    - "Each iteration recomputes `turnEffectiveMessage = effectiveMessage ?? input.message` at the top of the body (R-03 — iter 1 sees original input.message; subsequent iters see the combined string set by the previous Path A continue)."
    - "After every `await processMessage(...)` call: `totalTokensAcrossRestarts += (output.totalTokens ?? 0)` (R-05 — single source of truth for cost accounting across restarts; Pitfall 2)."
    - "Final V4EngineOutput.debugTurn.tokens.tokensUsed uses `totalTokensAcrossRestarts` (NOT `output.totalTokens` from the last iteration alone). NOTE: pre-existing inner-catch fallback (non-LostLockError) preserves its existing tokensUsed shape; do not modify it during this plan."
    - "Every restart-emitted `msg_aborted_path_a_combined` and `pending_list_combined` payload includes `restart_iteration: restartIteration` field (Pitfall 3 from parent)."
    - "On normal completion (HOLDER finished and `lockHandle` present): the engine emits `lock_released_normal` with payload `{ holder_uuid: input.lockHandle.holderUuid, duration_ms: Date.now() - startMs, templates_sent: templatesSentCount }`. On Redis error during release: emit `redis_unavailable_fallback_failed` with `at_step: 'release_lock_in_finally'`."
    - "Lock channel constant: the engine NEVER uses the literal string `'sandbox'` as a LockChannel (D-02 AMENDED Option C — `channel='whatsapp'` is supplied by route.ts; engine accepts the union `'whatsapp' | 'facebook' | 'instagram'`). Verifiable: `grep -c \"channel: 'sandbox'\" src/lib/agents/somnio-v4/engine-v4.ts` returns 0."
    - "Regla 6: V4ProductionRunner is NOT touched (sibling production runner; D-15 explicit). Verifiable: `git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts` reports zero changes."
    - "Module interruption-system-v2 is NOT touched (D-15). Verifiable: `git diff --stat main -- src/lib/agents/interruption-system-v2/` reports zero changes."
    - "All 5 non-v4 sandbox engines (engine-v2.ts, engine-v3.ts, engine-recompra) are NOT touched by this plan. Verifiable: `git diff --stat main -- src/lib/agents/somnio-v2/ src/lib/agents/somnio-v3/engine-v3.ts src/lib/agents/somnio-recompra/` reports zero changes."
  artifacts:
    - path: "src/lib/agents/somnio-v4/engine-v4.ts"
      provides: "Extended V4EngineInput with 5 optional lock fields; restart-loop mirroring V4ProductionRunner; CKPT-0/6/7 synthetic dispatch; heartbeat lifecycle; sandbox-result Redis write before finally release"
      contains: "while (shouldRestart)"
  key_links:
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "src/lib/agents/interruption-system-v2/checkpoints.ts"
      via: "import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints' — invoked at CKPT-0, CKPT-6, CKPT-7.N synthetic sites"
      pattern: "checkpoint\\('ckpt_(0_post_acquire|6_pre_send_loop|7_pre_template)'"
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "src/lib/agents/interruption-system-v2/lock.ts"
      via: "import { startHeartbeat, releaseLockIfOwner, type LockHandle } from '@/lib/agents/interruption-system-v2/lock'"
      pattern: "startHeartbeat\\|releaseLockIfOwner"
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "src/lib/agents/interruption-system-v2/pending.ts"
      via: "import { readAndClearPending } from '@/lib/agents/interruption-system-v2/pending' — drained at each Path A site"
      pattern: "readAndClearPending"
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "src/lib/agents/interruption-system-v2/observability.ts"
      via: "import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability' — fires lock_released_normal, msg_aborted_path_a_combined, msg_aborted_path_b_solo, pending_list_combined, zombie_lambda_exit, redis_unavailable_fallback_failed"
      pattern: "emitLockEvent"
    - from: "src/lib/agents/somnio-v4/engine-v4.ts"
      to: "src/lib/agents/interruption-system-v2/redis-client.ts"
      via: "import { redis } from '@/lib/agents/interruption-system-v2/redis-client' — used to write sandbox-result:{id} key before finally"
      pattern: "sandbox-result:"
---

<objective>
Wave 1 — Extend `SomnioV4Engine.processMessage` with the lock lifecycle that mirrors `V4ProductionRunner.processMessage` (post-`debounce-v2-interrupt-reprocess` shipped 2026-05-26 + chronological-fix `494d3bb4` 2026-05-27). This is the load-bearing contract plan: defines the new `V4EngineInput` shape (5 optional fields) that Plan 02's route branch will satisfy, wraps the existing body in an outer `while (shouldRestart)` restart-loop, adds CKPT-0 + CKPT-6 + CKPT-7.N synthetic dispatch + heartbeat + Pitfall-5-safe sandbox-result write + LostLockError catch + finally release.

Purpose: bring sandbox v4 behavior to paridad with WhatsApp v4 production (D-04). The shipped agent + sub-loop already plumbed lockHandle through CKPT-1..5 (skip-guarded on null) — this plan plumbs the missing engine-level pieces. Restart-loop semantics mean a Path A interrupt at CKPT-0 (or via the sub-loop discriminator surfacing as `output.errorMessage`) drains the pending list, chronologically combines messages, and re-runs the turn in-band — exactly like production after the sibling standalone shipped. Path B (CKPT-7 post-send) preserves single-iteration return behavior.

Output: 1 file edited (`engine-v4.ts`), ~+120/-2 LOC delta. After this plan, the engine compiles cleanly with `lockHandle?` accepted; Plan 02 wires it into the route. No tests in this plan (Plan 04 does that).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@./.claude/rules/agent-scope.md
@./.claude/rules/code-changes.md
@.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md
@.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md
@.planning/standalone/debounce-v2-interrupt-reprocess/01-PLAN.md
@.planning/standalone/debounce-v2-interrupt-reprocess/01-SUMMARY.md

<interfaces>
<!-- Already-shipped primitives from parent standalone (UNCHANGED — D-15 forbids touching) -->

From `src/lib/agents/interruption-system-v2/lock.ts`:
```typescript
export type LockChannel = 'whatsapp' | 'facebook' | 'instagram'
export interface LockHandle { key: string; holderUuid: string; startedAt: string }
export async function releaseLockIfOwner(handle: LockHandle): Promise<boolean>
export function startHeartbeat(handle: LockHandle): () => void
```

From `src/lib/agents/interruption-system-v2/checkpoints.ts`:
```typescript
export type CheckpointId =
  | 'ckpt_0_post_acquire'
  | 'ckpt_1_post_comprehension'
  | 'ckpt_2_post_state_machine'
  | 'ckpt_3_post_tooling'
  | 'ckpt_4_post_generation'
  | 'ckpt_5_post_compliance'
  | 'ckpt_6_pre_send_loop'
  | 'ckpt_7_pre_template'

export async function checkpoint(
  ckptId: CheckpointId,
  handle: LockHandle,
  workspaceId: string,
  channel: LockChannel,
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
  channel: LockChannel,
  identifier: string,
): Promise<PendingEntry[]>
```

From `src/lib/agents/interruption-system-v2/observability.ts`:
```typescript
// 14-label union — payload is Record<string, unknown>. `restart_iteration: number` is allowed without union changes.
export function emitLockEvent(label: LockEventLabel, payload: Record<string, unknown>): void
```

From `src/lib/agents/interruption-system-v2/redis-client.ts`:
```typescript
// Lazy Proxy over @upstash/redis. Has .set(key, value, opts) + .get<T>(key) + .del(key) etc.
export const redis: import('@upstash/redis').Redis
```

From `src/lib/agents/engine-adapters/production/v4-messaging-adapter.ts`:
```typescript
export class LostLockError extends Error {
  constructor(public ckptId: string) { super(`Lost lock at ${ckptId}`) }
}
```

From `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (V4AgentInput — UNCHANGED; already accepts optional lock fields per parent standalone):
```typescript
// processMessage(input: V4AgentInput) — input already has optional lockHandle/lockChannel/lockIdentifier fields
// from parent standalone debounce-interruption-system-v2 Plan 05 (per HANDOFF). The agent + sub-loop
// internally skip-guard on null; we MUST thread these through the engine.
```

<!-- Current SomnioV4Engine.processMessage shape (208 LOC — read FULL file before editing): -->
<!-- Lines 29-50: V4EngineInput + V4EngineOutput type definitions -->
<!-- Lines 52-208: class SomnioV4Engine with processMessage() — single try/catch, single agent call, message mapping returning V4EngineOutput with debugTurn -->
<!-- Anchor: line 57 `const output = await processMessage({...})` — this is where the agent invocation happens; the new lock fields must be threaded into the V4AgentInput object. -->
<!-- Anchor: line 100 `return { success: output.success, messages: output.messages, newState, timerSignal: lastTimerSignal, debugTurn: {...} }` — the final return must change to use `finalMessages` (post CKPT-7.N filter) AND `totalTokensAcrossRestarts` for tokensUsed. -->
<!-- Anchor: line 176-206 outer catch block — extend to detect LostLockError specifically. -->
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1.1: Add 5 optional lock fields to V4EngineInput + import lock-module symbols + declare outer-scope accumulators in processMessage</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts FULL FILE (208 lines — read once; lock in current shape)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/lock.ts FULL FILE (read LockHandle, LockChannel, startHeartbeat, releaseLockIfOwner signatures)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/interruption-system-v2/checkpoints.ts (verify checkpoint() signature + CheckpointId union)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Pattern 2 (lines 320-444 of RESEARCH) + §Example 1 (lines 622-735)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/DISCUSSION-LOG.md D-02 (Option C — channel='whatsapp') + D-05 (heartbeat) + D-15 (no module touch)
  </read_first>
  <action>
    1. Open `src/lib/agents/somnio-v4/engine-v4.ts`.

    2. Add the following imports at the top (after the existing `import { processMessage } from './somnio-v4-agent'` line and the existing type imports — around line 32):

       ```typescript
       // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-05 + D-06 + D-15).
       // Wire shipped interruption-system-v2 primitives into the sandbox engine.
       // Module is IMPORTED ONLY — never modified (D-15).
       import { checkpoint, type CheckpointId } from '@/lib/agents/interruption-system-v2/checkpoints'
       import {
         releaseLockIfOwner,
         startHeartbeat,
         type LockHandle,
         type LockChannel,
       } from '@/lib/agents/interruption-system-v2/lock'
       import { readAndClearPending } from '@/lib/agents/interruption-system-v2/pending'
       import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
       import { redis } from '@/lib/agents/interruption-system-v2/redis-client'
       import { LostLockError } from '@/lib/agents/engine-adapters/production/v4-messaging-adapter'
       ```

    3. Modify the `V4EngineInput` interface (currently lines 34-41) to add 5 NEW OPTIONAL fields at the end (DO NOT change existing fields' order or shape — preserves callers that pass only the original 6 fields):

       ```typescript
       export interface V4EngineInput {
         message: string
         state: SandboxState
         history: { role: 'user' | 'assistant'; content: string }[]
         turnNumber: number
         workspaceId: string
         systemEvent?: SystemEvent
         // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-15).
         // All 5 fields OPTIONAL — pre-this-standalone callers (existing tests, dev workflows
         // that bypass the sandbox lock branch) continue to work without modification.
         // When null/undefined, the engine skip-guards every checkpoint + heartbeat + release
         // (sandbox keeps the same behavior as before this standalone).
         // Plan 02 (sandbox/process/route.ts v4 branch) is the FIRST caller that populates these.
         lockHandle?: LockHandle | null
         lockChannel?: LockChannel | null  // 'whatsapp' | 'facebook' | 'instagram' — sandbox uses 'whatsapp' per D-02 Option C
         lockIdentifier?: string | null   // sandbox uses `sandbox-{sandboxSessionId}` per D-02 Option C
         ownPendingEntryJson?: string | null
         sandboxSessionId?: string         // for Pitfall 5 sandbox-result:{id} write before finally release
       }
       ```

    4. Inside `SomnioV4Engine.processMessage` (currently line 53-207), add outer-scope accumulators IMMEDIATELY AFTER the existing `const timestamp = new Date().toISOString()` line (line 54) and BEFORE the existing `try {` (line 56):

       ```typescript
       // ============================================================
       // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-05 + D-06).
       // Outer-scope state for restart-loop semantics (mirror V4ProductionRunner
       // post-`debounce-v2-interrupt-reprocess` shipped 2026-05-26 + chronological-fix
       // commit 494d3bb4 on 2026-05-27).
       // These persist ACROSS restart-loop iterations within a single processMessage
       // invocation; reset to zero at the top of each new processMessage call.
       // ============================================================
       const startMs = Date.now()
       const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
         ? { channel: input.lockChannel as LockChannel, identifier: input.lockIdentifier as string }
         : null
       let stopHeartbeat: (() => void) | null = null
       if (input.lockHandle) {
         // D-05: heartbeat lifecycle OUTSIDE the while loop (Pitfall 6 — no heartbeat stacking).
         stopHeartbeat = startHeartbeat(input.lockHandle)
       }
       let totalTokensAcrossRestarts = 0
       let restartIteration = 0
       let effectiveMessage: string | null = null
       let templatesSentCount = 0
       ```

    5. Convert the existing `try { ... } catch (error) { ... }` block (lines 56-206) into a `try { try { /* body */ } catch (error) { /* inner catch */ } } finally { /* release */ }` structure. The OUTER try/finally wraps the INNER try/catch (which preserves the existing error-handling for non-lock errors). Add the finally block at the END of the method body:

       ```typescript
       // Replace the existing closing `}` of the catch block on ~line 206 with:
       } finally {
         // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-05 + Pitfall 6).
         // Lock + heartbeat lifecycle ALWAYS released exactly once per processMessage,
         // regardless of which iteration of the restart loop returned/threw.
         if (stopHeartbeat) stopHeartbeat()
         if (input.lockHandle) {
           try {
             const released = await releaseLockIfOwner(input.lockHandle)
             if (released) {
               emitLockEvent('lock_released_normal', {
                 holder_uuid: input.lockHandle.holderUuid,
                 duration_ms: Date.now() - startMs,
                 templates_sent: templatesSentCount,
               })
             }
           } catch (releaseError) {
             emitLockEvent('redis_unavailable_fallback_failed', {
               error_message: releaseError instanceof Error ? releaseError.message : String(releaseError),
               at_step: 'release_lock_in_finally',
             })
           }
         }
       }
       ```

       IMPORTANT: ensure the existing inner catch block (currently lines 176-206 — `catch (error) { console.error(...); return { success: true, messages: [`[Error v4] ${errorMsg}`], ... }`) STAYS as the INNER catch. The new outer finally is ADDITIONAL (an outer try with no catch — only finally). DO NOT delete the existing error-fallback shape; it remains the contract for non-lock errors. The existing inner-catch's `tokensUsed` shape is preserved verbatim — do not retrofit it to use `totalTokensAcrossRestarts` (that accumulator is for the success-path return only; the inner catch is the legacy non-LostLockError fallback and keeps its existing structure).

       The structural shape after this step is:
       ```typescript
       async processMessage(input: V4EngineInput): Promise<V4EngineOutput> {
         const timestamp = new Date().toISOString()
         // ... outer-scope accumulators (from step 4) ...
         try {                              // <-- NEW outer try
           try {                            // <-- existing inner try (unchanged for now; Task 1.2 changes its body)
             // ... existing body ...
             return { ... }
           } catch (error) {                // <-- existing inner catch (unchanged for now; Task 1.2 adds LostLockError branch)
             // ... existing error fallback ...
             return { ... }
           }
         } finally {                        // <-- NEW outer finally (heartbeat + release)
           // ... (block from step 5) ...
         }
       }
       ```

    6. **Do NOT add the while-loop or checkpoint dispatch in this task.** Task 1.2 does that. This task's deliverable is: types + imports + outer-scope state + outer try/finally scaffolding. The engine should still compile and behave byte-identically to before for callers that do not pass any lock fields (`input.lockHandle === undefined` → `lockCtx === null`, `stopHeartbeat === null`, all engine code unchanged except the never-fired finally release).

    7. **Sanity check before finishing this task:**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "engine-v4\.ts" | head -10
       ```
       MUST report zero new errors attributable to `engine-v4.ts`.

    8. **Regla 6 zero-diff check (CRITICAL):**
       ```bash
       cd /mnt/c/Users/Usuario/Proyectos/morfx-new
       git diff --stat main -- \
         src/lib/agents/engine/v4-production-runner.ts \
         src/lib/agents/interruption-system-v2/ \
         src/lib/agents/somnio-v2/ \
         src/lib/agents/somnio-v3/engine-v3.ts \
         src/lib/agents/somnio-recompra/ \
         src/lib/agents/godentist/ \
         src/lib/agents/godentist-fb-ig/ \
         src/lib/agents/somnio-pw-confirmation/
       ```
       Output MUST be empty (zero lines).
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "lockHandle?: LockHandle | null" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "lockChannel?: LockChannel | null" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "sandboxSessionId?: string" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "totalTokensAcrossRestarts" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "startHeartbeat(input.lockHandle)" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "from '@/lib/agents/interruption-system-v2/" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "LostLockError" src/lib/agents/somnio-v4/engine-v4.ts && (git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts src/lib/agents/interruption-system-v2/ src/lib/agents/somnio-v2/ src/lib/agents/somnio-v3/engine-v3.ts src/lib/agents/somnio-recompra/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-pw-confirmation/ | wc -l) && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "engine-v4\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "lockHandle?: LockHandle | null" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "lockChannel?: LockChannel | null" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "lockIdentifier?: string | null" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "ownPendingEntryJson?: string | null" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "sandboxSessionId?: string" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "from '@/lib/agents/interruption-system-v2/" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 4 (lock + checkpoints + pending + observability + redis-client — minimum 5; allowing 4 in case redis-client is imported only in Task 1.2; verify ≥ 4).
    - `grep -c "LostLockError" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (import exists).
    - `grep -c "startHeartbeat(input.lockHandle)" src/lib/agents/somnio-v4/engine-v4.ts` == 1 (ONLY ONE site — Pitfall 6).
    - `grep -c "totalTokensAcrossRestarts" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (declaration present; Task 1.2 adds usages).
    - `grep -c "} finally {" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (new outer finally block).
    - `grep -c "lock_released_normal" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "channel: 'sandbox'" src/lib/agents/somnio-v4/engine-v4.ts` == 0 (D-02 AMENDED Option C — NO literal 'sandbox' channel).
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "engine-v4\.ts"` reports ZERO new errors.
    - `git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts src/lib/agents/interruption-system-v2/ src/lib/agents/somnio-v2/ src/lib/agents/somnio-v3/engine-v3.ts src/lib/agents/somnio-recompra/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-pw-confirmation/ | wc -l` returns 0 (D-15 + Regla 6 zero-diff gate).
  </acceptance_criteria>
  <done>V4EngineInput accepts 5 optional lock fields; module imports present; outer-scope state + heartbeat lifecycle + outer finally block in place. Engine compiles. No other files touched.</done>
  <atomic_commit>feat(somnio-v4-engine): add lock-field types + heartbeat lifecycle scaffolding (D-04 + D-05)</atomic_commit>
</task>

<task type="auto" tdd="false">
  <name>Task 1.2: Wrap processMessage body with while(shouldRestart); add CKPT-0 + CKPT-6 + CKPT-7.N synthetic + agent-discriminator detector + sandbox-result write + LostLockError catch</name>
  <read_first>
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/somnio-v4/engine-v4.ts FULL FILE (post-Task-1.1 state — re-read to lock in new line numbers after the imports + accumulators were added)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/engine/v4-production-runner.ts FULL FILE (854+ LOC — the mirror source; specifically lines around `while (shouldRestart)` declaration, CKPT-0 site, CKPT-6 sites — note `v4-production-runner.ts:464` is the CKPT-6a pending-templates pre-send anchor that the sandbox engine OMITS, the agent-discriminator detector, the totalTokensAcrossRestarts accumulator, and the wasInterruptedWithZeroSends block)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-interrupt-reprocess/01-PLAN.md (sibling — same restart-loop pattern already implemented; lock semantics identical)
    - /mnt/c/Users/Usuario/Proyectos/morfx-new/.planning/standalone/debounce-v2-sandbox-integration/RESEARCH.md §Pattern 2 + §Example 1 (lines 320-735) + §Pitfall 5 (lines 582-600)
  </read_first>
  <action>
    **Re-verify anchors before editing** (post-Task-1.1; line numbers shifted):
    ```bash
    cd /mnt/c/Users/Usuario/Proyectos/morfx-new
    grep -n "try {" src/lib/agents/somnio-v4/engine-v4.ts | head -5
    grep -n "const output = await processMessage(" src/lib/agents/somnio-v4/engine-v4.ts
    grep -n "return {" src/lib/agents/somnio-v4/engine-v4.ts
    grep -n "} catch (error) {" src/lib/agents/somnio-v4/engine-v4.ts
    grep -n "} finally {" src/lib/agents/somnio-v4/engine-v4.ts
    ```

    ---

    **Step A — Wrap inner try body with while(shouldRestart):**

    Inside the INNER try block (the one wrapping the agent call), the structure becomes:

    ```typescript
    try {                          // <-- existing outer try (from Task 1.1)
      try {                        // <-- existing inner try
        // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-06 + R-01).
        // Restart-loop mirrors V4ProductionRunner post-debounce-v2-interrupt-reprocess
        // (shipped 2026-05-26) + chronological-fix commit 494d3bb4 (2026-05-27).
        //
        // Path A restart sites in this sandbox engine: 3 total (CKPT-0, agent-discriminator,
        // CKPT-6). V4ProductionRunner has 4 (it additionally has a CKPT-6a pending-templates
        // pre-send branch at v4-production-runner.ts:464 — N/A in sandbox because sandbox
        // does not pre-send templates from a prior turn). CKPT-7.N (post-send) does NOT
        // restart in either runner (D-05 from parent: Path B only after first send).
        let shouldRestart = true
        let lastV4Result: V4EngineOutput | null = null
        while (shouldRestart) {
          shouldRestart = false

          // === iteration body (Steps B..H) ===
          // Each iteration must EITHER set shouldRestart=true and `continue`,
          // OR set lastV4Result = {...} and `break` (or fall through to the
          // while-loop exit; lastV4Result is the canonical return value).

          // ... see Steps B, C, D, E, F, G, H below ...

        }  // end while (shouldRestart)

        // After the while loop: lastV4Result is the canonical return value.
        // Pitfall 5: write sandbox-result:{id} to Redis BEFORE finally releases the lock.
        if (input.sandboxSessionId && input.lockHandle && lastV4Result) {
          try {
            await redis.set(
              `sandbox-result:${input.sandboxSessionId}`,
              JSON.stringify(lastV4Result),
              { ex: 60 },
            )
          } catch (resultWriteErr) {
            // Non-fatal — log only; finally still releases lock; FOLLOWER will time out long-poll.
            console.error('[SomnioV4Engine] sandbox-result write failed', resultWriteErr)
          }
        }

        if (!lastV4Result) {
          throw new Error('[SomnioV4Engine] restart loop exited without lastV4Result — invariant violation')
        }
        return lastV4Result
      } catch (error) {
        // Existing inner catch — UNCHANGED for non-lock errors.
        // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 LostLockError path).
        // Detect LostLockError before falling through to the existing fallback.
        if (error instanceof LostLockError) {
          emitLockEvent('zombie_lambda_exit', {
            my_uuid: input.lockHandle?.holderUuid ?? 'unknown',
            current_holder_uuid: 'unknown',
            at_step: error.ckptId,
          })
          // Still write sandbox-result so FOLLOWER long-poll does not hang.
          if (input.sandboxSessionId && input.lockHandle) {
            try {
              const zombieResult: V4EngineOutput = {
                success: false,
                messages: [],
                newState: input.state,
                debugTurn: {
                  turnNumber: input.turnNumber,
                  intent: {
                    intent: 'error',
                    confidence: 0,
                    reasoning: `LOST_LOCK at ${error.ckptId}`,
                    timestamp,
                  },
                  tools: [],
                  tokens: {
                    turnNumber: input.turnNumber,
                    tokensUsed: totalTokensAcrossRestarts,
                    models: [],
                    timestamp,
                  },
                  stateAfter: input.state,
                },
                error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message },
              }
              await redis.set(
                `sandbox-result:${input.sandboxSessionId}`,
                JSON.stringify(zombieResult),
                { ex: 60 },
              )
              return zombieResult
            } catch (resultWriteErr) {
              console.error('[SomnioV4Engine] sandbox-result zombie write failed', resultWriteErr)
            }
          }
          return {
            success: false,
            messages: [],
            newState: input.state,
            debugTurn: {
              turnNumber: input.turnNumber,
              intent: { intent: 'error', confidence: 0, reasoning: `LOST_LOCK at ${error.ckptId}`, timestamp },
              tools: [],
              tokens: { turnNumber: input.turnNumber, tokensUsed: totalTokensAcrossRestarts, models: [], timestamp },
              stateAfter: input.state,
            },
            error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message },
          }
        }
        // EXISTING fallback for non-lock errors — UNCHANGED (the `console.error + return { success: true, messages: [Error v4 ...], ... }` block from before this standalone).
        // (Existing body of inner catch preserved here. Pre-existing inner-catch fallback (non-LostLockError)
        // preserves its existing tokensUsed shape; do NOT modify it during this plan — the
        // totalTokensAcrossRestarts accumulator is for the success-path return only.)
      }
    } finally {
      // (heartbeat stop + lock release from Task 1.1 — unchanged)
    }
    ```

    **Step B — Move the existing body INTO the while iteration:**

    Cut the existing inner-try body (currently: `const output = await processMessage({...}); const newState: SandboxState = {...}; delete newState.datosCapturados[...]; const lastTimerSignal = ...; return { success: output.success, messages: output.messages, newState, ... debugTurn: {...} };`) and paste it INSIDE the `while (shouldRestart)` block. Change the `return { ... }` at the bottom of the body to `lastV4Result = { ... }; break;` (or to `return ...` only AFTER the while if applying CKPT-7.N filtering — see Step F).

    Cleaner shape after Step B:

    ```typescript
    while (shouldRestart) {
      shouldRestart = false
      const turnEffectiveMessage = effectiveMessage ?? input.message

      // Step C: CKPT-0 post-acquire (NEW)
      // ... (see Step C)

      // Existing agent call (with turnEffectiveMessage instead of input.message):
      const output = await processMessage({
        message: turnEffectiveMessage,   // <-- CHANGE: was input.message
        currentMode: input.state.currentMode,
        intentsVistos: input.state.intentsVistos ?? [],
        templatesEnviados: input.state.templatesEnviados ?? [],
        datosCapturados: input.state.datosCapturados ?? {},
        packSeleccionado: input.state.packSeleccionado ?? null,
        accionesEjecutadas: input.state.accionesEjecutadas ?? [],
        history: input.history,
        turnNumber: input.turnNumber,
        workspaceId: input.workspaceId,
        systemEvent: input.systemEvent,
        // NEW (thread lock fields through to the agent — agent + sub-loop already skip-guard on null):
        lockHandle: input.lockHandle ?? null,
        lockChannel: input.lockChannel ?? null,
        lockIdentifier: input.lockIdentifier ?? null,
      })

      // Step D: token accumulator
      totalTokensAcrossRestarts += (output.totalTokens ?? 0)

      // Step E: agent-discriminator detector (NEW)
      // ... (see Step E)

      // Step F: CKPT-6 pre-send-loop (NEW)
      // ... (see Step F)

      // Step G: CKPT-7.N synthetic per-template filter (NEW)
      // ... (see Step G)

      // Step H: build lastV4Result + break out of while loop
      // ... (see Step H — build V4EngineOutput from output + finalMessages)
    }
    ```

    **Step C — CKPT-0 post-acquire (immediately after `while (shouldRestart) {` declaration of `turnEffectiveMessage`):**

    ```typescript
    if (input.lockHandle && lockCtx) {
      const ck0 = await checkpoint(
        'ckpt_0_post_acquire',
        input.lockHandle,
        input.workspaceId,
        lockCtx.channel,
        lockCtx.identifier,
      )
      if (ck0.lostLock) throw new LostLockError('ckpt_0_post_acquire')
      if (!ck0.proceed && ck0.interrupted) {
        const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
        restartIteration++
        emitLockEvent('msg_aborted_path_a_combined', {
          at_step: 'ckpt_0_post_acquire',
          combined_msg_count: pending.length + 1,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
          restart_iteration: restartIteration,
        })
        emitLockEvent('pending_list_combined', {
          at_step: 'ckpt_0_post_acquire',
          entries_count: pending.length,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0),
          restart_iteration: restartIteration,
        })
        // Chronological order (commit 494d3bb4): priorMsg FIRST, pending APPENDED.
        effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
        shouldRestart = true
        continue
      }
    }
    ```

    **Step E — Agent-discriminator detector (immediately after `totalTokensAcrossRestarts += (output.totalTokens ?? 0)`):**

    ```typescript
    if (
      output.success === false &&
      typeof output.errorMessage === 'string' &&
      output.errorMessage.startsWith('interrupted_at_ckpt_')
    ) {
      if (!lockCtx) {
        throw new Error(`[SomnioV4Engine] agent emitted ${output.errorMessage} but lockCtx is null`)
      }
      const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
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
      effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
      shouldRestart = true
      continue
    }
    ```

    **Step F — CKPT-6 pre-send-loop (immediately after the discriminator detector, BEFORE the CKPT-7.N synthetic loop):**

    ```typescript
    if (input.lockHandle && lockCtx) {
      const ck6 = await checkpoint(
        'ckpt_6_pre_send_loop',
        input.lockHandle,
        input.workspaceId,
        lockCtx.channel,
        lockCtx.identifier,
        { hasSentAnything: false },
      )
      if (ck6.lostLock) throw new LostLockError('ckpt_6_pre_send_loop')
      if (!ck6.proceed && ck6.interrupted) {
        // In sandbox, CKPT-6b sentCount is always 0 (we haven't run the CKPT-7.N synthetic
        // loop yet at this point). Always Path A → restart.
        // Note: V4ProductionRunner has a CKPT-6a pending-templates pre-send branch (at
        // v4-production-runner.ts:464) that we do NOT mirror here — sandbox has no
        // pending-templates pre-send. See top-of-while comment block for the full rationale.
        const pending = await readAndClearPending(input.workspaceId, lockCtx.channel, lockCtx.identifier)
        restartIteration++
        emitLockEvent('msg_aborted_path_a_combined', {
          at_step: 'ckpt_6_pre_send_loop',
          templates_sent_before_abort: 0,
          combined_msg_count: pending.length + 1,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0) + turnEffectiveMessage.length,
          restart_iteration: restartIteration,
        })
        emitLockEvent('pending_list_combined', {
          at_step: 'ckpt_6_pre_send_loop',
          entries_count: pending.length,
          total_chars: pending.reduce((s, p) => s + p.content.length, 0),
          restart_iteration: restartIteration,
        })
        effectiveMessage = [turnEffectiveMessage, ...pending.map(p => p.content)].join('\n')
        shouldRestart = true
        continue
      }
    }
    ```

    **Step G — CKPT-7.N synthetic per-template filter (immediately after CKPT-6 block):**

    ```typescript
    // Standalone: debounce-v2-sandbox-integration / Plan 01 (D-04 + D-05).
    // Sandbox does not call MessagingProductionAdapter.send — the route returns output.messages
    // directly to the client UI. To preserve paridad with WhatsApp's CKPT-7.N (which fires per
    // template in V4MessagingAdapter.shouldAbortBeforeTemplate), we synthesize the per-message
    // abort gate here. NO restart on interrupt at CKPT-7.N (D-05 from parent: post-send is Path B).
    const finalMessages: string[] = []
    for (let i = 0; i < output.messages.length; i++) {
      if (input.lockHandle && lockCtx) {
        const ck7 = await checkpoint(
          'ckpt_7_pre_template',
          input.lockHandle,
          input.workspaceId,
          lockCtx.channel,
          lockCtx.identifier,
          { templateIndex: i, hasSentAnything: i > 0 },
        )
        if (ck7.lostLock) throw new LostLockError(`ckpt_7_pre_template_${i}`)
        if (!ck7.proceed && ck7.interrupted) {
          const eventLabel = i === 0 ? 'msg_aborted_path_a_combined' : 'msg_aborted_path_b_solo'
          emitLockEvent(eventLabel, {
            at_step: `ckpt_7_pre_template_${i}`,
            templates_sent_before_abort: i,
          })
          break  // D-05: NO restart on CKPT-7.N
        }
      }
      finalMessages.push(output.messages[i])
    }
    templatesSentCount = finalMessages.length
    ```

    **Step H — Build lastV4Result + break (replace the existing `return { ... }` at the bottom of the body):**

    Use `finalMessages` (from Step G) for `messages`, and `totalTokensAcrossRestarts` for `tokensUsed`. All other fields are mapped from the existing `output` / `newState` / `debugTurn` shape that the file already builds:

    ```typescript
    // ... (existing newState mapping from output.newMode + output.intentsVistos + etc.)
    // ... (existing delete newState.datosCapturados['_v3:accionesEjecutadas'] etc.)
    // ... (existing lastTimerSignal pick from output.timerSignals)

    lastV4Result = {
      success: output.success,
      messages: finalMessages,                   // <-- post-CKPT-7.N filter
      newState,
      timerSignal: lastTimerSignal,
      debugTurn: {
        turnNumber: input.turnNumber,
        intent: /* existing intent mapping */,
        tools: [],
        tokens: {
          turnNumber: input.turnNumber,
          tokensUsed: totalTokensAcrossRestarts,  // <-- accumulator, NOT output.totalTokens
          models: [{
            model: 'gemini-2.5-flash' as const,
            inputTokens: Math.round(totalTokensAcrossRestarts * 0.7),
            outputTokens: Math.round(totalTokensAcrossRestarts * 0.3),
          }],
          timestamp,
        },
        stateAfter: newState,
        classification: /* existing */,
        orchestration: /* existing */,
        salesTrack: /* existing */,
        responseTrack: /* existing */,
        subLoopReason: output.subLoopReason ?? undefined,
        threshold: output.threshold,
        subLoopDebug: output.subLoopDebug,
        timerSignals: output.timerSignals.map(s => ({ type: s.type, level: s.level, reason: s.reason })),
      },
    }
    break  // exit while loop (we have a result)
    ```

    The Pitfall-5 sandbox-result write block (already added in Step A's structural overview) sits AFTER the `while`, BEFORE the `return lastV4Result`.

    **Step I — TypeScript clean check:**

    ```bash
    cd /mnt/c/Users/Usuario/Proyectos/morfx-new
    npx tsc --noEmit -p tsconfig.json 2>&1 | grep "engine-v4\.ts" | head -10
    ```
    MUST report zero new errors. If `'lastV4Result' is possibly null` — that's the safety throw at the bottom of the inner try; verify the throw exists.

    **Step J — Regla 6 zero-diff check (CRITICAL):**

    ```bash
    cd /mnt/c/Users/Usuario/Proyectos/morfx-new
    git diff --stat main -- \
      src/lib/agents/engine/v4-production-runner.ts \
      src/lib/agents/interruption-system-v2/ \
      src/lib/agents/somnio-v2/ \
      src/lib/agents/somnio-v3/engine-v3.ts \
      src/lib/agents/somnio-recompra/ \
      src/lib/agents/godentist/ \
      src/lib/agents/godentist-fb-ig/ \
      src/lib/agents/somnio-pw-confirmation/
    ```
    Output MUST be empty (zero lines). If any of those paths show, REVERT before committing.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && grep -c "while (shouldRestart)" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "let shouldRestart = true" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "shouldRestart = true" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "restart_iteration:" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "totalTokensAcrossRestarts" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "checkpoint('ckpt_0_post_acquire'" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "checkpoint('ckpt_6_pre_send_loop'" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "checkpoint('ckpt_7_pre_template'" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "sandbox-result:" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "zombie_lambda_exit" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "msg_aborted_path_a_combined" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "msg_aborted_path_b_solo" src/lib/agents/somnio-v4/engine-v4.ts && grep -c "channel: 'sandbox'" src/lib/agents/somnio-v4/engine-v4.ts && (git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts src/lib/agents/interruption-system-v2/ src/lib/agents/somnio-v2/ src/lib/agents/somnio-v3/engine-v3.ts src/lib/agents/somnio-recompra/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-pw-confirmation/ | wc -l) && (npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "engine-v4\.ts")</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "while (shouldRestart)" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - `grep -c "let shouldRestart = true" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - **3 Path A restart sites in sandbox engine (one fewer than V4ProductionRunner):** `grep -c "shouldRestart = true" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 3 (CKPT-0 + agent-discriminator + CKPT-6; CKPT-7.N excluded per D-05; CKPT-6a omitted because sandbox has no pending-templates pre-send branch).
    - **Cross-reference comment to V4ProductionRunner CKPT-6a anchor exists:** `grep -cE "v4-production-runner\.ts:464|N/A in sandbox|pending-templates pre-send" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (forces the explanatory comment to exist; future maintainers can locate the omitted-anchor rationale).
    - `grep -c "restart_iteration:" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 6 (each of 3 restart sites emits TWO events `msg_aborted_path_a_combined` + `pending_list_combined`, each with `restart_iteration` — Pitfall 3).
    - `grep -c "checkpoint('ckpt_0_post_acquire'" src/lib/agents/somnio-v4/engine-v4.ts` == 1.
    - `grep -c "checkpoint('ckpt_6_pre_send_loop'" src/lib/agents/somnio-v4/engine-v4.ts` == 1.
    - `grep -c "checkpoint('ckpt_7_pre_template'" src/lib/agents/somnio-v4/engine-v4.ts` == 1.
    - `grep -c "output.errorMessage.startsWith('interrupted_at_ckpt_')" src/lib/agents/somnio-v4/engine-v4.ts` == 1 (agent-discriminator detector, R-04).
    - `grep -c "sandbox-result:" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 2 (write on happy path + write on LostLockError path — Pitfall 5).
    - **Pitfall 5 order check:** `grep -n "redis.set" src/lib/agents/somnio-v4/engine-v4.ts | head -1 | cut -d: -f1` produces a line number LESS THAN `grep -n "} finally {" src/lib/agents/somnio-v4/engine-v4.ts | tail -1 | cut -d: -f1` (the sandbox-result write appears BEFORE the outer finally that releases the lock).
    - `grep -c "zombie_lambda_exit" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (LostLockError emits this).
    - `grep -c "msg_aborted_path_a_combined" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 3 (CKPT-0 + discriminator + CKPT-6; plus possibly CKPT-7.N first-template Path A — so ≥ 3 minimum, ≤ 4).
    - `grep -c "msg_aborted_path_b_solo" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (CKPT-7.N for i > 0).
    - `grep -c "templatesSentCount = finalMessages.length" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1.
    - **Accumulator used for success-path return:** `grep -c "tokensUsed: totalTokensAcrossRestarts" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 1 (verifies the accumulator is used at least once for the success-path return).
    - **No regression on non-accumulator success path:** `grep -E "tokensUsed: output\.totalTokens" src/lib/agents/somnio-v4/engine-v4.ts | wc -l` == 0 (escaped period prevents regex false-match; every tokensUsed return site for the SUCCESS path now uses the accumulator — Pitfall 2). NOTE: the pre-existing inner-catch fallback (non-LostLockError) preserves its existing tokensUsed shape; do not modify it during this plan — this grep targets the success-path returns only because output.totalTokens does not appear there post-fix.
    - `grep -c "channel: 'sandbox'" src/lib/agents/somnio-v4/engine-v4.ts` == 0 (D-02 AMENDED Option C — NO literal 'sandbox' channel anywhere in file).
    - `grep -c "[turnEffectiveMessage, ...pending.map" src/lib/agents/somnio-v4/engine-v4.ts` ≥ 3 (chronological combine order — Pitfall referenced in commit 494d3bb4: priorMsg FIRST).
    - `grep -c "startHeartbeat(input.lockHandle)" src/lib/agents/somnio-v4/engine-v4.ts` == 1 AND that line is BEFORE the `while (shouldRestart)` line (Pitfall 6 no heartbeat stacking — verify with `grep -n` line numbers).
    - **Regla 6 zero-diff gate:** `git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts src/lib/agents/interruption-system-v2/ src/lib/agents/somnio-v2/ src/lib/agents/somnio-v3/engine-v3.ts src/lib/agents/somnio-recompra/ src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ src/lib/agents/somnio-pw-confirmation/ | wc -l` returns 0.
    - **D-15 module-untouched gate:** `git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l` returns 0.
    - `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "engine-v4\.ts"` reports ZERO new errors.
  </acceptance_criteria>
  <done>SomnioV4Engine.processMessage has restart-loop semantics mirroring V4ProductionRunner; CKPT-0/6/7 dispatch; agent-discriminator detection; Pitfall 5 sandbox-result write; LostLockError caught; Regla 6 + D-15 gates green.</done>
  <atomic_commit>feat(somnio-v4-engine): restart-loop + 8 checkpoints + sandbox-result write (D-04 + D-06 + Pitfall 5)</atomic_commit>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p tsconfig.json` clean for `engine-v4.ts` (no new errors).
2. **Regla 6 byte-identity gates (CRITICAL — D-15):**
   ```bash
   git diff --stat main -- src/lib/agents/engine/v4-production-runner.ts | wc -l         # MUST be 0
   git diff --stat main -- src/lib/agents/interruption-system-v2/ | wc -l                # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v2/ | wc -l                             # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-v3/engine-v3.ts | wc -l                 # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-recompra/ | wc -l                       # MUST be 0
   git diff --stat main -- src/lib/agents/godentist/ src/lib/agents/godentist-fb-ig/ | wc -l  # MUST be 0
   git diff --stat main -- src/lib/agents/somnio-pw-confirmation/ | wc -l                # MUST be 0
   ```
3. **Heartbeat outside while (Pitfall 6):**
   ```bash
   # Visual inspection: startHeartbeat invocation precedes the while loop, single occurrence.
   grep -n "startHeartbeat(input.lockHandle)\|while (shouldRestart)" src/lib/agents/somnio-v4/engine-v4.ts
   # Expected: line N (startHeartbeat) < line M (while)
   ```
4. **Pitfall 5 ordering (sandbox-result write before finally):**
   ```bash
   # The first `await redis.set('sandbox-result:` line must appear before the outermost `} finally {`.
   grep -n "redis.set\|} finally {" src/lib/agents/somnio-v4/engine-v4.ts
   ```
5. **D-02 Option C compliance:**
   ```bash
   grep -c "channel: 'sandbox'\|LockChannel = 'sandbox'\|'sandbox' as LockChannel" src/lib/agents/somnio-v4/engine-v4.ts  # MUST be 0
   ```
6. **Existing test suite still green (no regression to interruption-system-v2 unit tests):**
   ```bash
   npx vitest run src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -10  # exits 0, 6 suites green
   ```
7. **No new SQL migration files (D-12):**
   ```bash
   git diff --stat main -- supabase/migrations/ | wc -l  # MUST be 0 (D-12)
   ```
</verification>

<success_criteria>
- 1 file edited (`src/lib/agents/somnio-v4/engine-v4.ts`).
- V4EngineInput accepts 5 optional lock fields; pre-this-standalone callers continue to work (lockHandle === undefined → engine behaves as before).
- Restart loop wraps the body; Path A interrupts at CKPT-0 / sub-loop discriminator / CKPT-6 drain pending + chronologically combine + continue (3 sites in sandbox engine; CKPT-6a omitted vs production — cross-referenced in code comment).
- CKPT-7.N synthetic per-template filter preserves Path B (no restart after a template is sent).
- LostLockError caught; emits `zombie_lambda_exit`; writes zombie sandbox-result so FOLLOWER long-poll does not hang.
- Heartbeat lifecycle outside the while loop (Pitfall 6).
- Sandbox-result Redis write happens BEFORE finally releases the lock (Pitfall 5).
- Regla 6 + D-15 + D-12 + D-13 all green.
</success_criteria>

<push_to_vercel>
After both atomic commits land, push (Regla 1):
```bash
git push origin HEAD:main
```
The change is v4-engine-only; v4 is DORMANT in prod (0 workspaces flipped) and the engine's new fields are all OPTIONAL — pre-this-standalone callers (none exist in prod for sandbox engine; production uses V4ProductionRunner) continue to work. Plan 02 wires the actual sandbox route. Safe to push.
</push_to_vercel>

<output>
After completion, create `.planning/standalone/debounce-v2-sandbox-integration/01-SUMMARY.md` documenting:
- Actual line numbers used for: `while (shouldRestart)` placement; CKPT-0/CKPT-6/CKPT-7.N synthetic call sites; agent-discriminator detector; sandbox-result write; outer finally block.
- Final LOC delta (target ~+120/-2).
- Confirmation that Regla 6 + D-15 + D-12 zero-diff gates all passed.
- Confirmation that `npx tsc --noEmit` is clean.
- Notes on any TypeScript narrowing issues encountered (e.g., `lastV4Result` null-narrowing).
- The exact text of the cross-reference comment to V4ProductionRunner CKPT-6a (the omitted anchor at `v4-production-runner.ts:464` or wherever the post-Task-1.2 line lands).
- Cross-reference to Plan 02 (route v4 branch that supplies lockHandle to this engine).
</output>
</content>
