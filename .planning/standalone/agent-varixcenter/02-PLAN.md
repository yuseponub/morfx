---
phase: agent-varixcenter
plan: 02
type: execute
wave: 1
depends_on: [01]
files_modified:
  - src/lib/agents/varixcenter/config.ts
  - src/lib/agents/varixcenter/types.ts
  - src/lib/agents/varixcenter/constants.ts
  - src/lib/agents/varixcenter/guards.ts
  - src/lib/agents/varixcenter/phase.ts
autonomous: true
requirements: [VARIX-CLONE, VARIX-FESTIVOS]

must_haves:
  truths:
    - "Existe la constante literal VARIXCENTER_AGENT_ID = 'varixcenter'"
    - "Los 24 intents del diseño §1 están en constants.ts (VARIX_INTENTS)"
    - "Las 7 fases del diseño §3 están en config.ts (states + validTransitions)"
    - "Los festivos colombianos + detección de domingo TZ-safe están disponibles para el agente"
    - "CRITICAL_FIELDS de varixcenter es ['nombre','telefono','cedula'] (D-05, NO sede_preferida)"
  artifacts:
    - path: "src/lib/agents/varixcenter/config.ts"
      provides: "VARIXCENTER_AGENT_ID + AgentConfig con 7 fases"
      contains: "VARIXCENTER_AGENT_ID = 'varixcenter'"
    - path: "src/lib/agents/varixcenter/constants.ts"
      provides: "24 intents + ESCAPE/INFORMATIONAL/SIGNIFICANT sets + festivos + CRITICAL_FIELDS"
      contains: "VARIX_INTENTS"
    - path: "src/lib/agents/varixcenter/types.ts"
      provides: "Tipos del agente (V3AgentInput/Output, TipoAccion)"
    - path: "src/lib/agents/varixcenter/guards.ts"
      provides: "checkGuards (R0 confidence + R1 escape)"
    - path: "src/lib/agents/varixcenter/phase.ts"
      provides: "derivePhase (mapeo acción→fase)"
  key_links:
    - from: "constants.ts CRITICAL_FIELDS"
      to: "v3-production-runner VAL guard (Wave 3)"
      via: "['nombre','telefono','cedula']"
      pattern: "cedula"
---

<objective>
Wave 1 — Clonar los archivos PUROS del agente (sin IO, sin dependencias entre sí más allá de constants/types): config, types, constants, guards, phase. Estos archivos copian verbatim/adaptado de godentist-fb-ig y NO tocan Supabase ni el motor compartido.

