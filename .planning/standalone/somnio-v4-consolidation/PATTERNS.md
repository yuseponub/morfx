# Standalone: somnio-v4-consolidation — Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 12 new/modified files
**Analogs found:** 12 / 12 (all files have direct source analogs — this is extraction, not greenfield)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/agents/somnio-v4/core/turn-orchestrator.ts` | orchestrator | event-driven (restart loop) | `engine/v4-production-runner.ts` :190-1213 | exact extraction |
| `src/lib/agents/somnio-v4/core/restart-context.ts` | model/struct | transform | `engine/v4-production-runner.ts` :115-173 + `engine-v4.ts` :160-200 | exact extraction |
| `src/lib/agents/somnio-v4/core/drain.ts` | utility | event-driven | `engine/v4-production-runner.ts` :237-267 (×5 Path A, ×2 Path B) + `engine-v4.ts` :233-254 (×4+×1) | exact consolidation |
| `src/lib/agents/somnio-v4/core/checkpoint-gate.ts` | utility/middleware | request-response | `somnio-v4-agent.ts` :347-378 (CKPT-1 boilerplate) | exact extraction |
| `src/lib/agents/somnio-v4/engine-v4.ts` (rewrite) | sandbox runner | event-driven | `engine/v4-production-runner.ts` (prod source of truth) | prod-to-sandbox adapter |
| `engine/v4-production-runner.ts` (W1 cleanup + W2 wrapper) | prod runner | event-driven | self | self-modification |
| `engine-adapters/production/v4-messaging-adapter.ts` (minor) | adapter | request-response | `engine-adapters/production/v4-messaging-adapter.ts` | self |
| `somnio-v4/somnio-v4-agent.ts` (W1: M-1/M-2 + helper adopt) | agent pipeline | event-driven | self | self-modification |
| `somnio-v4/sub-loop/index.ts` (W1: rename D-17 + helper adopt) | agent sub-loop | event-driven | self | self-modification |
| `interruption-system-v2/observability.ts` (W1: D-16 labels) | observability | event-driven | self | self-modification |
| `inngest/functions/agent-timers-v4.ts` (W1: D-13 Pitfall 1) | service/timer | batch | self | self-modification (Pitfall 2 gap in D-11) |
| `somnio-v4/ARCHITECTURE.md` + `INTERRUPTION-PARITY.md` (docs D-17/D-07) | docs | — | existing docs | doc sync |

---

## Pattern Assignments

### `src/lib/agents/somnio-v4/core/restart-context.ts` (struct, transform)

**Analog (source of extraction):** `src/lib/agents/engine/v4-production-runner.ts` :115-173 + `src/lib/agents/somnio-v4/engine-v4.ts` :160-200

This file defines one exported struct and its zero-value factory. Copy the field names and comments from the runner side (D-04: runner is source of truth).

**RestartContext shape** (runner `:115-173`, engine `:160-200`):
```typescript
// engine/v4-production-runner.ts:115-173
let totalTokensAcrossRestarts = 0   // R-05: accumulate per-iteration tokens
let restartIteration = 0            // observability — Pitfall 3 distinguishes restart 1 vs 5
let effectiveMessage: string | null = null  // null on iter 1, non-null after first restart
let templatesSentCount = 0

let carryState: {
  intentsVistos: string[]
  templatesEnviados: string[]
  datosCapturados: Record<string, string>
  packSeleccionado: string | null
  accionesEjecutadas: unknown[]
  currentMode: string
  turnLedgerDims: TurnLedgerDims  // inherited from output on Path B, NOT re-incremented
} | null = null
const accumulatedSentContents: string[] = []  // engine calls this accumulatedSentMessages
```

**dropOwnEntry helper** (runner `:139-147`, engine `:181-189` — byte-identical copy):
```typescript
// engine/v4-production-runner.ts:139-147
let ownEntryUuid: string | null = null
if (input.ownPendingEntryJson) {
  try {
    ownEntryUuid = (JSON.parse(input.ownPendingEntryJson) as { entry_uuid?: string }).entry_uuid ?? null
  } catch {
    ownEntryUuid = null
  }
}
const dropOwnEntry = <T extends { entry_uuid: string }>(entries: T[]): T[] =>
  ownEntryUuid ? entries.filter((e) => e.entry_uuid !== ownEntryUuid) : entries
