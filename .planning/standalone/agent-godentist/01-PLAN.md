---
phase: agent-godentist
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/agents/godentist/types.ts
  - src/lib/agents/godentist/constants.ts
  - src/lib/agents/godentist/config.ts
autonomous: true

must_haves:
  truths:
    - "GoDentist agent has its own type system separate from Somnio v3"
    - "23 intents are defined as a const tuple for Zod enum usage"
    - "14 actions (TipoAccion) cover the full appointment scheduling flow"
    - "7 phases map to the appointment lifecycle"
    - "4 gates are computed from state every turn"
    - "Agent is registered in the agent registry with id 'godentist'"
  artifacts:
    - path: "src/lib/agents/godentist/types.ts"
      provides: "AgentState, DatosCliente, Gates, TipoAccion, Phase, AccionRegistrada, V3AgentInput/Output adapted for GoDentist"
      min_lines: 100
    - path: "src/lib/agents/godentist/constants.ts"
      provides: "GD_INTENTS, ESCAPE_INTENTS, INFORMATIONAL_INTENTS, ACTION_TEMPLATE_MAP, CRITICAL_FIELDS, SEDE_MAP, SERVICIOS enum, timer durations"
      min_lines: 80
    - path: "src/lib/agents/godentist/config.ts"
      provides: "GODENTIST_AGENT_ID, godentistConfig for registry"
      min_lines: 20
  key_links:
    - from: "src/lib/agents/godentist/constants.ts"
      to: "src/lib/agents/godentist/types.ts"
      via: "GD_INTENTS used in comprehension schema, TipoAccion defined in types"
      pattern: "GD_INTENTS"
    - from: "src/lib/agents/godentist/config.ts"
      to: "src/lib/agents/registry.ts"
      via: "AgentConfig type from registry"
      pattern: "AgentConfig"
---

<objective>
Create the foundational type system, constants, and agent configuration for the GoDentist appointment scheduling agent.

Purpose: All other modules (comprehension, state, sales track, response track, pipeline) depend on these types and constants. This is the foundation layer.

Output: Three files defining the complete type system, constant enums, and agent registry config for GoDentist.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-godentist/DISENO-COMPLETO.md
@.planning/standalone/agent-godentist/PLANTILLAS.md
@src/lib/agents/somnio-v3/types.ts
@src/lib/agents/somnio-v3/constants.ts
@src/lib/agents/somnio-v3/config.ts
@src/lib/agents/registry.ts
@src/lib/agents/types.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create types.ts and constants.ts for GoDentist</name>
  <files>src/lib/agents/godentist/types.ts, src/lib/agents/godentist/constants.ts</files>
  <action>
Create `src/lib/agents/godentist/types.ts` following the same pattern as somnio-v3/types.ts but adapted for dental appointment scheduling:

**DatosCliente interface:**
- `nombre: string | null` (critical)
- `telefono: string | null` (critical) — format 573XXXXXXXXX
- `sede_preferida: string | null` (critical) — one of 4 sedes
- `servicio_interes: string | null` (optional)
- `cedula: string | null` (optional)
- `fecha_preferida: string | null` (critical for phase 2)
- `preferencia_jornada: string | null` (optional) — 'manana' | 'tarde'
- `horario_seleccionado: string | null` (critical for phase 3)

**AgentState interface:**
- `datos: DatosCliente`
- `intentsVistos: string[]`
- `accionesEjecutadas: AccionRegistrada[]`
- `templatesMostrados: string[]`
- `turnCount: number`
- NO `pack`, NO `ofiInter`, NO `negaciones`, NO `enCapturaSilenciosa` — GoDentist is simpler

**Gates interface:**
- `datosCriticos: boolean` — nombre + telefono + sede_preferida all non-null
- `fechaElegida: boolean` — fecha_preferida non-null
- `horarioElegido: boolean` — horario_seleccionado non-null
- `datosCompletos: boolean` — datosCriticos + fechaElegida + horarioElegido

**TipoAccion type:** (14 actions from design doc)
`'pedir_datos' | 'pedir_datos_parcial' | 'pedir_fecha' | 'mostrar_disponibilidad' | 'mostrar_confirmacion' | 'agendar_cita' | 'invitar_agendar' | 'handoff' | 'silence' | 'no_interesa' | 'retoma_datos' | 'retoma_fecha' | 'retoma_horario' | 'retoma_confirmacion'`

