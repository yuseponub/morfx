---
phase: agent-varixcenter
plan: 06
type: execute
wave: 3
depends_on: [04, 05]
files_modified:
  - src/lib/agents/varixcenter/response-track.ts
  - src/lib/agents/varixcenter/varixcenter-agent.ts
  - src/lib/agents/varixcenter/index.ts
autonomous: true
requirements: [VARIX-CLONE, VARIX-TEMPLATES, VARIX-AVAIL, VARIX-BOOK]

must_haves:
  truths:
    - "response-track usa TEMPLATE_LOOKUP_AGENT_ID = 'varixcenter' (NUNCA 'godentist' — anti-Pitfall 1/cdc06d9)"
    - "response-track mapea tipo_venas → info_vasitos/info_grandes/info_ambas; si null → triage"
    - "response-track agrega fuera_de_ciudad como COMP si es_foraneo (D-15)"
    - "varixcenter-agent llama getVarixAvailability en mostrar_disponibilidad (fail-open)"
    - "varixcenter-agent llama bookVarixAppointment en agendar_cita; slot_taken → re-availability + sin_disponibilidad"
    - "index.ts self-registra varixcenterConfig en agentRegistry"
  artifacts:
    - path: "src/lib/agents/varixcenter/response-track.ts"
      provides: "selección de templates por intent/acción (catálogo propio)"
      contains: "VARIXCENTER_AGENT_ID"
    - path: "src/lib/agents/varixcenter/varixcenter-agent.ts"
      provides: "processMessage — orquestador con write-path varix-clinic"
      contains: "bookVarixAppointment"
    - path: "src/lib/agents/varixcenter/index.ts"
      provides: "self-register + re-exports"
      contains: "agentRegistry.register"
  key_links:
    - from: "varixcenter-agent.ts"
      to: "domain/varix-clinic/booking + availability"
      via: "import getVarixAvailability + bookVarixAppointment"
      pattern: "bookVarixAppointment"
    - from: "response-track.ts"
      to: "agent_templates (varixcenter)"
      via: "getTemplatesForIntents(VARIXCENTER_AGENT_ID, ...)"
      pattern: "VARIXCENTER_AGENT_ID"
---

<objective>
Wave 3 — Cerrar el agente: response-track (selección de templates, CRÍTICO anti-Pitfall 1) + varixcenter-agent (orquestador con el write-path nuevo a varix-clinic) + index (self-register). Aquí se conecta la lógica conversacional (Wave 2) con los templates (Wave 5) y el agendamiento real (Wave 2 domain).

Purpose: Producir el agente funcional end-to-end (recibe mensaje → comprende → decide → consulta disponibilidad / agenda cita → responde con templates propios). Resuelve el riesgo CRÍTICO de catálogo compartido (cdc06d9) y el write-path nuevo (godentist no escribe).
Output: 3 archivos en src/lib/agents/varixcenter/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@.planning/standalone/agent-varixcenter/PLANTILLAS.md
@src/lib/agents/godentist-fb-ig/response-track.ts
@src/lib/agents/godentist-fb-ig/index.ts
@src/lib/agents/godentist/godentist-agent.ts
@src/lib/agents/varixcenter/config.ts
@src/lib/agents/varixcenter/state.ts
@src/lib/agents/varixcenter/constants.ts
@src/lib/domain/varix-clinic/availability.ts
@src/lib/domain/varix-clinic/booking.ts