```

**Note on carryState dual semantics (Pitfall 6 — CRITICAL):** The struct must encode two Path B variants. They differ in what `carryState` seeds from:
- Path B from CKPT-6b (runner `:726-736`): carry from **SEED** — pending templates were from prior turn; msg1's output was NOT sent → agent output not committed
- Path B from send-loop (runner `:900-911`, engine `:476-490`): carry from **OUTPUT** — msg1 was partially sent → carry iter-0's resulting state

---

### `src/lib/agents/somnio-v4/core/drain.ts` (utility, event-driven)

**Analog (source of extraction):** 9 copy-paste sites across runner and engine.

**Pattern to consolidate** (runner `:237-267` — CKPT-0 Path A site, the canonical example):
```typescript
// engine/v4-production-runner.ts:237-267 — repeated with minor variations at
// runner :452-477, :549-575, :669-695, :861-884 and
// engine-v4.ts :233-254, :333-351, :372-391, :437-456
const pending = dropOwnEntry(await readAndClearPending(
  this.config.workspaceId,
  lockCtx.channel,
  lockCtx.identifier,
))
await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
restartIteration++
const priorMsg: string = effectiveMessage ?? input.message
const combinedTotalChars = pending.reduce((s, p) => s + p.content.length, 0) + priorMsg.length
emitLockEvent('msg_aborted_path_a_combined', {
  at_step: 'ckpt_0_post_acquire',
  combined_msg_count: pending.length + 1,
  total_chars: combinedTotalChars,
  restart_iteration: restartIteration,
})
emitLockEvent('pending_list_combined', {
  at_step: 'ckpt_0_post_acquire',
  entries_count: pending.length,
  total_chars: pending.reduce((s, p) => s + p.content.length, 0),
  restart_iteration: restartIteration,
})
// Chronological order: priorMsg FIRST, pending APPENDED (commit 494d3bb4)
effectiveMessage = [priorMsg, ...pending.map((p) => p.content)].join('\n')
shouldRestart = true
continue
```

**Suggested function signature** (from RESEARCH.md §Code Examples):
```typescript
// drain.ts — consolidates the 9 sites above
// mode 'path_a' emits msg_aborted_path_a_combined
// mode 'path_b_solo' emits msg_aborted_path_b_solo + does NOT set effectiveMessage
async function drainPendingAndCombine(
  ctx: RestartContext,
  lockCtx: { workspaceId: string; channel: LockChannel; identifier: string },
  atStep: string,
  priorMsg: string,
  mode: 'path_a' | 'path_b_solo',
): Promise<{ pendingCount: number }>
```

**Path B variant** (engine `:458-499`, runner `:885-913` — emits `msg_aborted_path_b_solo` instead, sets carryState from OUTPUT):
```typescript
// engine-v4.ts:463-499 — Path B emit + carryState from output
emitLockEvent('msg_aborted_path_b_solo', {
  at_step: `ckpt_7_pre_template_${i}`,
  templates_sent_before_abort: i,
})
// ... then:
carryState = {
  currentMode: output.newMode ?? seedState.currentMode,
  intentsVistos: output.intentsVistos,
  templatesEnviados: output.templatesEnviados,
  datosCapturados: output.datosCapturados,
  packSeleccionado: output.packSeleccionado as PackSelection | null,
  accionesEjecutadas: output.accionesEjecutadas as SandboxState['accionesEjecutadas'],
  turnLedgerDims: output.turnLedgerDims,
}
effectiveMessage = pending.map(p => p.content).join('\n')  // new message ONLY (no prior)
```

**Pitfall 7 — ordering constraint:** In the runner, the CKPT-0 drain uses `effectiveMessage ?? input.message` (:247) BEFORE the `_v3:pendingUserMessage` combine (:282). The core must preserve this exact order.

---

### `src/lib/agents/somnio-v4/core/checkpoint-gate.ts` (utility/middleware, request-response)

**Analog (source of extraction):** `src/lib/agents/somnio-v4/somnio-v4-agent.ts` :347-378 (CKPT-1 boilerplate, repeated at CKPT-2 :524-555 in the agent, and CKPT-3/4/5 in sub-loop/index.ts)

**Full boilerplate to factor out** (somnio-v4-agent.ts :347-378 — this is the exact pattern):
```typescript
// somnio-v4-agent.ts:347-378 — CKPT-1 (post-comprehension) — ~30 lines per checkpoint
if (input.lockHandle && input.lockChannel && input.lockIdentifier) {        // (1) skip-gate
  const ck1 = await checkpoint(
    'ckpt_1_post_comprehension',
    input.lockHandle,
    input.workspaceId,
    input.lockChannel,
    input.lockIdentifier,
  )
  if (ck1.lostLock) throw new LostLockError('ckpt_1_post_comprehension')  // (2) zombie throw
  if (!ck1.proceed && ck1.interrupted) {                                   // (3) interrupt
    emitLockEvent('msg_aborted_path_a_combined', {
      combined_msg_count: 1,
      total_chars: input.message.length,
    })
    return {
      success: false,
      messages: [],
      errorMessage: 'interrupted_at_ckpt_1_post_comprehension',
      intentsVistos: input.intentsVistos,
      templatesEnviados: input.templatesEnviados,
      datosCapturados: input.datosCapturados,
      packSeleccionado: input.packSeleccionado,
      accionesEjecutadas: input.accionesEjecutadas ?? [],
      turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
      totalTokens: tokensUsed,
      shouldCreateOrder: false,
      timerSignals: [],
    }
  }
}
```

**What the helper does** (per D-06 + RESEARCH §Code Examples): centralizes (1) skip-gate + (2) lostLock throw + emit. Each module keeps its own `return` builder (agent returns `V4AgentOutput` passthrough; sub-loop returns `LoopOutcome`). Colocations do NOT move (D-06).

**Suggested helper signature** (from RESEARCH.md §Architecture Patterns):
```typescript
// checkpoint-gate.ts — helper that factorizes the ~30-line boilerplate
// Returns 'proceed' if the checkpoint passed (caller continues)
// Returns { interrupted: ckptId } if interrupted (caller builds its own early-return)
// Throws LostLockError if lock is lost (caller's outer catch handles zombie exit)
async function runCheckpointGate(
  ckptId: CheckpointId,
  lockHandle: LockHandle | null | undefined,
  workspaceId: string,
  lockChannel: LockChannel | null | undefined,
  lockIdentifier: string | null | undefined,
  opts?: CheckpointOptions,
): Promise<'proceed' | { interrupted: string }>
```

**What it must import:** `checkpoint` from `@/lib/agents/interruption-system-v2/checkpoints` (same absolute specifier — Pitfall 8: changing specifier breaks vi.mock in 6+ suites).

---

### `src/lib/agents/somnio-v4/core/turn-orchestrator.ts` (orchestrator, event-driven)

**Analog (source of extraction):** `src/lib/agents/engine/v4-production-runner.ts` :190-1213 (the entire restart loop body)

**Restart loop shell** (runner `:190-192`):
```typescript
// engine/v4-production-runner.ts:190-192
let shouldRestart = true
while (shouldRestart) {
  shouldRestart = false
  // ... body
}
```

**LockCtx derivation with defensive throw** (runner `:95-106` — runner's version is the source of truth per D-04; engine's version at :152-154 is SILENT null and must NOT be copied):
```typescript
// engine/v4-production-runner.ts:95-106
const lockCtx = input.lockHandle && input.lockChannel && input.lockIdentifier
  ? { channel: input.lockChannel, identifier: input.lockIdentifier }
  : null
