---
phase: agent-godentist
plan: 06
type: execute
wave: 3
depends_on: ["agent-godentist-02", "agent-godentist-03", "agent-godentist-04", "agent-godentist-05"]
files_modified:
  - src/lib/agents/godentist/godentist-agent.ts
  - src/lib/agents/godentist/index.ts
autonomous: true

must_haves:
  truths:
    - "GoDentist agent processes user messages through the full pipeline: comprehension -> merge -> gates -> guards -> sales track -> response track"
    - "Timer expired events bypass comprehension and go directly to sales track + response track"
    - "Agent self-registers in the agent registry on import"
    - "processMessage returns V3AgentOutput with templates, state updates, timer signals"
    - "shouldScheduleAppointment flag is set when agendar_cita action fires"
    - "English messages are detected and handled with english_response template"
  artifacts:
    - path: "src/lib/agents/godentist/godentist-agent.ts"
      provides: "processMessage function implementing the full agent pipeline"
      min_lines: 150
    - path: "src/lib/agents/godentist/index.ts"
      provides: "Module entry point with self-registration and public exports"
      min_lines: 10
  key_links:
    - from: "src/lib/agents/godentist/godentist-agent.ts"
      to: "src/lib/agents/godentist/comprehension.ts"
      via: "comprehend() call for user messages"
      pattern: "comprehend"
    - from: "src/lib/agents/godentist/godentist-agent.ts"
      to: "src/lib/agents/godentist/sales-track.ts"
      via: "resolveSalesTrack() for decision"
      pattern: "resolveSalesTrack"
    - from: "src/lib/agents/godentist/godentist-agent.ts"
      to: "src/lib/agents/godentist/response-track.ts"
      via: "resolveResponseTrack() for templates"
      pattern: "resolveResponseTrack"
    - from: "src/lib/agents/godentist/index.ts"
      to: "src/lib/agents/registry.ts"
      via: "agentRegistry.register(godentistConfig)"
      pattern: "agentRegistry.register"
---

<objective>
Create the main agent pipeline and entry point for GoDentist — the orchestrator that ties all layers together.

Purpose: This is the final assembly that connects comprehension, state, gates, guards, sales track, and response track into a single processMessage function. The entry point self-registers the agent in the registry.

Output: Two files — the main pipeline and the module entry point with self-registration.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@src/lib/agents/somnio-v3/somnio-v3-agent.ts
@src/lib/agents/somnio-v3/index.ts
@src/lib/agents/godentist/types.ts
@src/lib/agents/godentist/comprehension.ts
@src/lib/agents/godentist/state.ts
@src/lib/agents/godentist/guards.ts
@src/lib/agents/godentist/phase.ts
@src/lib/agents/godentist/sales-track.ts
@src/lib/agents/godentist/response-track.ts
@src/lib/agents/godentist/config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create godentist-agent.ts — main pipeline</name>
  <files>src/lib/agents/godentist/godentist-agent.ts</files>
  <action>
Create the main agent pipeline following somnio-v3/somnio-v3-agent.ts structure exactly. Same two-path architecture:

**processMessage(input: V3AgentInput): Promise<V3AgentOutput>**
- If systemEvent is timer_expired -> processSystemEvent
- Otherwise -> processUserMessage

