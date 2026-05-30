---
phase: v4-hybrid-template-rag-turn
plan: 03
type: execute
wave: 2
depends_on: [01, 02]
files_modified:
  - src/lib/agents/somnio-v4/somnio-v4-agent.ts
  - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
autonomous: true
requirements: [D-02, D-03, D-04, D-05, D-07, D-08, D-11, T-1, T-2, T-4, T-6]
must_haves:
  truths:
    - "The exclusive early-return at somnio-v4-agent.ts:243-314 is replaced by a slot resolver that runs at the END (post-sales-track, post-gate-CRM)"
    - "A low intent escalates to RAG via runRagSubLoop with its slot-specific sub-query; a covered intent keeps its deterministic template"
    - "RAG text is injected as a synthetic ProcessedMessage (templateId 'rag:<topic>', CORE, delayMs 0), ordered primary→secondary (D-11)"
    - "Partial handoff: a resolved slot's messages are populated AND newMode='handoff'/requiresHuman=true when the other slot escalates to human (combiner never sets messages:[] when a slot resolved — R1-A)"
    - "An interrupt inside a RAG slot propagates errorMessage (Path A restart), NOT handoff (R1-B/R6-A)"
    - "RAG+RAG runs sequentially, 2 invocations (D-08/T-4); ledger atendido[] combines all slots in one commitTurn"
  artifacts:
    - path: src/lib/agents/somnio-v4/somnio-v4-agent.ts
      provides: "slot orchestration replacing the early-return; combined output build with single commitTurn"
    - path: src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
      provides: "tests for the 4 matrix cells, partial handoff, interrupt-not-handoff, ledger combine"
  key_links:
    - from: somnio-v4-agent.ts
      to: slots.ts computeSlots
      via: "per-intent coverage decision"
      pattern: "computeSlots"
    - from: somnio-v4-agent.ts
      to: sub-loop/index.ts runRagSubLoop (via runSubLoop)
      via: "per-low-slot RAG invocation with slot.ragQuery as userMessage"
      pattern: "runSubLoop"
---

<objective>
THE CORE OF THE PHASE. Replace the binary early-return (`somnio-v4-agent.ts:243-314` — escalate EVERYTHING to RAG based on the primary intent alone) with a per-intent slot resolver that runs at the END of the pipeline (T-1=(b): post-sales-track + post-gate-CRM). The deterministic track (sales-track, gate CRM, response-track) resolves the COVERED intents' templates; the slot resolver INJECTS RAG text only for the LOW intent(s); the combiner merges them in intent order and handles partial handoff.

Canonical case: "cuánto vale y lo puedo tomar si tengo apnea?" → response-track produces the precio template (covered primary), the slot resolver runs runRagSubLoop on secondary_query="puedo tomarlo si tengo apnea?" (low secondary) → one turn, no duplication.

Purpose: Generalize the lever to per-intent coverage (D-02/D-03) while preserving every effect the early-return has today (captureUnknownCase per low slot, per-slot observability, subLoopDebug, single combined ledger commitTurn, CKPTs) and NOT breaking the other 6 paths (guards R0/R1, CKPT-1/2, sales-track, gate CRM, crm_mutation/cas_reject — these never overlap the slot resolver per escalation.ts:49-64 + crm-gate.ts:338-353).
Output: refactored orchestrator with a single return point + unit tests for the matrix.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v4-hybrid-template-rag-turn/CONTEXT.md
@.planning/standalone/v4-hybrid-template-rag-turn/RESEARCH.md
@.planning/standalone/v4-hybrid-template-rag-turn/02-PLAN.md

<interfaces>
From src/lib/agents/somnio-v4/slots.ts (Plan 02 — consume this):
```ts
export function computeSlots(args: {...}): SlotPlan  // { primary: SlotDecision; secondary: SlotDecision | null }
// SlotDecision: { intent, coverage: 'covered'|'low', reason, ragQuery: string | null }
```

