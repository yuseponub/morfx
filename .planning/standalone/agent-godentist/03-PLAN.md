---
phase: agent-godentist
plan: 03
type: execute
wave: 2
depends_on: ["agent-godentist-01"]
files_modified:
  - src/lib/agents/godentist/state.ts
  - src/lib/agents/godentist/guards.ts
  - src/lib/agents/godentist/phase.ts
autonomous: true

must_haves:
  truths:
    - "State merge extracts and normalizes dental client data from comprehension output"
    - "Gates are computed fresh every turn from current state"
    - "datosCriticos gate requires nombre + telefono + sede_preferida"
    - "Guards block on escape intents (asesor, reagendamiento, queja, cancelar_cita) and low confidence"
    - "Phase is derived from last significant action in accionesEjecutadas"
    - "7 phases correctly derived from action history"
  artifacts:
    - path: "src/lib/agents/godentist/state.ts"
      provides: "createInitialState, mergeAnalysis, computeGates, camposFaltantes, serializeState, deserializeState"
      min_lines: 120
    - path: "src/lib/agents/godentist/guards.ts"
      provides: "checkGuards function for escape intents and low confidence"
      min_lines: 20
    - path: "src/lib/agents/godentist/phase.ts"
      provides: "derivePhase function mapping actions to 7 phases"
      min_lines: 20
  key_links:
    - from: "src/lib/agents/godentist/state.ts"
      to: "src/lib/agents/godentist/types.ts"
      via: "AgentState, Gates, DatosCliente types"
      pattern: "AgentState"
    - from: "src/lib/agents/godentist/state.ts"
      to: "src/lib/agents/godentist/constants.ts"
      via: "CRITICAL_FIELDS, GD_META_PREFIX"
      pattern: "CRITICAL_FIELDS"
---

<objective>
Create state management, guards, and phase derivation for GoDentist agent.

Purpose: These three modules form the deterministic core that sits between comprehension (AI) and the transition table (logic). State merge captures data, gates evaluate readiness, guards catch escape conditions, and phase derivation determines the current conversation stage.

Output: Three files implementing the state machine core for dental appointment scheduling.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@src/lib/agents/somnio-v3/state.ts
@src/lib/agents/somnio-v3/guards.ts
@src/lib/agents/somnio-v3/phase.ts
@src/lib/agents/godentist/types.ts
@src/lib/agents/godentist/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create state.ts — state management, gates, serialization</name>
  <files>src/lib/agents/godentist/state.ts</files>
  <action>
Create state management following somnio-v3/state.ts pattern but MUCH simpler (no ofiInter, no negaciones, no pack).

**StateChanges interface:**
```typescript
export interface StateChanges {
  newFields: string[]
  hasNewData: boolean
  datosCriticosJustCompleted: boolean
  fechaJustSet: boolean  // fecha_preferida went from null to value this turn
}
```

**createInitialState():** Returns AgentState with all datos null, empty arrays, turnCount 0.

**mergeAnalysis(state, analysis):**
1. Create a copy of state (immutable)
2. Capture pre-merge gate state
3. Merge extracted_fields:
   - nombre, telefono, cedula: merge if non-null, non-empty
   - sede_preferida: merge directly (already normalized by comprehension)
   - servicio_interes: merge directly
   - fecha_preferida: merge directly
   - preferencia_jornada: merge directly
   - horario_seleccionado: merge directly
4. Normalize telefono: use normalizePhone from `@/lib/agents/somnio/normalizers` (reuse existing)
5. Update intentsVistos (push primary + secondary if not 'ninguno')
6. Increment turnCount
7. Compute StateChanges:
   - Track newFields, hasNewData
   - datosCriticosJustCompleted: !criticosBefore && criticosAfter
   - fechaJustSet: fecha was null, now has value
8. Return { state, changes }

**computeGates(state):**
```typescript
export function computeGates(state: AgentState): Gates {
  const datosCriticos = CRITICAL_FIELDS.every(f => {
    const val = state.datos[f as keyof DatosCliente]
    return val !== null && val.trim() !== ''
  })
  const fechaElegida = state.datos.fecha_preferida !== null && state.datos.fecha_preferida.trim() !== ''
  const horarioElegido = state.datos.horario_seleccionado !== null && state.datos.horario_seleccionado.trim() !== ''
  return {
    datosCriticos,
    fechaElegida,
    horarioElegido,
    datosCompletos: datosCriticos && fechaElegida && horarioElegido,
  }
}
```

