---
phase: v3-state-machine
plan: 02
type: execute
wave: 2
depends_on: ["sm-01"]
files_modified:
  - src/lib/agents/somnio-v3/decision.ts
  - src/lib/agents/somnio-v3/ingest.ts
  - src/lib/agents/somnio-v3/response.ts
  - src/lib/agents/somnio-v3/types.ts
autonomous: true

must_haves:
  truths:
    - "decision.ts uses guards + transition table instead of R0-R9 waterfall"
    - "Ingest returns SystemEvent instead of autoTrigger string"
    - "response.ts no longer returns mostradoUpdates array"
    - "IngestResult type has systemEvent field instead of autoTrigger"
  artifacts:
    - path: "src/lib/agents/somnio-v3/decision.ts"
      provides: "New decide() using guards + transition table"
      exports: ["decide"]
    - path: "src/lib/agents/somnio-v3/ingest.ts"
      provides: "evaluateIngest returning SystemEvent"
      exports: ["evaluateIngest"]
    - path: "src/lib/agents/somnio-v3/response.ts"
      provides: "composeResponse without mostradoUpdates"
      exports: ["composeResponse"]
  key_links:
    - from: "src/lib/agents/somnio-v3/decision.ts"
      to: "src/lib/agents/somnio-v3/guards.ts"
      via: "imports checkGuards"
      pattern: "import.*checkGuards.*from.*guards"
    - from: "src/lib/agents/somnio-v3/decision.ts"
      to: "src/lib/agents/somnio-v3/transitions.ts"
      via: "imports resolveTransition"
      pattern: "import.*resolveTransition.*from.*transitions"
    - from: "src/lib/agents/somnio-v3/decision.ts"
      to: "src/lib/agents/somnio-v3/phase.ts"
      via: "imports derivePhase"
      pattern: "import.*derivePhase.*from.*phase"
---

<objective>
Rewrite the decision engine to use the state machine and refactor ingest/response to match.

Purpose: This is the core behavior change. decision.ts gets rewritten from R0-R9 waterfall to guards + phase derivation + transition table lookup. ingest.ts stops returning autoTrigger strings and returns SystemEvent objects instead. response.ts drops mostradoUpdates (action registration moves to single point in Plan 03).