From src/lib/agents/somnio-v4/sub-loop/index.ts:
```ts
export async function runSubLoop(args: { reason: SubLoopReason; ctx: SubLoopContext; onDebug?: (p: SubLoopDebugPayload)=>void }): Promise<LoopOutcome>
// SubLoopContext.userMessage is the query the RAG answers (currently raw message; we pass slot.ragQuery).
// LoopOutcome.status: 'generated' (responseText, sourceTopic, responseConfidence) | 'no_match' (handoff) | 'template'.
// no_match with reason starting 'interrupted_at_ckpt_' = interrupt, NOT a real handoff.
```

From src/lib/agents/somnio-v4/types.ts:
```ts
interface ProcessedMessage { templateId: string; content: string; contentType: 'texto'|'imagen'; delayMs: number; priority: 'CORE'|'COMPLEMENTARIA'|'OPCIONAL' }
type Atendido =
  | { kind: 'template_intent'; intent: string; templateIds: string[] }
  | { kind: 'sales_action'; accion: TipoAccion; templateIds: string[] }
  | { kind: 'kb_topic'; topic: string; confidence: number; texto: string; turno: number }
  | { kind: 'handoff'; reason: string }
  | { kind: 'silence' }
interface V4AgentOutput { success; messages: string[]; templates?: ProcessedMessage[]; newMode?: string; requiresHuman?: boolean; errorMessage?: string; turnLedgerDims; ... }
```