**Phase type:** (7 phases)
`'initial' | 'capturing_data' | 'capturing_fecha' | 'showing_availability' | 'confirming' | 'appointment_registered' | 'closed'`

**DecisionAction type:** `'respond' | 'silence' | 'handoff' | 'schedule_appointment'`

**SystemEvent type:** Same pattern as somnio-v3 but with levels 1-6 and auto events for `datos_criticos`

**SalesEvent, SalesTrackOutput, ResponseTrackOutput, ProcessedMessage** — same structure as somnio-v3

**V3AgentInput/V3AgentOutput** — Adapt from somnio-v3. Key differences:
- No `packSeleccionado`
- `shouldCreateOrder` becomes `shouldScheduleAppointment`
- `orderData` becomes `appointmentData` with `datosCapturados` + `sedePreferida`
- Keep `timerSignals`, `decisionInfo`, `salesTrackInfo`, `responseTrackInfo`, `classificationInfo`

**GuardResult** — same as somnio-v3

Create `src/lib/agents/godentist/constants.ts` with ZERO imports (same pattern as somnio-v3):

**GD_INTENTS tuple:** (23 intents from design doc)
```
'saludo', 'precio_servicio', 'valoracion_costo', 'financiacion', 'ubicacion', 'horarios', 'materiales', 'menores', 'seguros_eps', 'urgencia', 'garantia',
'quiero_agendar', 'datos', 'seleccion_sede', 'seleccion_horario', 'confirmar', 'rechazar',
'asesor', 'reagendamiento', 'queja', 'cancelar_cita',
'acknowledgment', 'otro'
```

**ESCAPE_INTENTS set:** `'asesor', 'reagendamiento', 'queja', 'cancelar_cita'`

**INFORMATIONAL_INTENTS set:** `'saludo', 'precio_servicio', 'valoracion_costo', 'financiacion', 'ubicacion', 'horarios', 'materiales', 'menores', 'seguros_eps', 'urgencia', 'garantia'`

**SERVICIOS enum array:** 23 services from design doc (corona, protesis, alineadores, etc.)

**SEDES array:** `['cabecera', 'mejoras_publicas', 'floridablanca', 'canaveral']`

**SEDE_ALIASES map:** `{ 'jumbo': 'canaveral', 'bosque': 'canaveral', 'cañaveral': 'canaveral', 'centro': 'mejoras_publicas' }`

**CRITICAL_FIELDS:** `['nombre', 'telefono', 'sede_preferida']`

**ACTION_TEMPLATE_MAP:** Maps TipoAccion to template intent names. E.g.:
- `pedir_datos` -> `['pedir_datos']`
- `pedir_datos_parcial` -> `['pedir_datos_parcial']`
- `pedir_fecha` -> `['pedir_fecha']`
- `mostrar_disponibilidad` -> `['mostrar_disponibilidad']`
- `mostrar_confirmacion` -> `['confirmar_cita']`
- `agendar_cita` -> `['cita_agendada']`
- `invitar_agendar` -> `['invitar_agendar']`
- `handoff` -> `['handoff']`
- `no_interesa` -> `['no_interesa']`
- `retoma_datos` -> `['retoma_datos']`
- `retoma_fecha` -> `['retoma_fecha']`
- `retoma_horario` -> `['retoma_horario']`
- `retoma_confirmacion` -> `['retoma_confirmacion']`

**SIGNIFICANT_ACTIONS set:** `'pedir_datos', 'pedir_datos_parcial', 'pedir_fecha', 'mostrar_disponibilidad', 'mostrar_confirmacion', 'agendar_cita', 'handoff', 'no_interesa'`

**SCHEDULE_APPOINTMENT_ACTIONS set:** `'agendar_cita'`

**LOW_CONFIDENCE_THRESHOLD:** 80

**GD_META_PREFIX:** `'_gd:'`

**GD_TIMER_DURATIONS:** Per design doc:
- real: `{ 1: 180, 2: 120, 3: 120, 4: 120, 5: 180, 6: 90 }` (L1=3min, L2=2min, L3=2min, L4=2min, L5=3min, L6=90s)
- rapido: `{ 1: 30, 2: 20, 3: 20, 4: 20, 5: 30, 6: 9 }`
- instantaneo: `{ 1: 2, 2: 2, 3: 1, 4: 1, 5: 2, 6: 1 }`
  </action>
  <verify>
