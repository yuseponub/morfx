---
phase: v3-state-machine
plan: 03
type: execute
wave: 3
depends_on: ["sm-01", "sm-02"]
files_modified:
  - src/lib/agents/somnio-v3/somnio-v3-agent.ts
  - src/lib/agents/somnio-v3/state.ts
  - src/lib/agents/somnio-v3/types.ts
autonomous: true

must_haves:
  truths:
    - "accionesEjecutadas stores AccionRegistrada[] objects, not strings"
    - "Only ONE action registration point exists (after successful response composition)"
    - "SystemEvent from ingest triggers a second-pass through the transition table within the same turn"
    - "computeMode() still works as compatibility layer for sandbox timer logic"
    - "Old string[] format in existing sessions auto-migrates to AccionRegistrada[] on deserialize"
    - "forceIntent from V3AgentInput is translated to SystemEvent at pipeline entry"
  artifacts:
    - path: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      provides: "Refactored pipeline with single action registration and SystemEvent handling"
      exports: ["processMessage"]
    - path: "src/lib/agents/somnio-v3/state.ts"
      provides: "Backward-compatible serialization for AccionRegistrada[]"
      exports: ["serializeState", "deserializeState"]
    - path: "src/lib/agents/somnio-v3/types.ts"
      provides: "AgentState.accionesEjecutadas typed as AccionRegistrada[]"
      contains: "accionesEjecutadas: AccionRegistrada[]"
  key_links:
    - from: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      to: "src/lib/agents/somnio-v3/transitions.ts"
      via: "systemEventToKey + resolveTransition for second-pass"
      pattern: "systemEventToKey.*resolveTransition"
    - from: "src/lib/agents/somnio-v3/somnio-v3-agent.ts"
      to: "src/lib/agents/somnio-v3/decision.ts"
      via: "transitionToDecision for system event results"
      pattern: "transitionToDecision"
    - from: "src/lib/agents/somnio-v3/state.ts"
      to: "src/lib/agents/somnio-v3/types.ts"
      via: "AccionRegistrada type for serialize/deserialize"
      pattern: "AccionRegistrada"
---

<objective>
Wire the pipeline together: single action registration, SystemEvent second-pass, backward-compatible serialization, and forceIntent translation.

Purpose: This is the integration plan that makes everything compile and work end-to-end. After this plan, the v3 agent in sandbox uses the state machine instead of the waterfall, existing sessions auto-migrate, and the sandbox timer system still works through computeMode compatibility.