Purpose: Establecer la base estructural del agente (ID literal, intents, fases, gates) que las waves siguientes (comprehension, transitions, agent, domain) consumen. Resuelve el riesgo CRÍTICO de PATTERNS.md: CRITICAL_FIELDS divergente (cedula vs sede_preferida).
Output: 5 archivos en src/lib/agents/varixcenter/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@src/lib/agents/godentist-fb-ig/config.ts
@src/lib/agents/godentist-fb-ig/types.ts
@src/lib/agents/godentist-fb-ig/guards.ts
@src/lib/agents/godentist-fb-ig/phase.ts
@src/lib/agents/godentist/constants.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: config.ts + types.ts (ID literal + tipos + 7 fases)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/config.ts (analog exacto — copiar shape verbatim)
    - src/lib/agents/godentist-fb-ig/types.ts (analog exacto — clonar verbatim)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §3 (las 7 fases) + PATTERNS.md sección config.ts
  </read_first>
  <files>src/lib/agents/varixcenter/config.ts, src/lib/agents/varixcenter/types.ts</files>
  <action>
    **types.ts:** Clonar verbatim de `src/lib/agents/godentist-fb-ig/types.ts` (V3AgentInput, V3AgentOutput, TipoAccion). Solo cambiar el comentario de header a "Varixcenter — clonado de godentist-fb-ig (Standalone agent-varixcenter Wave 1)". NO cambiar tipos salvo que TipoAccion necesite reflejar las 14 acciones del diseño §5 (`pedir_datos`, `pedir_datos_parcial`, `pedir_fecha`, `mostrar_disponibilidad`, `mostrar_confirmacion`, `agendar_cita`, `invitar_agendar`, `handoff`, `silence`, `no_interesa`, `retoma_datos`, `retoma_fecha`, `retoma_horario`, `retoma_confirmacion`). Si godentist-fb-ig tiene acciones extra (ej. `pedir_datos_con_sede`), QUITARLAS (no hay sede). Verificar que la union de TipoAccion sea exactamente las 14 del diseño §5.

    **config.ts:** Clonar de `src/lib/agents/godentist-fb-ig/config.ts` con estos cambios CONCRETOS:
    - `export const VARIXCENTER_AGENT_ID = 'varixcenter' as const`
    - `id: VARIXCENTER_AGENT_ID`
    - `name: 'Varixcenter Valoraciones'`
    - `description: 'Agente de agendamiento de valoraciones flebológicas. Slots reales vs varix-clinic. WA + FB + IG.'`
    - `intentDetector` y `orchestrator`: ambos `model: CLAUDE_MODELS.HAIKU` con los mismos PLACEHOLDER (el motor usa comprehension.ts + sales-track.ts directamente).
    - `tools`: copiar verbatim el set de godentist-fb-ig (`crm.contact.create`, `crm.contact.update`, `crm.contact.get`, `whatsapp.message.send`). El write a varix-clinic NO es tool del registry.
    - `states`: las 7 fases del diseño §3 EXACTAS: `['initial','capturing_data','capturing_fecha','showing_availability','confirming','appointment_registered','closed']`
    - `initialState: 'initial'`
    - `validTransitions` (mapear según diseño §3/§7):
      ```typescript
      initial: ['capturing_data','capturing_fecha','showing_availability','closed'],
      capturing_data: ['capturing_fecha','showing_availability','closed'],
      capturing_fecha: ['showing_availability','closed'],
      showing_availability: ['confirming','showing_availability','closed'],
      confirming: ['appointment_registered','showing_availability','closed'],
      appointment_registered: ['closed'],
      closed: [],
      ```
    - `confidenceThresholds`: verbatim (proceed:80, reanalyze:60, clarify:40, handoff:0).
    - `tokenBudget: 50_000` verbatim.
  </action>
  <verify>
    <automated>grep -c "VARIXCENTER_AGENT_ID = 'varixcenter'" src/lib/agents/varixcenter/config.ts && grep -c "appointment_registered" src/lib/agents/varixcenter/config.ts</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "VARIXCENTER_AGENT_ID = 'varixcenter'" src/lib/agents/varixcenter/config.ts` = 1
    - config.ts `states` array contiene exactamente los 7 nombres: initial, capturing_data, capturing_fecha, showing_availability, confirming, appointment_registered, closed
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/config.ts src/lib/agents/varixcenter/types.ts` = 0 matches
    - `grep -c "sede" src/lib/agents/varixcenter/config.ts src/lib/agents/varixcenter/types.ts` = 0 (no hay sede)
  </acceptance_criteria>
  <done>config.ts y types.ts existen; ID literal correcto; 7 fases; cero referencias a sede/godentist.</done>
</task>

