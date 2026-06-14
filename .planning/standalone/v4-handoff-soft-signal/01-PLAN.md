---
phase: v4-handoff-soft-signal
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/engine/types.ts
  - src/lib/agents/engine/v4-production-runner.ts
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/production/webhook-processor.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "When v4 resolves a handoff gate, storage.handoff() is NOT called (session stays active)"
    - "When v4 resolves a handoff gate, executeHandoff() is NOT called (customer gets no handoff message)"
    - "EngineOutput carries handoffSuggested:true and handoffSignal:{reason,gate,topic?} when v4 signals handoff"
    - "A handoff_suggested observability event is emitted at every gate point with the D-03 payload"
    - "Existing agents (v3/godentist/recompra/pw-confirmation/varixcenter) still call executeHandoff when newMode='handoff'"
    - "Covered slots in a partial handoff are still sent to the customer (combinedMessages unchanged)"
    - "D-02: no handoff_suggested event emitted for interrupted_at_ckpt_* reasons"
    - "tsc --noEmit exits 0"
    - "npx vitest run src/lib/agents/somnio-v4/__tests__/ passes (updated assertions)"
  artifacts:
    - path: "src/lib/agents/engine/types.ts"
      provides: "handoffSuggested + handoffSignal fields added to EngineOutput"
      contains: "handoffSuggested?: boolean"
    - path: "src/lib/agents/engine/v4-production-runner.ts"
      provides: "mapResult sets handoffSuggested; commitTurn skips storage.handoff"
      contains: "handoffSuggested: true"
    - path: "src/lib/agents/somnio-v4/somnio-v4-agent.ts"
      provides: "handoff_suggested event emitted at guard R0/R1 + vision + resolveLowSlot"
      contains: "handoff_suggested"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "Hard path gated on !result.handoffSuggested; soft branch skeleton (note insert in Plan 02)"
      contains: "handoffSuggested"
  key_links:
    - from: "v4-production-runner.ts:mapResult"
      to: "EngineOutput.handoffSuggested"
      via: "output.newMode === 'handoff' && !suppressTurnEffects"
      pattern: "handoffSuggested.*true"
    - from: "webhook-processor.ts:1080"
      to: "executeHandoff (hard path)"
      via: "!result.handoffSuggested guard"
      pattern: "handoffSuggested.*executeHandoff"
    - from: "somnio-v4-agent.ts:464"
      to: "agent_observability_events"
      via: "recordV4Event('handoff_suggested', D-03 payload)"
      pattern: "recordV4Event.*handoff_suggested"
---

<objective>
Core behavioral change: separate the SIGNAL of handoff from the DECISION of handoff in somnio-sales-v4.

Purpose: v4 currently makes an irreversible decision (calls storage.handoff + executeHandoff) the moment it detects a handoff gate. This standalone makes it emit a structured signal instead, letting a future handoff-agent make the actual decision. v4 is DORMANT so zero live impact.

Output: EngineOutput with handoffSuggested/handoffSignal fields; suppressed storage.handoff + executeHandoff for v4 path; handoff_suggested observability events at all 5 gate categories.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-handoff-soft-signal/RESEARCH.md
@.planning/standalone/v4-handoff-soft-signal/CONTEXT.md

<interfaces>
<!-- Key contracts the executor needs. Read these before touching anything. -->

From src/lib/agents/engine/types.ts (EngineOutput, current):
```typescript
export interface EngineOutput {
  success: boolean
  messages: string[]
  newState?: any
  debugTurn?: any
  timerSignal?: TimerSignal
  orderCreated?: boolean
  orderId?: string
  contactId?: string
  newMode?: string
  tokensUsed?: number
  sessionId?: string
  messagesSent?: number
  response?: string
  silenceDetected?: boolean
  error?: { code: string; message: string; retryable?: boolean }
}
```

From src/lib/agents/engine/v4-production-runner.ts (mapResult, current — lines 563-620):
- Returns EngineOutput built from TurnResult
- `suppressTurnEffects = outputDiscarded || result.wasInterruptedWithZeroSends`
- `newMode: suppressTurnEffects ? undefined : output.newMode`
- handoffSuggested/handoffSignal fields do NOT exist yet