<interfaces>
Domain: getVarixAvailability(fecha) -> { manana: string[], tarde: string[] }; bookVarixAppointment({nombre,cedula,telefono,fechaHoraInicio,fechaHoraFin}) -> {ok:true,appointmentId,patientId}|{ok:false,reason}
Config: VARIXCENTER_AGENT_ID = 'varixcenter'
State: gates + es_foraneo + buildResumenContext + camposFaltantes
TemplateManager + composeBlock: importados de @/lib/agents/somnio/* (mismo patrón que godentist-fb-ig response-track)
Templates (PLANTILLAS.md): triage, info_vasitos/info_grandes/info_ambas (+_comp), precio_*, ubicacion, horarios, financiacion, fuera_de_ciudad, no_diagnostico, preguntas_medicas, pedir_texto, pedir_datos, pedir_datos_parcial, pedir_fecha, mostrar_disponibilidad, sin_disponibilidad, confirmar_cita, cita_agendada, invitar_agendar, handoff, paciente_antiguo, reagendamiento, cancelar_cita, queja, no_interesa, english_response, retoma_*
Godentist agent availability fail-open: godentist-agent.ts líneas 324-356 (try/catch -> availabilityFallback)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: response-track.ts (catálogo propio — anti-Pitfall 1 CRÍTICO)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/response-track.ts (analog — header documenta el contrato TEMPLATE_LOOKUP_AGENT_ID + imports compartidos)
    - .planning/standalone/agent-varixcenter/PLANTILLAS.md (todos los template IDs + contenido)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §9 (flujo flexible — responder primero, triage por tipo_venas)
    - src/lib/agents/varixcenter/state.ts (es_foraneo, buildResumenContext, camposFaltantes)
  </read_first>
  <behavior>
    - getTemplatesForIntents se llama con 'varixcenter' como agent_id (NUNCA 'godentist')
    - intent precio_tratamiento sin tipo_venas -> template 'triage'
    - intent con tipo_venas='vasitos' -> 'info_vasitos' (+ info_vasitos_comp si aplica)
    - es_foraneo true -> 'fuera_de_ciudad' agregado como COMP
    - idioma:'en' -> 'english_response' (short-circuit)
    - accion mostrar_disponibilidad -> 'mostrar_disponibilidad' con {{slots_manana}}/{{slots_tarde}}
  </behavior>
  <action>
    Clonar `src/lib/agents/godentist-fb-ig/response-track.ts` con estos cambios CONCRETOS:

    ANTI-PITFALL 1 (regresión cdc06d9) — CRÍTICO:
    - `import { VARIXCENTER_AGENT_ID } from './config'`
    - Usar `getTemplatesForIntents(VARIXCENTER_AGENT_ID, ...)` en TODAS las llamadas de lookup. NUNCA literal 'godentist' ni la constante de otro agente.

    Imports compartidos (verbatim del analog): `TemplateManager` + `composeBlock` desde `@/lib/agents/somnio/*`, `INFORMATIONAL_INTENTS`/`ACTION_TEMPLATE_MAP` desde `./constants`, `buildResumenContext`/`camposFaltantes`/`es_foraneo` desde `./state`.

    Cambios de dominio:
    - QUITAR `SEDE_DISPLAY_NAMES` (no hay sede).
    - `FIELD_LABELS`: nombre->"Nombre completo", cedula->"Número de cédula", telefono->"Número de teléfono" (sin sede).
    - English short-circuit: `idioma:'en'` -> template `english_response` (verbatim).
    - Triage por tipo_venas (diseño §9): branch nuevo — si intent informacional de precio/tratamiento y `tipo_venas` está presente -> mapear a `info_vasitos`/`info_grandes`/`info_ambas` (+ los `_comp` como COMP). Si `tipo_venas` null -> template `triage`.
    - es_foraneo -> fuera_de_ciudad como COMP (D-15): si `es_foraneo(ciudad)` -> agregar `fuera_de_ciudad` a los templates COMP (NO bloquea).
    - Casos especiales (diseño §10): sintomas_descripcion -> `no_diagnostico`; preguntas médicas -> `preguntas_medicas`; notas de voz 1ª vez -> `pedir_texto`; info_laser -> `info_laser`; info_examen_doppler -> `info_examen_doppler`.
    - Acciones -> templates: mostrar_disponibilidad -> `mostrar_disponibilidad` (rellenar {{slots_manana}}/{{slots_tarde}} con los slots de availability); agendar_cita -> `cita_agendada`; mostrar_confirmacion -> `confirmar_cita`; handoff -> `handoff`; paciente_antiguo -> `paciente_antiguo`; no_interesa -> `no_interesa`; retoma_* -> los retoma_* de PLANTILLAS.md §8.
    - Máx 3 mensajes por turno (diseño §9).
  </action>
  <verify>
    <automated>grep -c "VARIXCENTER_AGENT_ID" src/lib/agents/varixcenter/response-track.ts; grep -rn "'godentist'" src/lib/agents/varixcenter/response-track.ts | wc -l</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "VARIXCENTER_AGENT_ID" src/lib/agents/varixcenter/response-track.ts` >= 1
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/response-track.ts` = 0 matches (anti-Pitfall 1)
    - `grep -c "SEDE_DISPLAY_NAMES\|sede_preferida" src/lib/agents/varixcenter/response-track.ts` = 0
    - Branch de triage por tipo_venas presente (info_vasitos/info_grandes/info_ambas + triage)
    - Branch fuera_de_ciudad COMP por es_foraneo presente
    - english_response short-circuit presente
  </acceptance_criteria>
  <done>response-track usa catálogo propio (varixcenter), triage por tipo_venas, es_foraneo COMP, sin sede ni godentist.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: varixcenter-agent.ts (orquestador + write-path nuevo)</name>
  <read_first>
    - src/lib/agents/godentist/godentist-agent.ts (analog — pipeline comprehension->state->sales->response + availability fail-open líneas 324-356 + observability líneas 347-376)
    - .planning/standalone/agent-varixcenter/PATTERNS.md sección varixcenter-agent.ts (write-path nuevo)
    - .planning/standalone/agent-varixcenter/RESEARCH.md §Security (PII redaction)
    - src/lib/domain/varix-clinic/availability.ts + booking.ts (firmas)
  </read_first>
  <behavior>
    - processMessage corre comprehension -> state -> guards -> sales-track -> response-track y devuelve V3AgentOutput
    - accion mostrar_disponibilidad -> llama getVarixAvailability(fecha); si throw o 0 slots -> availabilityFallback=true -> template sin_disponibilidad
    - accion agendar_cita -> llama bookVarixAppointment; ok -> cita_agendada; slot_taken -> re-availability + sin_disponibilidad; error -> handoff
    - observability emite pipeline_decision con agent:'varixcenter' y cédula/teléfono redactados
  </behavior>
  <action>
    Crear `src/lib/agents/varixcenter/varixcenter-agent.ts` clonando la estructura de `src/lib/agents/godentist/godentist-agent.ts` (pipeline) con el write-path NUEVO:

    Pipeline base (clonar): processMessage(input) -> comprehension (Haiku) -> state merge -> checkGuards -> sales-track (decide accion) -> response-track (templates) -> V3AgentOutput. Cambiar todos los `agent:'godentist'` a `agent:'varixcenter'` y log prefix `[varixcenter]`.

    Availability lookup (clonar fail-open de godentist-agent líneas 324-356):
    ```typescript
    let availabilitySlots; let availabilityFallback = false
    if (salesResult.accion === 'mostrar_disponibilidad' && mergedState.datos.fecha_preferida) {
      try {
        availabilitySlots = await getVarixAvailability(mergedState.datos.fecha_preferida)
        if ((availabilitySlots.manana.length + availabilitySlots.tarde.length) === 0) availabilityFallback = true
      } catch (err) {
        console.error('[varixcenter] Availability lookup failed (fail-open):', err)
        availabilityFallback = true
      }
    }
    ```
    NO pasar sede_preferida (1 sola sede). Fuente = getVarixAvailability (domain), NO robot HTTP.

    agendar_cita write-path (NUEVO — sin analog, godentist NO escribe):
    ```typescript
    if (salesResult.accion === 'agendar_cita') {
      // Construir fechaHoraInicio/Fin via parseSlotToISO (helper de domain/varix-clinic/availability.ts, Plan 05):
      const { inicio: fechaHoraInicio, fin: fechaHoraFin } = parseSlotToISO(
        mergedState.datos.fecha_preferida, mergedState.datos.horario_seleccionado)
      const result = await bookVarixAppointment({
        nombre: mergedState.datos.nombre,
        cedula: mergedState.datos.cedula,
        telefono: mergedState.datos.telefono,
        fechaHoraInicio, fechaHoraFin,
      })
      if (result.ok) { /* template cita_agendada */ }
      else if (result.reason === 'slot_taken') {
        // re-availability + emitir sin_disponibilidad (mismo patron fail-open)
        availabilitySlots = await getVarixAvailability(mergedState.datos.fecha_preferida).catch(() => ({manana:[],tarde:[]}))
        // forzar accion a mostrar_disponibilidad / sin_disponibilidad
      } else { /* reason==='error' -> fail-open a handoff */ }
    }
    ```
    Construir el TIMESTAMPTZ EXCLUSIVAMENTE via `parseSlotToISO(fecha, slotStr)` importado de `@/lib/domain/varix-clinic/availability` (Pitfall 6): "8:00 AM del 2026-06-15" -> `2026-06-15T08:00:00-05:00`, fin = inicio + 20 min. PROHIBIDO `new Date(string)` sin offset para esta conversión.

    Observability (clonar líneas 347-376) con PII redaction (RESEARCH §Security): emitir `getCollector()?.recordEvent('pipeline_decision', ...)` con `agent:'varixcenter'`. Redactar cédula (mostrar solo últimos 4) y teléfono (últimos 4) en cualquier evento — patrón crm-mutation-tools.
  </action>
  <verify>
    <automated>grep -c "bookVarixAppointment" src/lib/agents/varixcenter/varixcenter-agent.ts; grep -c "getVarixAvailability" src/lib/agents/varixcenter/varixcenter-agent.ts; grep -c "availabilityFallback" src/lib/agents/varixcenter/varixcenter-agent.ts</automated>
  </verify>
  <acceptance_criteria>
    - varixcenter-agent.ts exporta `processMessage`
    - Importa y llama `getVarixAvailability` (mostrar_disponibilidad) y `bookVarixAppointment` (agendar_cita)
    - Maneja `result.reason === 'slot_taken'` re-consultando availability
    - Tiene try/catch fail-open en availability (no crashea si varix-clinic falla — Pitfall 8)
    - Construye fecha_hora con `parseSlotToISO` (`grep -c "parseSlotToISO" src/lib/agents/varixcenter/varixcenter-agent.ts` >= 1) — offset `-05:00` garantizado por el helper (Regla 2)
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/varixcenter-agent.ts` = 0 matches
    - PII redaction de cédula/teléfono en eventos de observability
  </acceptance_criteria>
  <done>El orquestador agenda citas reales: availability + booking con fail-open, TZ -05:00, observability redactada.</done>