<task type="auto">
  <name>Task 2: constants.ts (24 intents + sets + festivos TZ-safe + CRITICAL_FIELDS cedula)</name>
  <read_first>
    - src/lib/agents/godentist/constants.ts (analog base — intents, ESCAPE_INTENTS, INFORMATIONAL_INTENTS, SIGNIFICANT_ACTIONS, FESTIVOS_COLOMBIA_2026 líneas 218-249, isNonWorkingDay)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §1 (24 intents) + §4 (gates) + §6 (timers)
    - .planning/standalone/agent-varixcenter/PATTERNS.md sección constants.ts (Opción B: clonar el Set de festivos)
  </read_first>
  <files>src/lib/agents/varixcenter/constants.ts</files>
  <action>
    Clonar la estructura de `src/lib/agents/godentist/constants.ts` con estos cambios CONCRETOS:

    **VARIX_INTENTS** (24 del diseño §1) — reemplazar GD_INTENTS:
    Informacionales (12): `saludo`, `precio_tratamiento`, `precio_valoracion`, `info_tratamiento`, `info_laser`, `info_examen_doppler`, `info_medias`, `ubicacion`, `horarios`, `financiacion`, `seguros_eps`, `sintomas_descripcion`.
    Acciones cliente (5): `quiero_agendar`, `datos`, `seleccion_horario`, `confirmar`, `rechazar`.
    Escape (5): `asesor`, `reagendamiento`, `cancelar_cita`, `queja`, `paciente_antiguo`.
    Otros (2): `acknowledgment`, `otro`.

    **ESCAPE_INTENTS** = `new Set(['asesor','reagendamiento','cancelar_cita','queja','paciente_antiguo'])` (diseño §1 Escape).

    **INFORMATIONAL_INTENTS** = `new Set([...los 12 informacionales...])`.

    **SIGNIFICANT_ACTIONS** = Set con las acciones que `derivePhase` considera fase-cambiantes: `pedir_datos`, `pedir_datos_parcial`, `pedir_fecha`, `mostrar_disponibilidad`, `mostrar_confirmacion`, `agendar_cita`, `handoff`, `no_interesa`.

    **ACTION_TEMPLATE_MAP**: mapear cada TipoAccion al template ID de PLANTILLAS.md (`pedir_datos`→'pedir_datos', `pedir_fecha`→'pedir_fecha', `mostrar_disponibilidad`→'mostrar_disponibilidad', `mostrar_confirmacion`→'confirmar_cita', `agendar_cita`→'cita_agendada', `invitar_agendar`→'invitar_agendar', `handoff`→'handoff', `no_interesa`→'no_interesa', `retoma_datos`→'retoma_datos', `retoma_fecha`→'retoma_fecha', `retoma_horario`→'retoma_horario', `retoma_confirmacion`→'retoma_confirmacion'). Copiar el shape exacto que use godentist.

    **CRITICAL_FIELDS** (CRÍTICO — D-05) = `['nombre','telefono','cedula'] as const`. EXPORTARLO (`export const VARIX_CRITICAL_FIELDS`) para que el VAL guard del runner (Wave 3) lo importe en vez de hardcodear. NO usar 'sede_preferida'.

    **Festivos (Opción B recomendada — clonar el Set para desacoplar):** Copiar verbatim `FESTIVOS_COLOMBIA_2026` (Set de strings YYYY-MM-DD) y la función `isNonWorkingDay(fecha: string): 'domingo'|'festivo'|null` de godentist/constants.ts líneas 218-249. CRÍTICO (Regla 2): la detección de día usa `new Date(Date.UTC(y, m-1, d)).getUTCDay() === 0` para domingo — copiar ESE patrón exacto, NUNCA `new Date(fecha).getDay()`.

    **Timers (diseño §6):** definir las duraciones L1=180s, L2=120s, L3=120s, L4=120s, L5=180s, L6=90s en un objeto exportado (espejo de la estructura de timers de godentist).
  </action>
  <verify>
    <automated>grep -c "VARIX_INTENTS" src/lib/agents/varixcenter/constants.ts && grep -c "'nombre', 'telefono', 'cedula'\|'nombre','telefono','cedula'" src/lib/agents/varixcenter/constants.ts && grep -c "Date.UTC" src/lib/agents/varixcenter/constants.ts</automated>
  </verify>
  <acceptance_criteria>
    - VARIX_INTENTS contiene exactamente 24 strings (los del diseño §1)
    - `grep -E "VARIX_CRITICAL_FIELDS|CRITICAL_FIELDS" src/lib/agents/varixcenter/constants.ts` muestra `['nombre','telefono','cedula']` (espacios opcionales) y NO contiene 'sede_preferida'
    - `grep -c "sede" src/lib/agents/varixcenter/constants.ts` = 0
    - `grep -c "Date.UTC" src/lib/agents/varixcenter/constants.ts` ≥ 1 (detección domingo TZ-safe Regla 2)
    - `isNonWorkingDay` exportada y devuelve 'domingo'|'festivo'|null
    - ESCAPE_INTENTS contiene exactamente: asesor, reagendamiento, cancelar_cita, queja, paciente_antiguo
  </acceptance_criteria>
  <done>constants.ts con 24 intents, sets correctos, festivos TZ-safe clonados, CRITICAL_FIELDS=['nombre','telefono','cedula'] exportado.</done>