commitTurn block at lines 376-382 (current):
```typescript
// Handoff.
if (output.newMode === 'handoff') {
  await adapters.storage.handoff(sessionId, resolvedVersion)
  if (adapters.storage.clearPendingTemplates) {
    await adapters.storage.clearPendingTemplates(sessionId)
  }
}
```

From src/lib/agents/production/webhook-processor.ts (lines 1080-1102, current):
```typescript
if (result.success && result.newMode === 'handoff') {
  const stillEnabled = await isAgentEnabledForConversation(...)
  if (stillEnabled) {
    try {
      const config = await getWorkspaceAgentConfig(workspaceId)
      const { executeHandoff } = await import('./handoff-handler')
      await executeHandoff(conversationId, workspaceId, {
        handoffMessage: config?.handoff_message ?? 'Regalame 1 min, ya te comunico con un asesor',
      })
    } catch (handoffError) { ... }
  }
}
```
supabase at line 140 = createAdminClient() (admin, bypasses RLS — confirmed).

From src/lib/agents/somnio-v4/observability.ts:
```typescript
export function recordV4Event(
  label: string,  // accepts any string — no strict union
  payload: Record<string, unknown>,
  opts: { restartIteration?: number; durationMs?: number } = {},
): void
```

From somnio-v4-agent.ts guard block (lines 461-527):
- `guardResult.decision.reason` holds the reason string (e.g. "asesor_solicitud", "queja")
- The event 'guard blocked' is already emitted at line 465 before the handoff return

From somnio-v4-agent.ts resolveLowSlot (lines ~800-818):
- 'handoff_low_confidence_fallback' event emitted at line 807
- `handoffSlots.push({ intent, reason: outcome.reason })` at line 815

From somnio-v4-agent.ts vision handoff path (lines 314-340):
- `decisionInfo: { action: 'handoff', reason: handoffReason }` is set at line 339
- vision error path (lines 224-249): does NOT set decisionInfo — reason needs to be extracted inline

From sub-loop/index.ts:
- `emitRagHandoff` function (lines 625-647): builds LoopOutcome.reason = the reason string passed in
- tooling-decides-handoff path (lines 327-382): no call to emitRagHandoff — returns LoopOutcome directly; `reason = tooling.handoff_reason ?? 'no_relevant_hit'`
- The sub-loop returns LoopOutcome to resolveLowSlot in somnio-v4-agent.ts; the reason is read there
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add handoffSuggested + handoffSignal to EngineOutput</name>
  <files>src/lib/agents/engine/types.ts</files>
  <read_first>
    Read src/lib/agents/engine/types.ts lines 132-168 (EngineOutput interface).
    The analog is visionContext added to EngineInput (lines 117-121) — same additive optional-field pattern with a JSDoc comment referencing the standalone.
    Read RESEARCH.md §Q2 Option A.
  </read_first>
  <action>
Add two optional fields to EngineOutput AFTER the `silenceDetected` field and BEFORE the `error` field:

```typescript
/**
 * standalone v4-handoff-soft-signal (D-03 + D-04).
 * Set by v4-production-runner.ts when the v4 agent signals a soft handoff.
 * Existing agents never set this → executeHandoff fires normally for them (Regla 6).
 */
handoffSuggested?: boolean
/**
 * Structured handoff signal (D-03 payload minus sessionId/conversationId/turnId
 * which are already in scope at the call site).
 */
handoffSignal?: {
  reason: string
  gate: 'guard_r0_r1' | 'vision' | 'no_kb' | 'low_confidence' | 'binary_backstop' | 'escalation_trigger' | 'nunca_decir'
  topic?: string
}
```

Do NOT change any existing field. This is a pure additive change.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>grep -n "handoffSuggested" src/lib/agents/engine/types.ts returns at least 2 lines; tsc exits 0.</done>
</task>

