---
phase: agent-godentist
plan: 04
type: execute
wave: 2
depends_on: ["agent-godentist-01"]
files_modified:
  - src/lib/agents/godentist/transitions.ts
  - src/lib/agents/godentist/sales-track.ts
autonomous: true

must_haves:
  truths:
    - "51 transition rules from design doc are implemented as declarative table entries"
    - "Sales track resolves timer events without comprehension"
    - "Sales track resolves user messages through transition table"
    - "Auto-trigger fires when datosCriticos just completed"
    - "Escape intents handled in any phase via wildcard entries"
    - "Timer reevaluate for info questions during capture phases"
  artifacts:
    - path: "src/lib/agents/godentist/transitions.ts"
      provides: "TRANSITIONS array with all 51 rules, resolveTransition, systemEventToKey"
      min_lines: 200
    - path: "src/lib/agents/godentist/sales-track.ts"
      provides: "resolveSalesTrack function for two-track decision"
      min_lines: 60
  key_links:
    - from: "src/lib/agents/godentist/sales-track.ts"
      to: "src/lib/agents/godentist/transitions.ts"
      via: "resolveTransition lookup"
      pattern: "resolveTransition"
    - from: "src/lib/agents/godentist/transitions.ts"
      to: "src/lib/agents/godentist/types.ts"
      via: "TipoAccion, Phase, Gates types"
      pattern: "TipoAccion"
---

<objective>
Create the transition table and sales track for GoDentist — the deterministic state machine that decides WHAT TO DO.

Purpose: This is the heart of the agent's logic. The 51 transition rules from the design document encode the complete appointment scheduling flow. The sales track orchestrates timer events, auto-triggers, and intent-based transitions.

Output: Two files implementing the complete transition logic for dental appointment scheduling.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@src/lib/agents/somnio-v3/transitions.ts
@src/lib/agents/somnio-v3/sales-track.ts
@src/lib/agents/godentist/types.ts
@src/lib/agents/godentist/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create transitions.ts — declarative transition table</name>
  <files>src/lib/agents/godentist/transitions.ts</files>
  <action>
Create the declarative transition table following somnio-v3/transitions.ts pattern exactly. Same TransitionEntry and TransitionOutput interfaces. Same resolveTransition() and systemEventToKey() functions.

Implement ALL 51 transition rules from the design doc section 7. Group them by source phase:

**ANY-phase transitions (rules 50-54 — escapes):**
- `* + rechazar -> no_interesa` with timer cancel
- `* + no_interesa -> no_interesa` with timer cancel (add this for rechazar intent too)

Note: Escape intents (asesor, reagendamiento, queja, cancelar_cita) are handled by guards.ts BEFORE the transition table. Do NOT duplicate them here.

**From `initial` (rules 1-21):**
- Rule 1: `saludo -> silence` (no timer)
- Rule 2: `quiero_agendar + !datosCriticos -> pedir_datos` (timer L1)
- Rule 3: `quiero_agendar + datosCriticos + !fechaElegida -> pedir_fecha` (timer L3)
- Rule 4: `quiero_agendar + datosCriticos + fechaElegida -> mostrar_disponibilidad` (timer L4)
- Rule 5: `datos + !datosCriticos -> pedir_datos_parcial` (timer L1)
- Rule 6: `datos + datosCriticos + !fechaElegida -> pedir_fecha` (timer L3)
- Rule 7: `datos + datosCriticos + fechaElegida -> mostrar_disponibilidad` (timer L4)
- Rule 8: `seleccion_sede + !datosCriticos -> pedir_datos_parcial` (timer L1)
- Rule 9: `seleccion_sede + datosCriticos + !fechaElegida -> pedir_fecha` (timer L3)
- Rules 10-19: Info intents (precio_servicio, valoracion_costo, financiacion, ubicacion, horarios, urgencia, materiales, menores, seguros_eps, garantia) -> `silence` (timer L2, except urgencia has no timer)
- Rule 20: `otro (conf < 80) -> handoff` with timer cancel — NOTE: This is handled by guards, skip it
- Rule 21: `timer_expired:2 -> invitar_agendar` (no further timer)

For info intents in initial, use a single wildcard-style approach: define each informational intent individually (they need L2 timer, except urgencia which has no timer).

**From `capturing_data` (rules 22-31):**
- Rule 22: `datos + !datosCriticos -> pedir_datos_parcial` (timer L1)
- Rule 23: `datos + datosCriticos + !fechaElegida -> pedir_fecha` (timer L3)
- Rule 24: `datos + datosCriticos + fechaElegida -> mostrar_disponibilidad` (timer L4)
- Rule 25: `seleccion_sede + !datosCriticos -> pedir_datos_parcial` (timer L1)
- Rule 26: `seleccion_sede + datosCriticos + !fechaElegida -> pedir_fecha` (timer L3)
- Rule 27: `auto:datos_criticos + !fechaElegida -> pedir_fecha` (timer L3)
- Rule 28: `auto:datos_criticos + fechaElegida -> mostrar_disponibilidad` (timer L4)
- Rule 29: info intents -> `silence` (timer reevaluate)
- Rule 30: `acknowledgment -> silence` (timer L6)
- Rule 31: `timer_expired:1 -> retoma_datos` (no further timer)