</task>

<task type="auto">
  <name>Task 3: index.ts (self-register en agentRegistry)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/index.ts (analog exacto — self-register + re-exports)
    - src/lib/agents/varixcenter/config.ts + varixcenter-agent.ts + types.ts
  </read_first>
  <files>src/lib/agents/varixcenter/index.ts</files>
  <action>
    Crear `src/lib/agents/varixcenter/index.ts` clonando `src/lib/agents/godentist-fb-ig/index.ts`:
    ```typescript
    import { agentRegistry } from '../registry'
    import { varixcenterConfig } from './config'

    // Self-register on module import (side-effect)
    agentRegistry.register(varixcenterConfig)

    export { VARIXCENTER_AGENT_ID } from './config'
    export { processMessage } from './varixcenter-agent'
    export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
    ```
    Header: "Varixcenter — Module Entry Point. Self-registra en agentRegistry on import. Agente nuevo (NO sibling) — coexiste con godentist/godentist-fb-ig (D-01, Regla 6)."
  </action>
  <verify>
    <automated>grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts; grep -c "varixcenterConfig" src/lib/agents/varixcenter/index.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "agentRegistry.register" src/lib/agents/varixcenter/index.ts` = 1
    - Re-exporta VARIXCENTER_AGENT_ID, processMessage, y los tipos
    - `npx tsc --noEmit 2>&1 | grep "agents/varixcenter/"` no muestra errores (todo el agente compila)
  </acceptance_criteria>
  <done>index.ts self-registra el config; el agente completo compila sin errores.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cliente WhatsApp/FB/IG -> agente | input no confiable (intent, slots, cédula) |
| agente -> domain varix-clinic | el agente delega todo write al domain (Regla 3) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-varix-06 | Info disclosure | cédula/teléfono en pipeline_decision events | mitigate | redaction en varixcenter-agent (últimos 4 dígitos), patrón crm-mutation-tools |
| T-varix-07 | Spoofing | bot responde con templates de otro agente | mitigate | TEMPLATE_LOOKUP_AGENT_ID='varixcenter' + grep gate 0 matches de 'godentist' |
| T-varix-08 | DoS | varix-clinic caído tumba el bot | mitigate | fail-open: availability/booking error -> sin_disponibilidad/handoff, NUNCA crash |
</threat_model>

<verification>
- 3 archivos existen en src/lib/agents/varixcenter/
- Gate Regla 3: `grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0
- Gate anti-Pitfall 1: `grep -rn "'godentist'" src/lib/agents/varixcenter/` = 0 matches
- `npx tsc --noEmit` sin errores en agents/varixcenter/
</verification>

<success_criteria>
- response-track con catálogo propio (anti-cdc06d9) + triage tipo_venas + es_foraneo
- varixcenter-agent agenda citas reales (availability + booking, fail-open, TZ -05:00)
- index.ts self-register; el agente compila completo
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/06-SUMMARY.md`
</output>