<task type="auto">
  <name>Task 2: v4-production-runner — remove hard handoff from commitTurn + set handoffSuggested in mapResult</name>
  <files>src/lib/agents/engine/v4-production-runner.ts</files>
  <read_first>
    Read src/lib/agents/engine/v4-production-runner.ts lines 340-404 (commitTurn: updateMode, handoff block).
    Read lines 560-621 (mapResult).
    Read RESEARCH.md §Q2 Pitfall 2 and §Q2 Open Question 1 — the mode update at line 350 (updateMode) is KEPT; only the storage.handoff() call and clearPendingTemplates() are removed. The mode will still transition to 'handoff' in the session, which is intentional.
    Also read RESEARCH.md Pitfall 5 (storage.handoff sets handed_off status — skipping it keeps session active, which is the intended behavior).
  </read_first>
  <action>
**Part A — commitTurn: remove the hard handoff block (lines 376-382)**

Delete ONLY the handoff block:
```typescript
// REMOVE this entire block:
// Handoff.
if (output.newMode === 'handoff') {
  await adapters.storage.handoff(sessionId, resolvedVersion)
  if (adapters.storage.clearPendingTemplates) {
    await adapters.storage.clearPendingTemplates(sessionId)
  }
}
```

The updateMode call at line 350-352 STAYS UNTOUCHED:
```typescript
// KEEP this — mode transition 'handoff' still persists:
if (output.newMode && output.newMode !== resolvedCurrentMode) {
  await adapters.storage.updateMode(sessionId, resolvedVersion, output.newMode)
}
```

Rationale: In soft mode, the session stays alive (no storage.handoff) but the mode transitions to 'handoff' so future turns and the handoff-agent know the session is in handoff consideration.

**Part B — mapResult: set handoffSuggested + handoffSignal when newMode is handoff**

In the `kind === 'completed'` branch of mapResult (after line 592 `const output: V4AgentOutput = result.output`), add a helper to derive the gate string from decisionInfo.reason:

```typescript
// Derive the D-03 gate from the handoff reason string.
// Called only when output.newMode === 'handoff' && !suppressTurnEffects.
const deriveHandoffGate = (
  reason: string | undefined,
): EngineOutput['handoffSignal'] extends undefined ? never : NonNullable<EngineOutput['handoffSignal']>['gate'] => {
  if (!reason) return 'no_kb'
  if (reason.startsWith('low_response_confidence')) return 'low_confidence'
  if (reason.startsWith('binary_backstop_')) return 'binary_backstop'
  if (reason.startsWith('escalation_trigger_match:')) return 'escalation_trigger'
  if (reason.startsWith('nunca_decir_violation:')) return 'nunca_decir'
  if (reason.startsWith('imagen ') || reason.startsWith('imagen_')) return 'vision'
  if (reason.startsWith('no_relevant_hit') || reason === 'no_relevant_hit') return 'no_kb'
  // Guard R0/R1 reasons contain strings like "asesor", "queja", "cancelar" etc.
  // They don't match any content-gap prefix → guard_r0_r1.
  return 'guard_r0_r1'
}
```

Note: The type cast on the return type above is verbose. Simplify to just return type `EngineOutput['handoffSignal'] extends undefined ? never : NonNullable<EngineOutput['handoffSignal']>['gate']` → actually, just define it as returning `'guard_r0_r1' | 'vision' | 'no_kb' | 'low_confidence' | 'binary_backstop' | 'escalation_trigger' | 'nunca_decir'`.

Then in the return statement of the `kind === 'completed'` branch (currently lines 603-619), add the two new fields:

```typescript
return {
  success: output.success,
  messages: outputDiscarded ? [] : output.messages,
  newMode: suppressTurnEffects ? undefined : output.newMode,
  tokensUsed: result.totalTokens,
  sessionId: result.sessionId,
  messagesSent: result.templatesSentCount,
  response: result.allSentContents.join('\n'),
  orderCreated: outputDiscarded ? undefined : output.crmResult?.success,
  orderId: outputDiscarded ? undefined : output.crmResult?.orderId,
  contactId: output.crmResult?.contactId ?? input.contactId,
  error: output.success ? undefined : {
    code: 'V4_AGENT_ERROR',
    message: buildCleanErrorMessage(output),
  },
  // v4-handoff-soft-signal (D-03 + D-04): soft handoff signal for v4.
  // suppressTurnEffects covers the outputDiscarded + wasInterruptedWithZeroSends edges
  // where newMode is already suppressed — soft signal must also be absent in those cases.
  ...(output.newMode === 'handoff' && !suppressTurnEffects
    ? {
        handoffSuggested: true,
        handoffSignal: {
          reason: output.decisionInfo?.reason ?? 'unknown',
          gate: deriveHandoffGate(output.decisionInfo?.reason),
          // topic comes from subLoopReason when the gate is a sub-loop gate.
          // For comprehension gates (guard R0/R1, vision), subLoopReason is null.
          topic: (output as any).subLoopReason ?? undefined,
        },
      }
    : {}),
}
```