Output: 3 files rewritten/refactored. Note: somnio-v3-agent.ts will NOT compile after this plan because it still references the old interfaces. Plan 03 fixes that.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-acciones-module/ANALYSIS.md
@.planning/standalone/v3-acciones-module/RESEARCH.md
@.planning/standalone/v3-acciones-module/sm-01-SUMMARY.md
@src/lib/agents/somnio-v3/decision.ts
@src/lib/agents/somnio-v3/ingest.ts
@src/lib/agents/somnio-v3/response.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite decision.ts and update IngestResult type</name>
  <files>src/lib/agents/somnio-v3/decision.ts, src/lib/agents/somnio-v3/types.ts</files>
  <action>
  **types.ts change — Update IngestResult:**

  Change the `IngestResult` interface to replace `autoTrigger` with `systemEvent`:

  ```typescript
  export interface IngestResult {
    action: IngestAction
    timerSignal?: TimerSignal
    /** System event emitted by ingest (replaces autoTrigger) */
    systemEvent?: SystemEvent
  }
  ```

  Remove the old `autoTrigger` field. Also update `ResponseResult` to remove `mostradoUpdates`:

  ```typescript
  export interface ResponseResult {
    messages: ProcessedMessage[]
    templateIdsSent: string[]
  }
  ```

  And update `V3AgentOutput.ingestInfo` to use systemEvent:

  ```typescript
  ingestInfo?: {
    action: string
    systemEvent?: { type: string; [k: string]: unknown }
  }
  ```

  **decision.ts — FULL REWRITE:**

  Replace the entire file with a new implementation that:

  1. Imports `checkGuards` from `./guards`
  2. Imports `derivePhase` from `./phase`
  3. Imports `resolveTransition`, `systemEventToKey` from `./transitions`
  4. Imports `NEVER_SILENCE_INTENTS` from `./constants`

  New `decide()` function signature stays the same for now:
  ```typescript
  export function decide(
    analysis: MessageAnalysis,
    state: AgentState,
    gates: Gates,
    ingestResult: IngestResult,
  ): Decision
  ```

  Logic flow:

  ```
  1. If ingestResult has systemEvent:
     - Convert to key via systemEventToKey()
     - Derive phase from state.accionesEjecutadas
     - Look up in transition table
     - If match: convert TransitionOutput to Decision and return
     - If no match: log warning, fall through

  2. If ingestResult.action === 'ask_ofi_inter':
     - Return respond decision with ['ask_ofi_inter'] (same as current)

  3. Run guards (checkGuards):
     - If blocked: return the guard's decision

  4. Derive phase from state.accionesEjecutadas

  5. Handle acknowledgment special case:
     - If is_acknowledgment AND intent is not in NEVER_SILENCE_INTENTS:
       - Determine ack sub-type:
         * If phase === 'confirming' AND positive ack: use on='acknowledgment_positive'
         * If phase === 'promos_shown' AND !packElegido: fall through to R9 (skip table)
         * Else: use on='acknowledgment'
       - Look up in transition table with the ack sub-type
       - If match with empty templateIntents: fall through to R9 (this handles the promos_shown exception)
       - If match: convert to Decision and return

  6. Look up intent in transition table:
     resolveTransition(phase, analysis.intent.primary, state, gates)
     - If match: convert TransitionOutput to Decision and return

  7. Fallback (R9 equivalent):
     - Respond with intent + secondary intent as templateIntents
  ```

  Converting TransitionOutput to Decision:
  ```typescript
  function transitionToDecision(action: TipoAccion, output: TransitionOutput): Decision {
    return {
      action: action === 'crear_orden' ? 'create_order'
            : action === 'handoff' ? 'handoff'
            : action === 'silence' ? 'silence'
            : 'respond',
      templateIntents: output.templateIntents.length > 0 ? output.templateIntents : undefined,
      extraContext: output.extraContext,
      timerSignal: output.timerSignal,
      enterCaptura: output.enterCaptura,
      reason: output.reason,
    }
  }
  ```

  IMPORTANT: The `transitionToDecision` function maps TipoAccion to DecisionAction. Only 4 DecisionAction values exist: 'respond', 'silence', 'handoff', 'create_order'. All other TipoAccion values (ofrecer_promos, mostrar_confirmacion, pedir_datos, etc.) map to DecisionAction='respond'.

  Also export the `transitionToDecision` helper (Plan 03 needs it for the system event second-pass).

  Remove all old R0-R9 code, `decideConfirmacion`, `hasShownPromos`, `hasShownResumen`, `isPositiveAck`, `getResumenIntent` helpers. They are now handled by guards.ts, phase.ts, and transitions.ts.

  Keep the `isPositiveAck` helper in decision.ts since it's needed for ack sub-type detection. Rename it private if desired.
  </action>
  <verify>The file should compile in isolation (`npx tsc --noEmit src/lib/agents/somnio-v3/decision.ts` will fail because somnio-v3-agent.ts is broken, but decision.ts itself should have no internal errors). Check that guards, phase, and transitions imports resolve.</verify>
  <done>
  - decision.ts uses checkGuards -> derivePhase -> resolveTransition flow
  - No R0-R9 waterfall code remains
  - IngestResult.autoTrigger replaced with IngestResult.systemEvent
  - ResponseResult.mostradoUpdates removed
  - V3AgentOutput.ingestInfo updated
  - transitionToDecision exported for use in Plan 03
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor ingest.ts and response.ts</name>
  <files>src/lib/agents/somnio-v3/ingest.ts, src/lib/agents/somnio-v3/response.ts</files>
  <action>
  **ingest.ts — Replace autoTrigger with SystemEvent:**

  Change the auto-trigger section (lines 56-74) to emit SystemEvent instead of autoTrigger strings:

  OLD:
  ```typescript
  if (gates.datosCompletos && gates.packElegido && !promosMostradas(state)) {
    return {
      action: 'respond',
      autoTrigger: 'mostrar_confirmacion',
      timerSignal: { type: 'cancel', reason: 'datos completos + pack → confirmacion' },
    }
  }
  if (gates.datosCompletos && !gates.packElegido && !promosMostradas(state)) {
    return {
      action: 'respond',
      autoTrigger: 'ofrecer_promos',
      timerSignal: { type: 'cancel', reason: 'datos completos → promos' },
    }
  }
  ```

  NEW:
  ```typescript
  if (gates.datosCompletos && !promosMostradas(state)) {
    return {
      action: 'respond',
      systemEvent: { type: 'ingest_complete', result: 'datos_completos' },
      timerSignal: { type: 'cancel', reason: 'datos completos → system event' },
    }
  }
  ```

  Note: The two separate autoTrigger cases collapse into ONE ingest_complete event. The transition table handles the pack/no-pack distinction via conditions.

  Also change the ofi_inter route to emit a system event:

  OLD:
  ```typescript
  if (!state.ofiInter && shouldAskOfiInter(state, prevState)) {
    return { action: 'ask_ofi_inter' }
  }
  ```

  NEW:
  ```typescript
  if (!state.ofiInter && shouldAskOfiInter(state, prevState)) {
    return {
      action: 'respond',
      systemEvent: { type: 'ingest_complete', result: 'ciudad_sin_direccion' },
    }
  }
  ```

  Note: `action: 'ask_ofi_inter'` IngestAction is no longer needed since it's now a system event. Update `IngestAction` type in types.ts to remove `'ask_ofi_inter'`:
  ```typescript
  export type IngestAction = 'silent' | 'respond'
  ```

  Keep the rest of ingest.ts unchanged (captura mode routing, timer level evaluation, helpers).

  **response.ts — Remove mostradoUpdates:**

  1. Remove the entire `mostradoUpdates` section (lines 137-149).
  2. Change the return to only include `messages` and `templateIdsSent`:
  ```typescript
  return {
    messages,
    templateIdsSent,
  }
  ```
  3. Update `emptyResult()`:
  ```typescript
  function emptyResult(): ResponseResult {
    return {
      messages: [],
      templateIdsSent: [],
    }
  }
  ```
  </action>
  <verify>Check that ingest.ts and response.ts have no internal type errors. The project will NOT fully compile yet because somnio-v3-agent.ts still references the old interfaces (autoTrigger, mostradoUpdates, ask_ofi_inter). This is expected — Plan 03 fixes it.</verify>
  <done>
  - ingest.ts emits SystemEvent objects instead of autoTrigger strings
  - ingest.ts collapses two autoTrigger cases into one ingest_complete event
  - IngestAction type simplified to 'silent' | 'respond'
  - response.ts no longer tracks or returns mostradoUpdates
  - ResponseResult interface has no mostradoUpdates field
  </done>
</task>

</tasks>

<verification>
- decision.ts imports from guards.ts, phase.ts, transitions.ts
- decision.ts has NO R0-R9 code — only guard check, phase derivation, transition lookup, fallback
- ingest.ts returns SystemEvent, not autoTrigger strings
- response.ts returns only messages + templateIdsSent
- Note: `npx tsc --noEmit` will show errors in somnio-v3-agent.ts because it still uses old interfaces — this is EXPECTED and fixed in Plan 03
</verification>

<success_criteria>
- decide() function uses guards + derivePhase + resolveTransition
- All R0-R9 logic is now expressed through the transition table (from Plan 01)
- IngestResult.systemEvent replaces IngestResult.autoTrigger
- ResponseResult has no mostradoUpdates
- transitionToDecision is exported for Plan 03
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-acciones-module/sm-02-SUMMARY.md`
</output>