Output: Working v3 sandbox agent with state machine decision engine.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/v3-acciones-module/ANALYSIS.md
@.planning/standalone/v3-acciones-module/RESEARCH.md
@.planning/standalone/v3-acciones-module/sm-01-SUMMARY.md
@.planning/standalone/v3-acciones-module/sm-02-SUMMARY.md
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/engine-v3.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update AgentState type and backward-compatible serialization</name>
  <files>src/lib/agents/somnio-v3/types.ts, src/lib/agents/somnio-v3/state.ts</files>
  <action>
  **types.ts — Change AgentState.accionesEjecutadas type:**

  ```typescript
  export interface AgentState {
    // ... all other fields stay the same ...
    accionesEjecutadas: AccionRegistrada[]   // WAS: string[]
    // ...
  }
  ```

  Also add `systemEvent?: SystemEvent` to `V3AgentInput` (keep `forceIntent?: string` for backward compat):
  ```typescript
  export interface V3AgentInput {
    // ... existing fields ...
    forceIntent?: string
    systemEvent?: SystemEvent  // NEW: typed system event (preferred over forceIntent)
  }
  ```

  **state.ts — Backward-compatible serialization:**

  1. Update `createInitialState()` — `accionesEjecutadas` is already `[]`, type will match.

  2. Update `serializeState()` — serialize AccionRegistrada[] to JSON:
  ```typescript
  datosCapturados[`${V3_META_PREFIX}accionesEjecutadas`] = JSON.stringify(state.accionesEjecutadas)
  ```
  This already works since JSON.stringify handles objects.

  3. Update `deserializeState()` — handle BOTH old string[] and new AccionRegistrada[] format:
  ```typescript
  // Restore acciones ejecutadas (backward compatible)
  try {
    const raw = datosCapturados[`${V3_META_PREFIX}accionesEjecutadas`]
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) {
          state.accionesEjecutadas = []
        } else if (typeof parsed[0] === 'string') {
          // OLD FORMAT: string[] -> convert to AccionRegistrada[]
          state.accionesEjecutadas = parsed.map((tipo: string) => ({
            tipo: tipo as TipoAccion,
            turno: 0,
            origen: 'bot' as const,
          }))
        } else {
          // NEW FORMAT: AccionRegistrada[]
          state.accionesEjecutadas = parsed
        }
      }
    }
  } catch { /* keep default */ }
  ```

  Add `import type { AccionRegistrada, TipoAccion } from './types'` to state.ts imports.

  4. Update `computeGates`, `camposFaltantes`, etc. — these don't reference accionesEjecutadas, so no changes needed.

  5. Update `mergeAnalysis` — the line `accionesEjecutadas: [...state.accionesEjecutadas]` will work since it's spreading AccionRegistrada[].

  6. **Helper functions in state.ts** — Add a helper for action lookup since we changed from string[] to AccionRegistrada[]:
  ```typescript
  /** Check if an action type has been executed */
  export function hasAction(acciones: AccionRegistrada[], tipo: TipoAccion): boolean {
    return acciones.some(a => a.tipo === tipo)
  }
  ```
  </action>
  <verify>Check that the type change propagates correctly. `mergeAnalysis` spreading should still work. `computeGates` doesn't touch accionesEjecutadas. The hasAction helper should be importable.</verify>
  <done>
  - AgentState.accionesEjecutadas is AccionRegistrada[]
  - deserializeState handles both old string[] and new AccionRegistrada[] formats
  - hasAction helper exported for clean lookups
  - V3AgentInput has optional systemEvent field
  </done>
</task>