Current flow landmarks in somnio-v4-agent.ts:
- early-return block: lines 243-314 (THE thing to remove/repurpose)
- closure `let capturedSubLoopDebug` at line 142 (reuse for subLoopDebug — T-6: keep last/escalated payload)
- guards R0/R1: 316-381 (unchanged)
- CKPT-2: 397-428 (unchanged)
- sales-track: 431-460 (unchanged)
- gate CRM runCrmGate: 472-490 (unchanged, additive)
- response-track resolveResponseTrack: 493-501 (Plan 04 gates the LOW template here; THIS plan passes slot coverage to it)
- happy-path final return (R3 ledger): 607-704 (the single return point to extend)
- mapOutcomeToAgentOutput: 901-1134 (RAG→output mapping reference; interrupt discriminator at 1002, kb_topic ledger at 1051)
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Compute slot plan early; remove the exclusive early-return; gate the LOW-slot escalation to run at the end</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts lines 138-314 (the whole top of processUserMessage incl. the early-return) and 607-704 (the final happy-path return)
    - src/lib/agents/somnio-v4/slots.ts (computeSlots from Plan 02)
    - src/lib/agents/somnio-v4/escalation.ts (decideSubLoopReason — still used for the primary's earlyReason event, but no longer to early-return)
    - RESEARCH.md §R2 (the slot-flow diagram — copy the structure)
  </read_first>
  <action>
Refactor `processUserMessage` so the slot resolution happens at the END (T-1=(b)), not at line 243.

(1) AFTER `const threshold = await getLowConfidenceThreshold()` (line 219), add the slot plan computation:
```ts
import { computeSlots, type SlotPlan } from './slots'
// ...
const slotPlan: SlotPlan = computeSlots({
  primaryIntent: analysis.intent.primary,
  primaryConfidence: analysis.intent.intent_confidence,
  secondaryIntent: analysis.intent.secondary,
  secondaryConfidence: analysis.intent.secondary_confidence ?? null,
  secondaryQuery: analysis.intent.secondary_query ?? null,
  rawMessage: input.message,
  threshold,
})
```

(2) KEEP the `decideSubLoopReason(...)` call at 222-228 and the `comprehension_completed_v4` event (230-241) — `earlyReason` is still useful for the event's `scaledToSubLoop`/`earlyReason` fields. But REMOVE the `if (earlyReason === 'low_confidence' || earlyReason === 'razonamiento_libre') { ... runSubLoop ... return mapOutcomeToAgentOutput(...) }` block (lines 243-314) ENTIRELY. The early-return is gone; the flow now always proceeds through guards → CKPT-2 → sales-track → gate CRM → response-track → slot resolver.

(3) Update the `scaledToSubLoop` field in the comprehension_completed_v4 event to reflect ANY low slot, not just the primary:
```ts
const anyLowSlot = slotPlan.primary.coverage === 'low' || slotPlan.secondary?.coverage === 'low'
// in the event: scaledToSubLoop: anyLowSlot,
```

(4) Guards R0/R1 (316-381) stay BEFORE the slot resolver and short-circuit as today (escape intents → handoff). No change to that block.

Do NOT touch CKPT-1, CKPT-2, sales-track, or the gate CRM call. Do NOT delete mapOutcomeToAgentOutput yet (Task 2 decides whether to reuse or inline its RAG-mapping logic).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "computeSlots" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns at least 1
    - `grep -c "if (earlyReason === 'low_confidence' || earlyReason === 'razonamiento_libre')" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 0 (early-return removed)
    - `grep -c "return mapOutcomeToAgentOutput" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 0 (no longer called from the early-return path; if Task 2 keeps the function for inline reuse it is invoked differently)
    - `grep -c "scaledToSubLoop: anyLowSlot" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>The early-return is gone; computeSlots runs after threshold lookup; the flow proceeds to the end for every non-guard turn.</done>
</task>

<task type="auto">
  <name>Task 2: Resolve LOW slots via sequential RAG + combine into the final output (single commitTurn)</name>
  <read_first>
    - src/lib/agents/somnio-v4/somnio-v4-agent.ts lines 492-704 (response-track call + happy-path return + R3 ledger build) and 901-1134 (mapOutcomeToAgentOutput — copy its kb_topic ledger entry shape from 1051-1063 and its interrupt discriminator from 1002-1009)
    - src/lib/agents/somnio-v4/sub-loop/index.ts lines 252-307 (runSubLoop entry + CKPT-3 interrupt outcome shape)
    - RESEARCH.md §R2 (resolveLowSlots + combineSlots pseudocode), §R4 (the synthetic ProcessedMessage literal), §R1 (partial handoff = populate templates + newMode='handoff')
  </read_first>
  <action>
After `resolveResponseTrack` (line 501) and the existing template bookkeeping (steps 12-13, lines 511-526), insert the slot resolver + combiner BEFORE the natural-silence check and final return. Build it as two inline helpers (or a local block) inside processUserMessage so it has access to closures:

(A) resolveLowSlots — for each slot where coverage==='low', run RAG SEQUENTIALLY (T-4 — NO Promise.all):
```ts
const ragMessages: ProcessedMessage[] = []      // synthetic RAG messages, keyed by slot order
const ragAtendido: Atendido[] = []
const handoffSlots: { intent: string; reason: string }[] = []
let interruptErrorMessage: string | null = null

async function resolveLowSlot(slot: SlotDecision, slotReason: 'low_confidence'|'razonamiento_libre'): Promise<void> {
  if (interruptErrorMessage) return  // short-circuit: a prior slot interrupted
  getCollector()?.recordEvent('pipeline_decision', 'subloop_low_confidence_invoked', {
    agent: SOMNIO_V4_AGENT_ID, sessionId: input.sessionId ?? null,
    reason: slotReason, confidence: ..., threshold, intent: slot.intent,
  })
  const outcome = await runSubLoop({
    reason: slotReason,
    ctx: {
      workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID,
      conversationId: input.sessionId ?? '', sessionId: input.sessionId ?? '',
      userMessage: slot.ragQuery ?? input.message,   // T-2: raw for primary, secondary_query for secondary
      recentMessages: input.history.slice(-4).map(m => ({ role: m.role, content: m.content })),
      lockHandle: input.lockHandle ?? null, lockChannel: input.lockChannel ?? null, lockIdentifier: input.lockIdentifier ?? null,
    },
    onDebug: (p) => { capturedSubLoopDebug = p },   // T-6: keep last/escalated payload
  })
  // R1-B / R6-A: interrupt → errorMessage (Path A restart), NOT handoff.
  if (outcome.status === 'no_match' && typeof outcome.reason === 'string' && outcome.reason.startsWith('interrupted_at_ckpt_')) {
    interruptErrorMessage = outcome.reason
    return
  }
  if (outcome.status === 'generated' && outcome.responseText && outcome.sourceTopic) {
    ragMessages.push({ templateId: `rag:${outcome.sourceTopic}`, content: outcome.responseText, contentType: 'texto', delayMs: 0, priority: 'CORE' })  // R4 + D-05
    ragAtendido.push({ kind: 'kb_topic', topic: outcome.sourceTopic, confidence: outcome.responseConfidence ?? 0, texto: outcome.responseText, turno: mergedState.turnCount })
    return
  }
  // no_match (real handoff) OR generated-with-null defensive → partial handoff for THIS slot
  const knowledgeQueried = (outcome.status === 'no_match' ? outcome.knowledgeQueried : null) ?? []
  void captureUnknownCase({ workspaceId: input.workspaceId || SOMNIO_WORKSPACE_ID, conversationId: input.sessionId ?? '', message: slot.ragQuery ?? input.message, intent: slot.intent, intentConfidence: ..., knowledgeQueried, reason: outcome.reason ?? 'unknown' })
  getCollector()?.recordEvent('pipeline_decision', 'handoff_low_confidence_fallback', { agent: SOMNIO_V4_AGENT_ID, sessionId: input.sessionId ?? null, conversationId: input.sessionId ?? '', knowledgeQueried, reason: outcome.reason, intent: slot.intent })
  handoffSlots.push({ intent: slot.intent, reason: outcome.reason ?? 'low_confidence_no_match' })
}

// Sequential: primary first, then secondary (D-11 order).
if (slotPlan.primary.coverage === 'low') await resolveLowSlot(slotPlan.primary, slotPlan.primary.reason as 'low_confidence'|'razonamiento_libre')
if (slotPlan.secondary && slotPlan.secondary.coverage === 'low') await resolveLowSlot(slotPlan.secondary, slotPlan.secondary.reason as 'low_confidence'|'razonamiento_libre')
```

(B) Interrupt short-circuit — if `interruptErrorMessage` is set, return the interrupt-discriminator output (same shape as CKPT-1/CKPT-2 returns at lines 193-208) so the runner triggers Path A restart:
```ts
if (interruptErrorMessage) {
  return { success: false, messages: [], errorMessage: interruptErrorMessage,
    intentsVistos: input.intentsVistos, templatesEnviados: input.templatesEnviados,
    datosCapturados: input.datosCapturados, packSeleccionado: input.packSeleccionado,
    accionesEjecutadas: input.accionesEjecutadas ?? [],
    turnLedgerDims: input.turnLedgerDims ?? { atendido: [], crmActions: [] },
    totalTokens: tokensUsed, shouldCreateOrder: false, timerSignals: [],
    subLoopDebug: capturedSubLoopDebug }
}
```

(C) combineSlots — merge response-track templates + ragMessages in intent order (D-11), and reconcile handoff:
- Build `combinedMessages: ProcessedMessage[]`. Order = primary slot output first, then secondary. For a covered slot, its contribution is the response-track templates already in `responseResult.messages` (response-track produces templates for covered intents; Plan 04 ensures it does NOT emit a template for a LOW intent). For a low slot, its contribution is the matching `ragMessages` entry (match by `rag:<topic>` membership; in practice append primary's RAG then secondary's RAG). Concretely: prepend/append the ragMessages to responseResult.messages respecting D-11 — when primary is low, its RAG comes first; when only secondary is low, RAG comes after the primary's covered template. Since ragMessages was pushed in [primary, secondary] order, a simple `const combinedMessages = primaryLow ? [...ragMessages, ...responseResult.messages] : [...responseResult.messages, ...ragMessages]` is acceptable for V1 (document this ordering choice; both-low → ragMessages already in order, responseResult empty).
- `const partialHandoff = handoffSlots.length > 0`
- newMode: `partialHandoff ? 'handoff' : computeMode(mergedState)`
- requiresHuman: `partialHandoff ? true : undefined`
- **R1-A GUARD:** when `combinedMessages.length > 0`, NEVER set messages:[] even if partialHandoff is true — the resolved slot's messages MUST be sent (runner sends output.templates in 5h BEFORE storage.handoff).
- ledger atendido[]: combine `atendidoR3` (covered sales_action/template_intent from existing R3 build) + `ragAtendido` (kb_topic per generated slot) + `handoffSlots.map(h => ({ kind: 'handoff', reason: h.reason }))`. Single `commitTurn(mergedState, ledger)` at the end.

(D) Extend the existing happy-path return (lines 645-704) to use `combinedMessages` + the reconciled newMode/requiresHuman/ledger. Replace `messages: responseResult.messages.map(m => m.content)` with `messages: combinedMessages.map(m => m.content)` and `templates: responseResult.messages` with `templates: combinedMessages`. Keep the single return point. The natural-silence branch (529-605) still applies ONLY when combinedMessages.length === 0 AND no handoffSlots (a pure-silence turn with no RAG and no handoff).

T-6: subLoopDebug keeps the LAST onDebug payload (the closure already does this — `capturedSubLoopDebug = p`); array support is deferred.
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "rag:\${outcome.sourceTopic}" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 1 (synthetic RAG ProcessedMessage with pseudo-id — R4)
    - `grep -c "priority: 'CORE'" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns at least 1 in the RAG message literal (D-05)
    - `grep -c "interrupted_at_ckpt_" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns at least 1 in the slot resolver (R1-B: interrupt → errorMessage)
    - `grep -c "handoffSlots" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns at least 3 (push + length check + ledger map)
    - `grep -cE "await runSubLoop\(" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns at least 1 (sequential calls via resolveLowSlot; NO Promise.all)
    - `grep -c "Promise.all" src/lib/agents/somnio-v4/somnio-v4-agent.ts` returns 0 (T-4 sequential)
    - `grep -c "commitTurn" src/lib/agents/somnio-v4/somnio-v4-agent.ts` shows the user happy-path commits exactly once (one commitTurn in the combined return path)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Low slots resolve sequentially via RAG; covered slots keep templates; combined output orders primary→secondary; partial handoff populates messages + newMode='handoff'; interrupt returns errorMessage; one commitTurn with combined atendido[].</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Unit tests for the 4-case matrix, partial handoff, and interrupt-not-handoff</name>
  <read_first>
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts (mirror its mocking of comprehend + runSubLoop + resolveResponseTrack; reuse its V4AgentInput fixture builder)
    - src/lib/agents/somnio-v4/__tests__/smoke-rag-a.test.ts (mock patterns for runSubLoop outcomes)
  </read_first>
  <behavior>
Mock `comprehend` to return a controlled analysis (set intent.primary/secondary + intent_confidence + secondary_confidence + secondary_query). Mock `runSubLoop` to return controlled LoopOutcomes. Mock `resolveResponseTrack` to return controlled templates for covered intents. Assert on the returned V4AgentOutput:
- covered+covered: runSubLoop NOT called; output.templates contains only response-track templates; newMode !== 'handoff'.
- covered+low: runSubLoop called ONCE with ctx.userMessage === secondary_query; output.templates contains the covered template THEN a `rag:<topic>` message (D-11 order); newMode !== 'handoff'.
- low+covered: runSubLoop called ONCE with ctx.userMessage === raw message (T-2); output has rag message BEFORE the covered template; ledger atendido has kb_topic + template_intent.
- low+low: runSubLoop called TWICE (sequential); two rag messages; ledger atendido has 2 kb_topic entries.
- partial handoff (covered+low where RAG returns no_match): output.templates NON-empty (the covered template) AND output.newMode === 'handoff' AND output.requiresHuman === true (R1-A — messages NOT emptied); ledger atendido has template_intent + handoff.
- interrupt mid-slot (low secondary returns no_match reason 'interrupted_at_ckpt_3_post_tooling'): output.success === false, output.errorMessage === 'interrupted_at_ckpt_3_post_tooling', output.newMode is NOT 'handoff' (R1-B/R6-A).
  </behavior>
  <action>
Add a `describe('hybrid slot resolver (v4-hybrid)', ...)` block. Use vitest `vi.mock` (respect the file's existing hoisting pattern — define mock fns at top level, not inside the factory, mirroring the existing tests in this file). Provide a helper to build the input + invoke `processMessage`. Assert exact field values per behavior above. For ordering assertions, check `output.templates.map(t => t.templateId)` against the expected sequence (e.g. `['precio', 'rag:contraindicaciones']`).
  </action>
  <verify>
    <automated>npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "hybrid slot resolver" src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` returns 1
    - At least 6 new `it(` cases covering the behaviors above
    - A test asserts `output.errorMessage === 'interrupted_at_ckpt_3_post_tooling'` with newMode not 'handoff'
    - A test asserts partial-handoff output.templates.length > 0 AND output.newMode === 'handoff'
    - `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` exits 0
  </acceptance_criteria>
  <done>All 4 matrix cells + partial handoff + interrupt-not-handoff are covered and green; sequential RAG (twice) verified for low+low.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| RAG sub-loop outcome → orchestrator output | LLM-decided handoff/generated text crosses into the turn's user-facing output and ledger |
| Interrupt signal (follower) → checkpoint inside RAG slot | Concurrent inbound message can interrupt mid-slot |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-v4hy-03 | Tampering | combineSlots output | mitigate | R1-A guard: never emit messages:[] when a slot resolved; resolved slot is sent before handoff (verified send-precedes-handoff in runner 5h→1123) |
| T-v4hy-04 | Repudiation | turn ledger atendido[] | mitigate | Single commitTurn with combined atendido[] (template_intent + kb_topic + handoff) is the canonical per-slot record |
| T-v4hy-05 | Elevation of Privilege | interrupt → handoff confusion | mitigate | R1-B: interrupt_at_ckpt_ propagates as errorMessage (Path A restart, discards turn), never a persisted handoff/mode change |
| T-v4hy-06 | DoS | sequential RAG×2 latency | accept | T-4 sequential; worst case low+low ~11-20s under lock TTL 45s; measured in Plan 05 smoke; v4 DORMANT |
</threat_model>

<verification>
- 4 matrix cells, partial handoff, interrupt-not-handoff all green.
- No Promise.all (T-4). One commitTurn on the user happy path.
- subLoopDebug captures last payload (T-6).
- tsc clean.
</verification>

<success_criteria>
- Early-return removed; slot resolver runs at the end (T-1=(b)).
- RAG injected as synthetic ProcessedMessage CORE, ordered primary→secondary (D-05/D-11).
- Partial handoff sends resolved slot + newMode='handoff' (D-07, R1-A).
- Interrupt → errorMessage not handoff (R1-B/R6-A).
- Sequential RAG×2 (D-08/T-4); combined ledger atendido[].
- `npx vitest run src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts` exits 0; `npx tsc --noEmit` exits 0.
</success_criteria>

<output>
After completion, create `.planning/standalone/v4-hybrid-template-rag-turn/03-SUMMARY.md`
</output>