**processSystemEvent(input, systemEvent):**
1. Restore state via deserializeState
2. Derive phase + compute gates (NO mergeAnalysis, NO turnCount++)
3. Sales track with timer event
4. Response track (NO intent, system events don't have intents)
5. Register action with origen: 'timer'
6. Update templatesMostrados
7. Serialize state
8. Return V3AgentOutput with:
   - shouldScheduleAppointment: check if accion is in SCHEDULE_APPOINTMENT_ACTIONS
   - appointmentData if scheduling (datosCapturados)

**processUserMessage(input):**
1. Restore state via deserializeState
2. Comprehension: call comprehend() with message, history, existing data, recent bot messages
3. State merge: mergeAnalysis
4. Compute gates
5. Guards: checkGuards(analysis) — if blocked, return handoff
6. **English detection:** If analysis.classification.idioma === 'en', short-circuit:
   - Call resolveResponseTrack with idioma='en' (no salesAction, no intent)
   - Return with messages from english_response template
   - Set timer cancel (don't follow up in English)
7. Sales track: resolveSalesTrack
8. Apply timer signal
9. Check for appointment scheduling: if accion in SCHEDULE_APPOINTMENT_ACTIONS
10. Response track: resolveResponseTrack with salesAction, intent, secondaryIntent, state, workspaceId, idioma, servicioDetectado from analysis.extracted_fields.servicio_interes
11. Register action (accion !== 'silence')
12. Update templatesMostrados
13. Handle natural silence (0 messages)
14. Serialize and return

**computeMode(state):** Map internal state to engine-compatible mode:
```typescript
function computeMode(state: AgentState): string {
  if (hasAction(state.accionesEjecutadas, 'agendar_cita')) return 'cita_agendada'
  if (hasAction(state.accionesEjecutadas, 'mostrar_confirmacion')) return 'confirmacion'
  if (hasAction(state.accionesEjecutadas, 'mostrar_disponibilidad')) return 'mostrando_disponibilidad'
  if (hasAction(state.accionesEjecutadas, 'pedir_fecha')) return 'captura_fecha'
  if (hasAction(state.accionesEjecutadas, 'pedir_datos') || hasAction(state.accionesEjecutadas, 'pedir_datos_parcial')) return 'captura'
  if (state.turnCount === 0) return 'nuevo'
  return 'conversacion'
}
```

KEY DIFFERENCES from somnio-v3:
- No `packSeleccionado` in input/output (GoDentist has no packs)
- `shouldCreateOrder` replaced with `shouldScheduleAppointment`
- `orderData` replaced with `appointmentData`
- English detection short-circuit after guards
- `servicioDetectado` and `idioma` passed to response track
- No `enCapturaSilenciosa` logic
- No `ofiInter` logic
- Error handling: same try/catch pattern, return success: false

Import all modules from the godentist directory, NOT from somnio-v3.
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "godentist-agent" | head -5` — zero errors.</verify>
  <done>
godentist-agent.ts implements the full pipeline: comprehension -> merge -> gates -> guards -> English detection -> sales track -> response track. Handles both user messages and timer events. Returns V3AgentOutput with appointment scheduling signals.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create index.ts — entry point with self-registration</name>
  <files>src/lib/agents/godentist/index.ts</files>
  <action>
Create the module entry point following somnio-v3/index.ts pattern exactly:

```typescript
/**
 * GoDentist Appointment Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import.
 * Separate agent from Somnio — both can coexist.
 */

import { agentRegistry } from '../registry'
import { godentistConfig, GODENTIST_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(godentistConfig)

// Re-export public API
export { GODENTIST_AGENT_ID } from './config'
export { processMessage } from './godentist-agent'
export type { V3AgentInput, V3AgentOutput } from './types'
```

This file MUST be imported somewhere so the agent registers. Check how somnio-v3 is imported and follow the same pattern.
  </action>
  <verify>
`npx tsc --noEmit 2>&1 | grep "godentist/index" | head -5` — zero errors.
`grep -r "somnio-v3" src/lib/agents/ --include="*.ts" -l | head -5` — find where somnio-v3 is imported to understand registration pattern.
  </verify>
  <done>
index.ts self-registers GoDentist agent in the agent registry on import.
Exports GODENTIST_AGENT_ID, processMessage, and V3AgentInput/V3AgentOutput types.
Agent coexists with Somnio v3 — separate agent_id, separate pipeline.
  </done>
</task>

</tasks>

<verification>
- All files compile without errors
- processMessage handles both user messages and timer events
- English messages return english_response without going through full pipeline
- Agent registers with id 'godentist' in the registry
- Mode computation reflects dental appointment lifecycle
</verification>

<success_criteria>
- Complete pipeline processes a message through all layers without errors
- Timer events skip comprehension and go directly to transition table
- shouldScheduleAppointment is true only when agendar_cita fires
- Agent self-registers on module import
- No references to somnio-v3 internal modules (uses own godentist modules)
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/06-SUMMARY.md`
</output>