For rule 29, create entries for EACH informational intent individually with `phase: 'capturing_data'` and timer `{ type: 'reevaluate' }`.

**From `capturing_fecha` (rules 32-36):**
- Rule 32: `datos + fechaElegida -> mostrar_disponibilidad` (timer L4)
- Rule 33: `datos + !fechaElegida -> silence` (timer reevaluate)
- Rule 34: info intents -> `silence` (timer reevaluate)
- Rule 35: `acknowledgment -> silence` (timer L6)
- Rule 36: `timer_expired:3 -> retoma_fecha` (no further timer)

**From `showing_availability` (rules 37-40):**
- Rule 37: `seleccion_horario -> mostrar_confirmacion` (timer L5)
- Rule 38: `datos (nueva fecha) -> mostrar_disponibilidad` (timer L4) — condition: changes.fechaJustSet
- Rule 39: info intents -> `silence` (timer reevaluate)
- Rule 40: `timer_expired:4 -> retoma_horario` (no further timer)

**From `confirming` (rules 41-45):**
- Rule 41: `confirmar + datosCompletos -> agendar_cita` (timer cancel)
- Rule 42: `rechazar -> pedir_datos` (timer L1) — NOTE: This is specific to confirming phase, so define BEFORE the wildcard rechazar
- Rule 43: `datos -> mostrar_confirmacion` (timer L5)
- Rule 44: info intents -> `silence` (timer reevaluate)
- Rule 45: `timer_expired:5 -> retoma_confirmacion` (no further timer)

**From `appointment_registered` (rules 46-49):**
- Rule 46: `reagendamiento -> handoff` (timer cancel) — NOTE: handled by guards
- Rule 47: `cancelar_cita -> handoff` (timer cancel) — NOTE: handled by guards
- Rule 48: info intents -> `silence` (no timer)
- Rule 49: `* -> silence` (no timer) — catch-all for appointment_registered

**From `closed` (D8 equivalent):**
- `* -> silence` — catch-all

IMPORTANT ORDERING:
1. Phase-specific `rechazar` in `confirming` (rule 42) MUST come BEFORE the wildcard `rechazar` (escape)
2. `auto:datos_criticos` transitions in `capturing_data` (rules 27-28) need their own entries
3. Info intents in capture phases use `reevaluate` timer, not L2
4. Escape intents (asesor, reagendamiento, queja, cancelar_cita) are handled by guards.ts, NOT in this table

For the reevaluate timer: `{ type: 'reevaluate', reason: 'info during capture' }`. This tells the timer system to NOT restart but to keep the current timer running.
  </action>
  <verify>`grep -c "phase:" src/lib/agents/godentist/transitions.ts` — should be roughly 40-50 entries. `npx tsc --noEmit 2>&1 | grep "transitions" | head -5` — zero errors.</verify>
  <done>
transitions.ts has all rules from design doc encoded as TransitionEntry objects. resolveTransition() does phase-specific lookup then wildcard fallback. systemEventToKey() converts timer events to 'timer_expired:N' format.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create sales-track.ts</name>
  <files>src/lib/agents/godentist/sales-track.ts</files>
  <action>
Create the sales track following somnio-v3/sales-track.ts pattern but SIMPLER (no ofiInter signals, no secondary sales actions).

**resolveSalesTrack(input):**

Input: `{ phase, state, gates, event: SalesEvent }`
Output: `SalesTrackOutput { accion?, timerSignal?, reason }`

Flow:
1. **Timer expired event:** Early return via resolveTransition with systemEventToKey
2. **Auto-triggers by data changes:**
   - If changes.datosCriticosJustCompleted:
     - Check if fechaElegida -> auto:datos_criticos event -> resolveTransition
     - If intent is informational, defer auto-trigger (let response track answer first)
3. **Intent -> transition table lookup:** resolveTransition(phase, intent, state, gates, changes)
4. **No match -> fallback:** Return `{ reason: 'No transition - response track handles informational' }`

Key difference from somnio-v3: NO secondary sales actions, NO ofi-inter signals, NO captura silenciosa logic. Much simpler.

The timer signal from auto-triggers should be used as fallback if the main transition doesn't produce one.

Import resolveTransition and systemEventToKey from `./transitions`.
Import INFORMATIONAL_INTENTS from `./constants`.
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "sales-track" | head -5` — zero errors.</verify>
  <done>
sales-track.ts resolves timer events, auto-triggers for datos_criticos, and intent transitions through the declarative table. Returns SalesTrackOutput with action and timer signal.
  </done>
</task>

</tasks>

<verification>
- Both files compile without errors
- Transition table covers all rules from design doc section 7
- Sales track handles all three event types (timer, auto-trigger, user message)
- Timer signals match design doc durations
</verification>

<success_criteria>
- All 51 transition rules from design doc are encoded (minus those handled by guards)
- resolveTransition correctly matches phase-specific entries before wildcards
- Sales track auto-triggers pedir_fecha when datosCriticos just completed
- Timer expired events resolve without comprehension call
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/04-SUMMARY.md`
</output>