**camposFaltantes(state):** Returns array of critical field names that are still null/empty. Also include fecha_preferida if not set (when datosCriticos is met).

**buildResumenContext(state):** Returns Record<string, string> with all datos for template variable substitution. Map sede_preferida to human-readable name (cabecera -> "Cabecera", mejoras_publicas -> "Mejoras Publicas", etc.).

**serializeState(state):** Flatten to datosCapturados record + intentsVistos + templatesEnviados + accionesEjecutadas. Store GoDentist metadata with `_gd:` prefix (turnCount).

**deserializeState(datosCapturados, intentsVistos, templatesEnviados, accionesEjecutadas):** Reconstruct AgentState from flat format. Same pattern as somnio-v3 but simpler.

**hasAction(acciones, tipo):** Same helper as somnio-v3.

IMPORTANT: Import `normalizePhone` from `@/lib/agents/somnio/normalizers`. Do NOT duplicate normalization code.
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "godentist/state" | head -5` — zero errors.</verify>
  <done>
state.ts exports createInitialState, mergeAnalysis, computeGates, camposFaltantes, buildResumenContext, serializeState, deserializeState, hasAction, StateChanges type.
All 4 gates compute correctly. Serialization round-trips data without loss.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create guards.ts and phase.ts</name>
  <files>src/lib/agents/godentist/guards.ts, src/lib/agents/godentist/phase.ts</files>
  <action>
**guards.ts:**
Follow somnio-v3/guards.ts pattern exactly. Two guards:

R0: Low confidence + otro -> handoff
```typescript
if (confidence < LOW_CONFIDENCE_THRESHOLD && intent === 'otro') {
  return { blocked: true, decision: { action: 'handoff', timerSignal: { type: 'cancel' }, reason: `Confidence ${confidence}% + intent=otro` } }
}
```

R1: Escape intents -> handoff (but with GoDentist escape intents: asesor, reagendamiento, queja, cancelar_cita)
```typescript
if (ESCAPE_INTENTS.has(intent)) {
  return { blocked: true, decision: { action: 'handoff', timerSignal: { type: 'cancel' }, reason: `Escape intent: ${intent}` } }
}
```

Import ESCAPE_INTENTS and LOW_CONFIDENCE_THRESHOLD from `./constants`.
Import MessageAnalysis from `./comprehension-schema`.
Import Decision, GuardResult from `./types`.

**phase.ts:**
Follow somnio-v3/phase.ts pattern. Derive phase from last significant action in accionesEjecutadas.

```typescript
export function derivePhase(acciones: AccionRegistrada[]): Phase {
  for (let i = acciones.length - 1; i >= 0; i--) {
    const tipo = acciones[i].tipo
    if (!SIGNIFICANT_ACTIONS.has(tipo)) continue

    switch (tipo) {
      case 'pedir_datos':
      case 'pedir_datos_parcial':   return 'capturing_data'
      case 'pedir_fecha':           return 'capturing_fecha'
      case 'mostrar_disponibilidad': return 'showing_availability'
      case 'mostrar_confirmacion':  return 'confirming'
      case 'agendar_cita':          return 'appointment_registered'
      case 'handoff':
      case 'no_interesa':           return 'closed'
    }
  }
  return 'initial'
}
```

Import SIGNIFICANT_ACTIONS from `./constants`.
Import Phase, AccionRegistrada from `./types`.
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep -E "godentist/(guards|phase)" | head -5` — zero errors.</verify>
  <done>
guards.ts blocks on 4 escape intents + low confidence. Returns GuardResult with handoff decision.
phase.ts maps 8 significant actions to 7 phases. Default is 'initial'.
  </done>
</task>

</tasks>

<verification>
- All 3 files compile without errors
- Gates correctly require nombre + telefono + sede for datosCriticos
- Phase derivation covers all 7 phases
- Serialization/deserialization round-trips correctly
</verification>

<success_criteria>
- computeGates returns correct values for all 4 gates
- mergeAnalysis preserves existing data (never overwrites non-null with null)
- derivePhase maps all 8 significant actions to correct phases
- Guards catch all 4 escape intents + low confidence otro
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/03-SUMMARY.md`
</output>