// Defensive: fail loud on contract violation
if (input.lockHandle && !lockCtx) {
  throw new Error(
    '[interruption-v2] lockHandle present but lockChannel/lockIdentifier missing — webhook contract violated',
  )
}
```

**Heartbeat lifecycle** (runner `:108-111`, `:1272` — both sides identical):
```typescript
// engine/v4-production-runner.ts:108-111
let stopHeartbeat: (() => void) | null = null
if (input.lockHandle) {
  stopHeartbeat = startHeartbeat(input.lockHandle)
}
// ... in finally (:1272):
if (stopHeartbeat) stopHeartbeat()
```

**Optional-capability adapter pattern** (runner `:580` — base of the D-05 adapter interface):
```typescript
// engine/v4-production-runner.ts:580 — pattern for prod-only capabilities
if (this.adapters.storage.getPendingTemplates) {
  const pending = await this.adapters.storage.getPendingTemplates(session.id)
  // ... CKPT-6a + 5h-pre only run if capability exists
}
// Sandbox adapter simply does not implement getPendingTemplates → branch skipped
```

**Finally block — identical in both runner and engine** (runner `:1259-1293`, engine `:744-766`):
```typescript
// engine/v4-production-runner.ts:1259-1293
} finally {
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

**LostLockError catch** (runner `:1224-1238`, engine `:666-708`):
```typescript
// engine/v4-production-runner.ts:1224-1238
if (error instanceof LostLockError) {
  emitLockEvent('zombie_lambda_exit', {
    my_uuid: input.lockHandle?.holderUuid ?? 'unknown',
    current_holder_uuid: 'unknown',
    at_step: error.ckptId,
  })
  return {
    success: false,
    messages: [],
    error: { code: 'V4_ZOMBIE_LAMBDA_EXIT', message: error.message },
  }
}
```

**Path A discriminator detection** (runner `:441-478`, engine `:325-352` — byte-identical):
```typescript
// engine/v4-production-runner.ts:441-478
if (
  output.success === false &&
  typeof output.errorMessage === 'string' &&
  output.errorMessage.startsWith('interrupted_at_ckpt_')
) {
  if (!lockCtx) {
    throw new Error(`[V4-RUNNER] agent emitted ${output.errorMessage} but lockCtx is null`)
  }
  const pending = dropOwnEntry(await readAndClearPending(...))
  await clearInterrupt(...)
  restartIteration++
  emitLockEvent('msg_aborted_path_a_combined', { at_step: output.errorMessage, ... })
  emitLockEvent('pending_list_combined', { ... })
  effectiveMessage = [turnEffectiveMessage, ...pending.map((p) => p.content)].join('\n')
  shouldRestart = true
  continue
}
```

**D-14 warning replacement** — the branch at runner `:949-961` is DELETED in W1 before extraction. The replacement warning goes where the send-prep lives (RESEARCH §Code Examples §Warning D-14):
```typescript
// Replacement for the deleted branch :949-961
if (output.messages.length > 0 && (!output.templates || output.templates.length === 0)) {
  getCollector()?.recordEvent('pipeline_decision', 'v4_messages_without_templates', {
    sessionId: session.id,
    messageCount: output.messages.length,
    preview: output.messages[0]?.slice(0, 120) ?? '',
  })
  console.warn('[V4-RUNNER] output.messages sin templates — nunca debería ocurrir (post rag:* passthrough)')
}
// NO push to sentMessageContents (kills G-3), NO send
```

**D-05 adapter interface** (from RESEARCH.md §Architecture Patterns):
```typescript
// core/turn-orchestrator.ts — adapters parameter interface
// Derived from runner's existing optional-method pattern (runner :580/:858/:938)
interface TurnCoreAdapters {
  send(block: SendBlock): Promise<{ messagesSent: number; interrupted?: boolean; interruptedAtIndex?: number }>
  getSeedState(): Promise<CoreSeedState>
  commitTurn?(result: CommittedTurn): Promise<void>
  getPendingTemplates?(): Promise<PendingTemplate[]>
  savePendingTemplates?(sessionId: string, templates: unknown[]): Promise<void>
  clearPendingTemplates?(sessionId: string): Promise<void>
  getLegacyPendingMessage?(): string | undefined         // D-18 crash-recovery
  savePathARollback?(msg: string): Promise<void>         // D-18 prod-only
  filterOutbound?(templates: ProcessedMessage[]): Promise<ProcessedMessage[]>  // no-rep prod-only
  beforeAgentInvoke?(iteration: number): Promise<void>   // sandbox timing simulation
  onResultReady?(result: TurnResult): Promise<void>      // sandbox-result Redis write (C4)
}
```

---

### `src/lib/agents/somnio-v4/engine-v4.ts` (rewrite as sandbox wrapper)

**Analog (source of truth for the core mechanics):** `src/lib/agents/engine/v4-production-runner.ts`

**Analog (sandbox-only logic to keep):** `src/lib/agents/somnio-v4/engine-v4.ts` (current file)

After W2, this file becomes a thin wrapper that:
1. Instantiates the sandbox send-adapter (absorbs engine-v4.ts :404-512 — the synthetic CKPT-7.N loop)
2. Instantiates the sandbox storage-adapter (memory, no DB)
3. Calls the core orchestrator
4. Maps `TurnResult` → `V4EngineOutput` (including `SandboxState` build and `DebugTurn` build — engine-v4.ts :521-629)

**sandbox-result write BEFORE finally** — must happen via `onResultReady` hook or `beforeRelease` (Open Question C4 per RESEARCH.md):
```typescript
// engine-v4.ts:645-657 — Pitfall 5 sandbox-integration: write before lock release
if (input.sandboxSessionId && input.lockHandle && lastV4Result) {
  try {
    await redis.set(
      `sandbox-result:${input.sandboxSessionId}`,
      JSON.stringify(lastV4Result),
      { ex: 60 },
    )
  } catch (resultWriteErr) {
    console.error('[SomnioV4Engine] sandbox-result write failed', resultWriteErr)
  }
}
```

**Error divergence contract — intentional, do NOT unify** (C5):
```typescript
// engine-v4.ts:714-742 — sandbox error returns success:true with [Error v4] message (UX sandbox)
return {
  success: true,
  messages: [`[Error v4] ${errorMsg}`],
  newState: input.state,
  debugTurn: { ... },
  error: { code: 'V4_ENGINE_ERROR', message: errorMsg },
}
// vs runner:1250-1257 which returns success: false — divergence is INTENTIONAL
```

---

### `src/lib/agents/somnio-v4/somnio-v4-agent.ts` (W1: dead code removal + checkpoint helper adoption)

**W1 changes only — core pipeline logic is NOT touched (D-06).**

**M-1: isCrmMutation/casReject always-false params** (somnio-v4-agent.ts :414-415):
```typescript
// somnio-v4-agent.ts:414-415 — these params are always false; borrar
const earlyReason = decideSubLoopReason({
  confidence: analysis.intent.intent_confidence,
  threshold,
  intent: analysis.intent.primary,
  isCrmMutation: false,   // ← BORRAR este param + el type en EscalationInput
  casReject: false,       // ← BORRAR este param + el type en EscalationInput
})
```

**M-2: shouldCreateOrder legacy false** (somnio-v4-agent.ts :987, :984 comment) — ~12 assignment sites all emit `shouldCreateOrder: false`. When D-13 removes the field from `V4AgentOutput`, all these assignments disappear. The grep at the start of W1 gives the exact list.

**Pitfall 3: mapOutcomeToAgentOutput is entirely dead** (somnio-v4-agent.ts :1217-1450 — ~233 lines):
```typescript
// somnio-v4-agent.ts:1217 — start of dead function, no call sites
function mapOutcomeToAgentOutput(args: {
  // ...
}): V4AgentOutput {
```
Delete the entire block. This also eliminates the `V4AgentOutput.subLoopReason` union mention at :1224. After deletion, the union in `types.ts` reduces to `'low_confidence' | 'razonamiento_libre' | null`.

---

### `src/lib/agents/somnio-v4/sub-loop/index.ts` (W1: rename D-17 + helper adopt)

**W1 change only — sub-loop logic is NOT touched.**

**D-17 rename** (sub-loop/index.ts :953, :980):
```typescript
// sub-loop/index.ts:949-980 — rename throughout this file only
// runLegacySubLoop (internal) → runCrmMutationSubLoop
// runLegacySubLoopRaw (internal) → runCrmMutationSubLoopRaw
async function runLegacySubLoop(args: RunSubLoopArgs): Promise<LoopOutcome> {
//                 ^ rename to: runCrmMutationSubLoop
async function runLegacySubLoopRaw(...): Promise<...> {
//                 ^ rename to: runCrmMutationSubLoopRaw
```
The public export `runSubLoop` (line :265) is unchanged. `crm-gate.ts` calls `runCrmSubLoop` — verify grep to confirm the rename doesn't break that call path.

---

### `src/lib/agents/interruption-system-v2/observability.ts` (W1: D-16 label removal)

**W1 change: remove 3 dead labels from `LockEventLabel` union** (observability.ts :46, :48, :52):

```typescript
// observability.ts:30-61 — current 14-label union
export type LockEventLabel =
  | 'lock_acquired'
  | 'lock_acquire_failed_follower'
  | 'interrupt_written'
  | 'interrupt_detected_at_ckpt_N'
  | 'msg_aborted_path_a_combined'
  | 'msg_aborted_path_b_solo'
  | 'lock_released_normal'
  | 'follower_woke'                          // ← BORRAR (zero emitters confirmed)
  | 'lock_force_acquired_after_ttl_expiry'   // ← BORRAR (zero emitters confirmed)
  | 'zombie_lambda_exit'
  | 'heartbeat_renewed'                       // ← BORRAR (zero emitters confirmed)
  | 'pending_list_combined'
  | 'redis_unavailable_fallback_failed'
  | 'lock_orphan_swept_by_cron'
// Remaining union: 11 labels
```

**Cascading test changes (Pitfall 5 — sancionados por D-16):**

File `src/lib/agents/interruption-system-v2/__tests__/observability.test.ts` — exhaustive list of 14 labels must become 11. The describe block "typed 14-label emitter" → "typed 11-label emitter".

File `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` :239/271 — emits `lock_force_acquired_after_ttl_expiry` via `emitLockEvent` in a simulation. This block is type-invalid after the union shrinks → delete/adjust the simulation (the tested behavior doesn't need this label).

**CLAUDE.md gate update:** The grep count `wc -l` in the interruption-system-v2 gate changes from 14 to 11. The regex must drop the 3 removed labels.

---

### `src/inngest/functions/agent-timers-v4.ts` (W1: D-13 Pitfall 1 — extend D-11 scope)

**Explicitly added to D-11 diff-allowed list** per RESEARCH.md Pitfall 2. This file is v4-ONLY (godentist/recompra/v3 have their own timer files). Regla 6 spirit preserved.

**Dead consumer block to delete** (agent-timers-v4.ts :432-452 + surrounding refs):
```typescript
// agent-timers-v4.ts:434-452 — BORRAR este bloque completo
if (output.shouldCreateOrder && output.orderData) {
  const orderResult = await createTimerOrderV4({
    workspaceId,
    sessionId,
    level: level as 0|1|2|3|4|5|6|7|8,
    datosCapturados: output.orderData.datosCapturados,
    packSeleccionado: output.orderData.packSeleccionado,
    valorOverride: output.orderData.valorOverride,
    isOfiInter: output.datosCapturados['_v4:ofiInter'] === 'true',
    cedulaRecoge: output.datosCapturados.cedula_recoge,
  })
  // ...
}
```

**Also delete from return shape** (agent-timers-v4.ts :456-463):
```typescript
// :456-463 — remove shouldCreateOrder/orderCreated/orderError from return
return {
  status: 'timeout' as const,
  action: `timer_L${level}_expired`,
  messagesSent: sentCount,
  newMode: output.newMode,
  shouldCreateOrder: output.shouldCreateOrder,  // ← BORRAR
  orderCreated,                                  // ← BORRAR
  orderError,                                    // ← BORRAR
  timerSignals: output.timerSignals ?? [],
}
```

**Log line to update** (agent-timers-v4.ts :351):
```typescript
// :345-355 — remove shouldCreateOrder from the logger.info call
logger.info(
  {
    sessionId, level,
    newMode: output.newMode,
    messageCount: output.messages.length,
    templateCount: output.templates?.length ?? 0,
    shouldCreateOrder: output.shouldCreateOrder,  // ← BORRAR
    requiresHuman: output.requiresHuman ?? false,
  },
  'V4 timer processMessage completed'
)
```

**createTimerOrderV4 helper** — after deleting the consumer, grep to confirm zero remaining call sites, then delete the helper function itself (per Open Question 2 in RESEARCH.md: default is to delete; it's re-constructible).

**engine-v4.ts :597 fix** (Pitfall 1 — keeps DebugTurn compiling after V4AgentOutput loses shouldCreateOrder):
```typescript
// engine-v4.ts:597 — after field deletion, populate with literal
debugTurn.orchestration.shouldCreateOrder = false  // literal, DebugTurn NOT modified (out of scope D-11)
```

---

## Shared Patterns

### Interruption-system-v2 import specifiers (Pitfall 8 — CRITICAL)

**Source:** all existing test files that use `vi.mock`
**Apply to:** ALL new core files and any modified file that imports from interruption-system-v2
**Rule:** Always use the absolute `@/lib/agents/interruption-system-v2/*` specifier. Never use relative paths. Changing the specifier breaks vi.mock interception in 6+ test suites.

```typescript
// Correct — use these exact specifiers in core/ files
import { checkpoint } from '@/lib/agents/interruption-system-v2/checkpoints'
import { releaseLockIfOwner, startHeartbeat } from '@/lib/agents/interruption-system-v2/lock'
import { readAndClearPending, clearInterrupt } from '@/lib/agents/interruption-system-v2/pending'
import { emitLockEvent } from '@/lib/agents/interruption-system-v2/observability'
```

### Optional-capability gating (adapter pattern — no boolean flags)

**Source:** `src/lib/agents/engine/v4-production-runner.ts` :580/:858/:938
**Apply to:** `turn-orchestrator.ts` adapter interface and all prod-only features

```typescript
// engine/v4-production-runner.ts:580 — the established pattern
if (this.adapters.storage.getPendingTemplates) {
  const pending = await this.adapters.storage.getPendingTemplates(session.id)
  // ... only runs when adapter implements the method
}
// Sandbox adapter: simply does NOT implement → branch silently skipped
// No entorno boolean, no config flag, no conditional import
```

### Chronological drain order (commit 494d3bb4 — enforced in all drain sites)

**Source:** `src/lib/agents/engine/v4-production-runner.ts` :265, `src/lib/agents/somnio-v4/engine-v4.ts` :252
**Apply to:** `drain.ts` `drainPendingAndCombine()` implementation

```typescript
// Invariant: priorMsg FIRST (older, being processed), pending entries APPENDED (newer, arrived during)
effectiveMessage = [priorMsg, ...pending.map((p) => p.content)].join('\n')
// NOT: [...pending.map(p => p.content), priorMsg].join('\n')
```

### Interrupt consume on every drain site (bug fix 2026-05-28)

**Source:** `src/lib/agents/engine/v4-production-runner.ts` :245, `src/lib/agents/somnio-v4/engine-v4.ts` :237
**Apply to:** `drain.ts` — must call `clearInterrupt` after every `readAndClearPending`

```typescript
// engine/v4-production-runner.ts:244-245
// Consume the interrupt signal too: else the next iteration's CKPT-0 re-reads
// the still-set interrupt key and spins Path A on an empty pending list.
await clearInterrupt(this.config.workspaceId, lockCtx.channel, lockCtx.identifier)
```

### Continue (not return) after drain — no DB write in restart iterations (Pitfall 8 / R-01)

**Source:** `src/lib/agents/engine/v4-production-runner.ts` :267, `src/lib/agents/somnio-v4/engine-v4.ts` :254
**Apply to:** `turn-orchestrator.ts` restart loop

```typescript
// All drain sites end with:
shouldRestart = true
continue  // NOT return — no DB write, no state commit during restart
```

---

## Regla 6: Adjacent-but-Forbidden Files

The following shared files are in the call path but **must NOT be modified** (D-11 gate):

| File | Reason Forbidden | Safe Border |
|---|---|---|
| `src/lib/agents/engine-adapters/production/messaging.ts` | Shared parent adapter for v3/godentist/recompra/pw — D-14 fix is runner-side only | Core invokes `send()` contract, never modifies the parent |
| `src/lib/sandbox/types.ts` (`DebugTurn`, `SandboxState`) | Shared with sandbox v3 — modifying shapes breaks v3 debug panel | Populate with literals/casts from wrapper (precedent: engine-v4.ts :486, :529) |
| `src/lib/observability/` | Consumed, not modified | `getCollector()?.recordEvent(...)` calls only |
| `src/lib/agents/interruption-system-v2/checkpoints.ts` | `checkpoint()` is single-source-of-truth; helper D-06 WRAPS it, does not replace | Import and call unchanged |
| `src/lib/agents/interruption-system-v2/lock.ts` | Lock primitives intact | Import `startHeartbeat`, `releaseLockIfOwner`, `assertHoldsLock` unchanged |
| `src/lib/agents/interruption-system-v2/pending.ts` | Pending list primitives intact | Import `readAndClearPending`, `clearInterrupt`, `removeOwnEntry` unchanged |
| `src/lib/agents/engine/v3-production-runner.ts` | v3 is live in prod; D-13 mandates zero shared helpers | No touch, no import |
| `src/app/api/sandbox/process/route.ts` | Integration point that instanciates SomnioV4Engine; internal change only | Wrapper signature unchanged |
| `src/lib/whatsapp/webhook-processor.ts` | Integration point for runner; change is internal to runner | Branch at :847-931 unchanged |

**Diff-gate (D-11 extended with Pitfall 2):**
```bash
# Files allowed to change — any file NOT in this list must produce 0 diff
# somnio-v4/ (all files)
# engine/v4-production-runner.ts
# engine-adapters/production/v4-messaging-adapter.ts
# interruption-system-v2/observability.ts (D-16 only)
# inngest/functions/agent-timers-v4.ts (Pitfall 2 extension)
# docs (ARCHITECTURE.md, INTERRUPTION-PARITY.md, CLAUDE.md)
# .planning/
```

---

## D-15: confidence field — DEPRECATE, not delete

**Decision:** RESEARCH.md Pitfall 4 resolves D-15 to DEPRECATE. Do NOT delete the field.

**Reason:** `guards.ts:25` is load-bearing — `R0: if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') → handoff`. Substituting `intent_confidence*100` changes the guard (two distinct auto-reported confidence scales from the same LLM call). Violates the invariant: "9 mecanismos quedan funcionando IDÉNTICO."

**W1 action:** Add `@deprecated` comment to `comprehension-schema.ts` (confidence field definition) and to `intentInfo.confidence` in `types.ts`:
```typescript
// comprehension-schema.ts — where confidence is defined (exact line TBD by executor grep)
/** @deprecated Legacy 0-100 scale. Use intent_confidence (0.0-1.0) for new consumers.
 *  NOT DELETED: load-bearing in guards.ts:25 (R0 handoff gate) + agent_turns.confidence
 *  column + debug panel tabs. Removal tracked as future standalone. */
confidence: z.number().min(0).max(100),
```

---

## No Analog Found

No files in this standalone lack analogs — every file is extracted from or modifies existing source files. The pattern assignments above cover 100% of the work scope.

---

## Metadata

**Analog search scope:** `src/lib/agents/somnio-v4/`, `src/lib/agents/engine/`, `src/lib/agents/engine-adapters/production/`, `src/lib/agents/interruption-system-v2/`, `src/inngest/functions/agent-timers-v4.ts`
**Files read directly:** v4-production-runner.ts (1295 lines, full), engine-v4.ts (768 lines, full), somnio-v4-agent.ts (imports + CKPT-1 + dead-code sections), v4-messaging-adapter.ts (full), observability.ts (full), checkpoints.ts (function body), agent-timers-v4.ts (:330-475)
**Pattern extraction date:** 2026-06-10
**Valid until:** any session that modifies `somnio-v4/`, `v4-production-runner.ts`, or `interruption-system-v2/` before execution — re-verify line offsets if that happens