IMPORTANT: `output` is typed as `V4AgentOutput`. Verify that `V4AgentOutput` has a `subLoopReason` field. If it does, use it directly (no cast). If not, the cast `(output as any).subLoopReason` is acceptable since the field exists in the runtime object.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>
    - `grep -n "storage\.handoff" src/lib/agents/engine/v4-production-runner.ts` returns 0 matches (the call is gone).
    - `grep -n "handoffSuggested" src/lib/agents/engine/v4-production-runner.ts` returns at least 2 matches.
    - `grep -n "clearPendingTemplates" src/lib/agents/engine/v4-production-runner.ts` returns 0 matches in the handoff block (it was inside it; if clearPendingTemplates appears elsewhere for other purposes, that's fine — verify context).
    - tsc exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 3: Emit handoff_suggested events + R0/R1 ack in somnio-v4-agent.ts</name>
  <files>src/lib/agents/somnio-v4/somnio-v4-agent.ts</files>
  <read_first>
    Read somnio-v4-agent.ts lines 461-527 (guard R0/R1 block — after existing 'guard blocked' event emit at line 465, before the return at 491).
    Read lines 314-340 (vision no_match handoff — before the return).
    Read lines 224-249 (vision error handoff — before the return).
    Read lines 800-819 (resolveLowSlot — after the 'handoff_low_confidence_fallback' emit at 807, before the handoffSlots.push at 815).
    Read src/lib/agents/somnio-v4/observability.ts for the recordV4Event signature.
    Read RESEARCH.md §Q3 (event consolidation recommendation: emit NEW handoff_suggested, keep existing events).
    Read CONTEXT.md D-02 (do NOT emit for interrupted_at_ckpt_* reasons).
    Read CONTEXT.md D-08 (R0/R1 explicit ask: inject minimal ack ProcessedMessage).
  </read_first>
  <action>
**Part A — Guard R0/R1 block: emit handoff_suggested + inject R0/R1 ack**

After the existing 'guard blocked' recordEvent (line 465) and before the `return` at line 491, add:

```typescript
// v4-handoff-soft-signal (D-03): emit structured handoff signal for guard R0/R1.
recordV4Event('handoff_suggested', {
  sessionId: input.sessionId ?? null,
  conversationId: input.conversationId ?? null,
  turnId: input.turnId ?? null,
  source: 'somnio-v4',
  layer: 'comprehension',
  gate: 'guard_r0_r1',
  reason: guardResult.decision.reason,
  topic: undefined,
  createdAt: new Date().toISOString(),
})
```

Then, modify the return at line 491 to inject a minimal ack message (D-08 sub-decision: explicit human request gets a minimal acknowledgment, NOT silence).

Change `messages: []` in the guard return to inject a synthetic ack:
```typescript
// D-08: For explicit human asks (R0/R1), inject a minimal ack.
// This is NOT a catalog template — it's a hardcoded synthetic ProcessedMessage
// added to ragMessages so the send loop delivers it as a rag:handoff_ack message.
// In soft mode, no handoff_humano is sent (executeHandoff is suppressed in webhook-processor).
const handoffAckMessage: ProcessedMessage = {
  templateId: 'rag:handoff_ack',
  content: 'Entendido, un asesor te contactará en breve.',
  contentType: 'texto',
  delayMs: 0,
  priority: 'CORE',
}
```

Add `templates: [handoffAckMessage]` to the guard R0/R1 return object (add after `messages: []`):
```typescript
return {
  success: true,
  messages: [],
  templates: [handoffAckMessage],  // ADD THIS
  newMode: 'handoff',
  requiresHuman: true,
  // ... rest of existing fields unchanged
}
```

IMPORTANT: Check the V4AgentOutput type to confirm `templates` is a valid field. If V4AgentOutput doesn't have a `templates` field (it might only exist on the output after resolveLowSlot), then skip the template injection and use silence instead (silence is acceptable per D-08, and the signal/note in Plan 02 will still make the handoff visible to the operator). Do NOT break the type contract to add this — if templates is absent from the R0/R1 return shape, leave messages:[] and move on. Make a code comment documenting the choice.

**Part B — Vision no_match handoff (lines 314-340): emit handoff_suggested**

Before the `return` block at line 324, add:
```typescript
// v4-handoff-soft-signal (D-03): emit structured handoff signal for vision no_match.
recordV4Event('handoff_suggested', {
  sessionId: input.sessionId ?? null,
  conversationId: input.conversationId ?? null,
  turnId: input.turnId ?? null,
  source: 'somnio-v4',
  layer: 'comprehension',
  gate: 'vision',
  reason: handoffReason,  // already defined at line 315: `imagen ${categoria} — ${descripcion}`
  topic: undefined,
  createdAt: new Date().toISOString(),
})
```

**Part C — Vision error handoff (lines 224-249): emit handoff_suggested**

Before the `return` block at line 234, add:
```typescript
// v4-handoff-soft-signal (D-03): vision sub-loop error → handoff signal.
const visionErrReason = `imagen producto/página — ${descripcion} (error: ${errDesc})`
recordV4Event('handoff_suggested', {
  sessionId: input.sessionId ?? null,
  conversationId: input.conversationId ?? null,
  turnId: input.turnId ?? null,
  source: 'somnio-v4',
  layer: 'comprehension',
  gate: 'vision',
  reason: visionErrReason,
  topic: undefined,
  createdAt: new Date().toISOString(),
})
```

**Part D — resolveLowSlot / handoffSlots.push (lines 807-818): emit handoff_suggested**

The 'handoff_low_confidence_fallback' event is emitted at line 807. KEEP IT (additive — do not remove). After it (and before `handoffSlots.push` at line 815), add the new event:

```typescript
// v4-handoff-soft-signal (D-03): emit per-slot handoff signal.
// D-02: do NOT emit for interrupted_at_ckpt_* reasons (they are interruption artifacts).
if (!outcome.reason?.startsWith('interrupted_at_ckpt_')) {
  const gate: EngineOutput['handoffSignal'] extends undefined
    ? never
    : NonNullable<EngineOutput['handoffSignal']>['gate'] =
    outcome.reason?.startsWith('low_response_confidence') ? 'low_confidence'
    : outcome.reason?.startsWith('binary_backstop_') ? 'binary_backstop'
    : outcome.reason?.startsWith('escalation_trigger_match:') ? 'escalation_trigger'
    : outcome.reason?.startsWith('nunca_decir_violation:') ? 'nunca_decir'
    : 'no_kb'
  recordV4Event('handoff_suggested', {
    sessionId: input.sessionId ?? null,
    conversationId: input.conversationId ?? null,
    turnId: input.turnId ?? null,
    source: 'somnio-v4',
    layer: 'subloop',
    gate,
    reason: outcome.reason ?? 'unknown',
    topic: outcome.sourceTopic ?? undefined,
    createdAt: new Date().toISOString(),
  })
}
```

Note: The type annotation for `gate` in the local variable is verbose — simplify to:
```typescript
type HandoffGate = NonNullable<EngineOutput['handoffSignal']>['gate']
const gate: HandoffGate = ...
```
Import `EngineOutput` at the top of the file if not already imported.

**Import check:** Verify `recordV4Event` is already imported from `./observability`. If not, add:
```typescript
import { recordV4Event } from './observability'
```
Also verify `EngineOutput` import from `@/lib/agents/engine/types` if using the HandoffGate type.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -30 && npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts src/lib/agents/somnio-v4/__tests__/vision-branch.test.ts src/lib/agents/somnio-v4/__tests__/smoke-hybrid.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>
    - `grep -n "handoff_suggested" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns at least 3 emit sites (guard R0/R1, vision no_match, vision error, resolveLowSlot).
    - `grep -n "handoff_low_confidence_fallback" src/lib/agents/somnio-v4/somnio-v4-agent.ts` still returns 1 match (it was not removed).
    - tsc exits 0.
    - The three named test files pass (somnio-v4-agent.test.ts, vision-branch.test.ts, smoke-hybrid.test.ts).
    Note: Some tests that assert `newMode === 'handoff'` on the agent output may need NO changes (the agent still returns newMode:'handoff'; it's the runner that no longer calls storage.handoff). Tests on the runner behavior may need updating in Task 4.
  </done>
</task>

<task type="auto">
  <name>Task 4: Gate webhook-processor executeHandoff on !handoffSuggested + update runner tests</name>
  <files>src/lib/agents/production/webhook-processor.ts, src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts, src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts, src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts, src/lib/agents/engine/__tests__/v4-runner-error-message.test.ts</files>
  <read_first>
    Read webhook-processor.ts lines 1078-1103 (the executeHandoff block — section "11. Check agent still enabled").
    Read RESEARCH.md §Q2 Option 1 (gate on handoffSuggested flag, NOT on agentId).
    Read RESEARCH.md Pitfall 1 (Regla 6 — the guard gates shared code; existing agents never set handoffSuggested).
    Read RESEARCH.md §Q2 Open Question 2 (setConversationAgentOverride is inside executeHandoff — suppressing executeHandoff also suppresses the toggle, which is correct in soft mode).
    Read the three engine test files to understand what handoff-related assertions they contain.
    Read src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts lines around 291 and 363 (tests that assert newMode='handoff') — these test the AGENT output, not the runner behavior, so they may not need changes.
  </read_first>
  <action>
**Part A — webhook-processor.ts: gate the executeHandoff block on !result.handoffSuggested**

Replace the current block at lines 1080-1102:
```typescript
// CURRENT (fires for ALL agents):
if (result.success && result.newMode === 'handoff') {
  const stillEnabled = await isAgentEnabledForConversation(...)
  if (stillEnabled) {
    try { await executeHandoff(...) } catch { ... }
  }
}
```

Replace with TWO gated branches:
```typescript
// v4-handoff-soft-signal: HARD path — existing agents (v3/godentist/recompra/pw-confirmation/varixcenter).
// These agents never set handoffSuggested → this branch fires unchanged for them.
if (result.success && result.newMode === 'handoff' && !result.handoffSuggested) {
  const stillEnabled = await isAgentEnabledForConversation(
    conversationId,
    workspaceId,
    'conversational'
  )
  if (stillEnabled) {
    try {
      const config = await getWorkspaceAgentConfig(workspaceId)
      const { executeHandoff } = await import('./handoff-handler')
      await executeHandoff(conversationId, workspaceId, {
        handoffMessage: config?.handoff_message ?? 'Regalame 1 min, ya te comunico con un asesor',
      })
    } catch (handoffError) {
      logger.error(
        { error: handoffError, conversationId },
        'Handoff execution failed'
      )
    }
  }
}

// v4-handoff-soft-signal: SOFT path — somnio-sales-v4 (D-04).
// Inbox note insert happens in Plan 02. This skeleton is the guard that
// prevents executeHandoff from firing on v4 handoff outcomes.
// The inbox note will be added here in Plan 02 (this comment is a placeholder).
if (result.success && result.newMode === 'handoff' && result.handoffSuggested) {
  logger.info(
    { conversationId, handoffSignal: result.handoffSignal },
    'v4 soft handoff signal — executeHandoff suppressed (inbox note pending Plan 02)'
  )
}
```

Regla 6 verification: the hard path now requires `!result.handoffSuggested`. Since existing agents (v3/godentist/recompra/pw-confirmation/varixcenter) never set handoffSuggested on their EngineOutput (they use different runners that don't set it), this flag is undefined for them → `!undefined` is `true` → the hard path fires exactly as before for those agents.

**Part B — Update runner tests that assert storage.handoff was called**

Read the three test files. If any test mocks `storageAdapter.handoff` and asserts it WAS called on a handoff outcome, update the assertion to assert it was NOT called. Also add assertions that `result.handoffSuggested === true` and `result.handoffSignal` is defined.

Specifically: if somnio-v4-agent.test.ts or the engine test files have `expect(mockStorage.handoff).toHaveBeenCalled()` style assertions for v4 handoff paths → flip them to `expect(mockStorage.handoff).not.toHaveBeenCalled()` and add `expect(result.handoffSuggested).toBe(true)`.

If no test currently asserts `storage.handoff` was called for v4 (likely — the engine test files focus on restart/Path-B behavior per the test names), then no changes are needed and this part is a no-op.
  </action>
  <verify>
    <automated>cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit 2>&1 | head -20 && npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/engine/__tests__/ src/lib/agents/interruption-system-v2/__tests__/ 2>&1 | tail -40</automated>
  </verify>
  <done>
    - `grep -n "handoffSuggested" src/lib/agents/production/webhook-processor.ts` returns at least 2 matches (the !handoffSuggested guard + the soft branch condition).
    - `grep -n "executeHandoff" src/lib/agents/production/webhook-processor.ts` returns exactly 1 match (inside the !handoffSuggested branch).
    - Regla 6 grep gate: `grep -A5 "!result.handoffSuggested" src/lib/agents/production/webhook-processor.ts | grep -c "executeHandoff"` returns 1.
    - All three test suites pass.
    - tsc exits 0.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| v4 agent output → runner | The `handoffSuggested` flag is set by the runner, not received from untrusted input |
| runner → webhook-processor | `result.handoffSuggested` is an internal engine field; it cannot be spoofed by external callers |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hs-01 | Spoofing | EngineOutput.handoffSuggested | accept | Field set internally by v4-production-runner.ts only; no external input path to this field |
| T-hs-02 | Repudiation | handoff_suggested observability event | accept | Event written to agent_observability_events with sessionId/turnId; sufficient audit trail |
| T-hs-03 | Elevation of Privilege | !handoffSuggested guard in webhook-processor | mitigate | Existing agents never set handoffSuggested; guard is `&& !result.handoffSuggested` — undefined evaluates to false → hard path fires; tested via Regla 6 grep gate |
</threat_model>

<verification>
Run after all tasks complete:

```bash
# Type-check
cd /mnt/c/Users/Usuario/Proyectos/morfx-new && npx tsc --noEmit

# Full v4 + engine + interruption test suites
npx vitest run src/lib/agents/somnio-v4/__tests__/ src/lib/agents/engine/__tests__/ src/lib/agents/interruption-system-v2/__tests__/

# Regla 6: existing agents still call executeHandoff
grep -A5 "!result.handoffSuggested" src/lib/agents/production/webhook-processor.ts | grep "executeHandoff"

# Soft path present
grep -c "result.handoffSuggested" src/lib/agents/production/webhook-processor.ts

# storage.handoff removed from runner
grep -n "storage\.handoff" src/lib/agents/engine/v4-production-runner.ts

# handoff_suggested emitted in agent
grep -c "handoff_suggested" src/lib/agents/somnio-v4/somnio-v4-agent.ts

# handoff_low_confidence_fallback still present (additive check)
grep -c "handoff_low_confidence_fallback" src/lib/agents/somnio-v4/somnio-v4-agent.ts
```
</verification>

<success_criteria>
- EngineOutput has handoffSuggested?: boolean and handoffSignal?: {reason, gate, topic?} fields
- v4-production-runner.ts mapResult sets handoffSuggested:true + handoffSignal when output.newMode === 'handoff' and !suppressTurnEffects
- v4-production-runner.ts commitTurn no longer calls storage.handoff() or clearPendingTemplates() (removed)
- webhook-processor.ts: executeHandoff is gated on !result.handoffSuggested (existing agents unaffected); soft branch skeleton is present for Plan 02
- handoff_suggested events emitted at guard R0/R1, vision no_match, vision error, resolveLowSlot (all non-interrupted outcomes)
- handoff_low_confidence_fallback still emitted (not removed)
- D-02 guard present: resolveLowSlot does not emit handoff_suggested when reason starts with interrupted_at_ckpt_
- tsc --noEmit exits 0
- All v4 + engine test suites pass
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-handoff-soft-signal/v4-handoff-soft-signal-01-SUMMARY.md` using the summary template.
</output>