Run `npx tsc --noEmit --project tsconfig.json 2>&1 | grep -c "godentist"` — should be 0 errors related to godentist files.
Also verify: `grep -c "GD_INTENTS\|TipoAccion\|AgentState\|Gates" src/lib/agents/godentist/types.ts src/lib/agents/godentist/constants.ts` shows all key exports exist.
  </verify>
  <done>
types.ts exports: DatosCliente, AgentState, Gates, TipoAccion, Phase, AccionRegistrada, DecisionAction, Decision, TimerSignal, ProcessedMessage, SalesTrackOutput, ResponseTrackOutput, V3AgentInput, V3AgentOutput (adapted), SystemEvent, SalesEvent, GuardResult.
constants.ts exports: GD_INTENTS, ESCAPE_INTENTS, INFORMATIONAL_INTENTS, SERVICIOS, SEDES, SEDE_ALIASES, CRITICAL_FIELDS, ACTION_TEMPLATE_MAP, SIGNIFICANT_ACTIONS, SCHEDULE_APPOINTMENT_ACTIONS, LOW_CONFIDENCE_THRESHOLD, GD_META_PREFIX, GD_TIMER_DURATIONS.
Both compile without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create config.ts and agent registration</name>
  <files>src/lib/agents/godentist/config.ts</files>
  <action>
Create `src/lib/agents/godentist/config.ts` following the somnio-v3/config.ts pattern:

```typescript
export const GODENTIST_AGENT_ID = 'godentist'

export const godentistConfig: AgentConfig = {
  id: GODENTIST_AGENT_ID,
  name: 'GoDentist Appointment Agent',
  description: 'Agente de agendamiento de citas para GoDentist. Pipeline v3 con comprehension Haiku + state machine determinista. Agenda valoraciones GRATIS en 4 sedes.',

  intentDetector: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist uses comprehension.ts directly',
    maxTokens: 512,
  },

  orchestrator: {
    model: CLAUDE_MODELS.HAIKU,
    systemPrompt: 'PLACEHOLDER — godentist uses sales-track.ts + response-track.ts directly',
    maxTokens: 512,
  },

  tools: [
    'crm.contact.create',
    'crm.contact.update',
    'crm.contact.get',
    'whatsapp.message.send',
  ],

  states: [
    'nuevo',
    'conversacion',
    'captura',
    'captura_fecha',
    'mostrando_disponibilidad',
    'confirmacion',
    'cita_agendada',
    'handoff',
  ],
  initialState: 'nuevo',
  validTransitions: {
    nuevo: ['conversacion', 'captura', 'handoff'],
    conversacion: ['captura', 'handoff'],
    captura: ['captura_fecha', 'handoff'],
    captura_fecha: ['mostrando_disponibilidad', 'handoff'],
    mostrando_disponibilidad: ['confirmacion', 'handoff'],
    confirmacion: ['cita_agendada', 'captura', 'handoff'],
    cita_agendada: ['handoff'],
    handoff: [],
  },

  confidenceThresholds: {
    proceed: 80,
    reanalyze: 60,
    clarify: 40,
    handoff: 0,
  },

  tokenBudget: 50_000,
}
```

Import `AgentConfig` and `CLAUDE_MODELS` from `../types`.
  </action>
  <verify>`npx tsc --noEmit 2>&1 | grep "godentist/config" | head -5` — zero errors.</verify>
  <done>config.ts exports GODENTIST_AGENT_ID and godentistConfig. AgentConfig follows the same structure as somnio-v3 with dental-specific states and transitions.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes for all 3 new files
- All types from design doc are represented
- Constants have zero imports from other project files
- Agent config follows registry pattern
</verification>

<success_criteria>
- types.ts has all GoDentist-specific types (AgentState, Gates, TipoAccion, Phase, etc.)
- constants.ts has all 23 intents, 23 services, 4 sedes, action maps, timer durations
- config.ts registers agent with id 'godentist' following AgentConfig shape
- No compilation errors
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-godentist/01-SUMMARY.md`
</output>