</task>

<task type="auto">
  <name>Task 3: guards.ts + phase.ts (clon verbatim/adaptado)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/guards.ts (clon VERBATIM — header dice "DO NOT modify")
    - src/lib/agents/godentist-fb-ig/phase.ts (analog — adaptar el switch acción→fase)
    - src/lib/agents/varixcenter/constants.ts (recién creado — ESCAPE_INTENTS, SIGNIFICANT_ACTIONS)
  </read_first>
  <files>src/lib/agents/varixcenter/guards.ts, src/lib/agents/varixcenter/phase.ts</files>
  <action>
    **guards.ts:** Clonar VERBATIM `src/lib/agents/godentist-fb-ig/guards.ts`. El cuerpo de `checkGuards(analysis)` no cambia (R0: confidence < threshold + intent `otro` → handoff; R1: `ESCAPE_INTENTS.has(intent)` → handoff). Solo ajustar el import de `ESCAPE_INTENTS` para que apunte a `./constants` de varixcenter. Cambiar el comentario de header a varixcenter.

    **phase.ts:** Clonar `src/lib/agents/godentist-fb-ig/phase.ts`. `derivePhase(acciones)` escanea de más reciente a más antiguo y mapea `tipo` de acción → fase. Adaptar el switch a las acciones del diseño §5/§7 y las 7 fases del diseño §3:
    - `pedir_datos` / `pedir_datos_parcial` → `'capturing_data'`
    - `pedir_fecha` → `'capturing_fecha'`
    - `mostrar_disponibilidad` → `'showing_availability'`
    - `mostrar_confirmacion` → `'confirming'`
    - `agendar_cita` → `'appointment_registered'`
    - `handoff` / `no_interesa` → `'closed'`
    - default → `'initial'`
    **QUITAR** cualquier case `pedir_datos_con_sede` (no hay sede). `SIGNIFICANT_ACTIONS` se importa de `./constants`.
  </action>
  <verify>
    <automated>grep -c "checkGuards" src/lib/agents/varixcenter/guards.ts && grep -c "appointment_registered" src/lib/agents/varixcenter/phase.ts</automated>
  </verify>
  <acceptance_criteria>
    - guards.ts exporta `checkGuards` e importa ESCAPE_INTENTS desde './constants'
    - phase.ts `derivePhase` mapea agendar_cita→'appointment_registered' y mostrar_disponibilidad→'showing_availability'
    - `grep -c "sede" src/lib/agents/varixcenter/guards.ts src/lib/agents/varixcenter/phase.ts` = 0
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/guards.ts src/lib/agents/varixcenter/phase.ts` = 0 matches
  </acceptance_criteria>
  <done>guards.ts y phase.ts existen, adaptados a las 7 fases, sin sede ni referencias a godentist.</done>
</task>

</tasks>

<verification>
- Los 5 archivos puros existen en src/lib/agents/varixcenter/
- `npx tsc --noEmit 2>&1 | grep varixcenter` no muestra errores nuevos (pueden faltar imports de archivos de waves posteriores — registrar como esperado si los hay)
- Gate Regla 3 parcial: `grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0
</verification>

<success_criteria>
- VARIXCENTER_AGENT_ID = 'varixcenter' literal
- 24 intents + 7 fases definidos
- CRITICAL_FIELDS=['nombre','telefono','cedula'] (D-05) exportado
- Festivos TZ-safe clonados (Regla 2)
- Cero referencias a sede o 'godentist' en los 5 archivos
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/02-SUMMARY.md`
</output>