<task type="auto">
  <name>Task 2: Refactor somnio-v3-agent.ts pipeline</name>
  <files>src/lib/agents/somnio-v3/somnio-v3-agent.ts</files>
  <action>
  This is the critical integration task. Refactor `processMessage()` to:

  **1. Add new imports:**
  ```typescript
  import { transitionToDecision } from './decision'
  import { derivePhase } from './phase'
  import { resolveTransition, systemEventToKey } from './transitions'
  import { hasAction } from './state'
  import type { AccionRegistrada, TipoAccion, SystemEvent } from './types'
  ```

  **2. Translate forceIntent to SystemEvent at pipeline entry (before C2):**

  Replace the current forceIntent block (lines 53-76) with:
  ```typescript
  // Translate forceIntent -> SystemEvent (backward compat layer)
  let systemEvent: SystemEvent | undefined = input.systemEvent
  if (!systemEvent && input.forceIntent) {
    switch (input.forceIntent) {
      case 'ofrecer_promos':
        systemEvent = { type: 'timer_expired', level: 2 }
        break
      case 'timer_sinpack':
        systemEvent = { type: 'timer_expired', level: 3 }
        break
      case 'timer_pendiente':
        systemEvent = { type: 'timer_expired', level: 4 }
        break
      default:
        // Unknown forceIntent — treat as synthetic analysis for backward compat
        break
    }
  }

  // If we have a system event, skip comprehension
  if (systemEvent) {
    analysis = {
      intent: { primary: 'otro' as any, secondary: 'ninguno' as const, confidence: 100, reasoning: `systemEvent: ${systemEvent.type}` },
      extracted_fields: { nombre: null, apellido: null, telefono: null, ciudad: null, departamento: null, direccion: null, barrio: null, correo: null, indicaciones_extra: null, cedula_recoge: null, pack: null, ofi_inter: null },
      classification: { category: 'irrelevante' as const, sentiment: 'neutro' as const, is_acknowledgment: false },
      negations: { correo: false, telefono: false, barrio: false },
    }
    tokensUsed = 0
  } else if (input.forceIntent) {
    // Legacy forceIntent that didn't map to a system event — synthetic analysis with intent
    analysis = { /* same synthetic analysis as current code but using input.forceIntent */ }
    tokensUsed = 0
  } else {
    // Normal: run comprehension
    // ... existing comprehension code ...
  }
  ```

  **3. Handle SystemEvent BEFORE decision engine (after ingest, replaces autoTrigger shortcut):**

  After ingest evaluation, if ingest returns a systemEvent OR we have a systemEvent from input:

  ```typescript
  // Determine effective system event: input systemEvent OR ingest systemEvent
  const effectiveEvent = systemEvent ?? ingestResult.systemEvent

  if (effectiveEvent) {
    // Route system event through transition table
    const phase = derivePhase(mergedState.accionesEjecutadas)
    const eventKey = systemEventToKey(effectiveEvent)
    const result = resolveTransition(phase, eventKey, mergedState, gates)

    if (result) {
      const decision = transitionToDecision(result.action, result.output)
      // Register action + compose response + return (same flow as normal decision below)
      // ... see below for action registration
    }
  }
  ```

  Actually, simpler approach: merge the system event into the decision flow. After computing the effective event, if it exists, pass it into `decide()` somehow. BUT `decide()` already handles ingestResult.systemEvent internally (from Plan 02). So the flow is:

  - If `systemEvent` from input (timer/forceIntent): the pipeline should route it through the transition table DIRECTLY (skip comprehension + ingest). This is the timer path.
  - If `ingestResult.systemEvent` exists: the `decide()` function already handles it (Plan 02 added this logic at the top of decide()).

  So the actual change for input system events is:

  After translating forceIntent to systemEvent, if we have an input-level systemEvent, we need to skip the normal decision flow and go directly to the transition table:

  ```typescript
  // Handle input-level system event (timer expired)
  let decision: Decision
  if (systemEvent) {
    const phase = derivePhase(mergedState.accionesEjecutadas)
    const eventKey = systemEventToKey(systemEvent)
    const result = resolveTransition(phase, eventKey, mergedState, gates)
    if (result) {
      decision = transitionToDecision(result.action, result.output)
    } else {
      // Fallback: unknown system event
      decision = { action: 'respond', templateIntents: ['otro'], reason: `Unknown system event: ${eventKey}` }
    }
  } else {
    // Normal flow: C6 Decision Engine (which internally handles ingest systemEvent)
    decision = decide(analysis, mergedState, gates, ingestResult)
  }
  ```

  **4. Remove the 3 old action write points and add single registration:**

  REMOVE write point 1 (lines 147-156): the `if (decision.action === 'respond' && decision.templateIntents)` block that pushes ofrecer_promos/mostrar_confirmacion.

  REMOVE write point 3 (lines 234-237): the `for (const action of responseResult.mostradoUpdates)` block.

  ADD single registration point after successful response composition:

  ```typescript
  // Register action (SINGLE registration point — D3)
  const actionToRegister = determineAction(decision, systemEvent, ingestResult)
  if (actionToRegister) {
    mergedState.accionesEjecutadas.push({
      tipo: actionToRegister,
      turno: mergedState.turnCount,
      origen: systemEvent ? 'timer'
            : ingestResult.systemEvent ? 'ingest'
            : 'bot',
    })
  }
  ```

  The `determineAction` helper maps Decision to TipoAccion:
  ```typescript
  function determineAction(
    decision: Decision,
    systemEvent: SystemEvent | undefined,
    ingestResult: IngestResult,
  ): TipoAccion | null {
    if (decision.action === 'create_order') return 'crear_orden'
    if (decision.action === 'handoff') return 'handoff'
    if (decision.action === 'silence') return 'silence'

    // For 'respond' decisions, determine from templateIntents
    const ti = decision.templateIntents ?? []
    if (ti.includes('promociones') || ti.includes('quiero_comprar')) return 'ofrecer_promos'
    if (ti.some(t => t.startsWith('resumen'))) return 'mostrar_confirmacion'
    if (ti.includes('pedir_datos') || ti.includes('captura_datos_si_compra')) return 'pedir_datos'
    if (ti.includes('ask_ofi_inter')) return 'ask_ofi_inter'
    if (ti.includes('no_interesa')) return 'no_interesa'
    if (ti.includes('rechazar') || ti.includes('no_confirmado')) return 'rechazar'
    if (ti.includes('confirmacion_orden')) return 'crear_orden'

    // R9 fallback (saludo, precio, etc.) — no action to register
    return null
  }
  ```

  **5. Keep computeMode() as compatibility layer:**

  Update `computeMode()` to work with AccionRegistrada[] instead of string[]:
  ```typescript
  function computeMode(state: AgentState): string {
    if (hasAction(state.accionesEjecutadas, 'crear_orden')) return 'orden_creada'
    if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
    if (hasAction(state.accionesEjecutadas, 'ofrecer_promos')) return 'promos'
    if (state.enCapturaSilenciosa) {
      return state.ofiInter ? 'captura_inter' : 'captura'
    }
    if (state.turnCount === 0) return 'nuevo'
    return 'conversacion'
  }
  ```

  **6. Update ingestInfo in output:**

  Replace `autoTrigger: ingestResult.autoTrigger` with `systemEvent: ingestResult.systemEvent ? { type: ingestResult.systemEvent.type, ...ingestResult.systemEvent } : undefined`.

  **7. Also update all references to `mergedState.accionesEjecutadas.includes('...')` or `.push('...')` with the new AccionRegistrada format** — these are in the old write points being removed, plus `computeMode` being updated.

  IMPORTANT: Do NOT change the V3AgentOutput interface shape. The `newMode`, `intentsVistos`, `templatesEnviados`, `datosCapturados`, `packSeleccionado` fields must remain the same for engine-v3.ts compatibility.
  </action>
  <verify>
  Run `npx tsc --noEmit` from project root — ALL files should compile now (the full project).
  Test with sandbox if possible: open sandbox, select v3 agent, send a message.
  </verify>
  <done>
  - Single action registration point after response composition
  - forceIntent translated to SystemEvent at pipeline entry
  - Input-level system events skip comprehension and go to transition table
  - Ingest system events handled by decide() internally
  - computeMode uses hasAction helper with AccionRegistrada[]
  - Old write points 1 and 3 removed, write point 2 (mostradoUpdates in response.ts) already removed in Plan 02
  - V3AgentOutput interface unchanged
  - Full project compiles
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with zero errors across the entire project
- `grep -r 'autoTrigger' src/lib/agents/somnio-v3/` returns zero matches (fully removed)
- `grep -r 'mostradoUpdates' src/lib/agents/somnio-v3/` returns zero matches (fully removed)
- `grep -c 'accionesEjecutadas.push' src/lib/agents/somnio-v3/somnio-v3-agent.ts` returns exactly 1 (single registration point)
- computeMode still returns correct mode strings for sandbox timer compatibility
- engine-v3.ts compiles without changes (V3AgentInput/V3AgentOutput backward compatible)
</verification>

<success_criteria>
- Project compiles cleanly with `npx tsc --noEmit`
- Only 1 action registration point exists in the entire v3 module
- forceIntent backward compat works (translated to SystemEvent)
- Old sessions deserialize correctly (string[] auto-migrates to AccionRegistrada[])
- computeMode compatibility layer works for sandbox timer system
- No references to autoTrigger or mostradoUpdates remain in v3 module
</success_criteria>

<output>
After completion, create `.planning/standalone/v3-acciones-module/sm-03-SUMMARY.md`
</output>
