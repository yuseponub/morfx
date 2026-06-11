---
phase: agent-varixcenter
plan: 04
type: execute
wave: 2
depends_on: [02]
files_modified:
  - src/lib/agents/varixcenter/comprehension-schema.ts
  - src/lib/agents/varixcenter/comprehension-prompt.ts
  - src/lib/agents/varixcenter/comprehension.ts
  - src/lib/agents/varixcenter/state.ts
  - src/lib/agents/varixcenter/transitions.ts
  - src/lib/agents/varixcenter/sales-track.ts
autonomous: true
requirements: [VARIX-CLONE]

must_haves:
  truths:
    - "El comprehension extrae los slots del diseño §2 (nombre, telefono, cedula, ciudad, tipo_venas, fecha_preferida, preferencia_jornada, horario_seleccionado) — sin sede"
    - "tipo_venas es enum grandes|vasitos|ambas con los mapeos del diseño §2"
    - "state.ts mergea slots y rechaza domingo/festivo vía isNonWorkingDay (D-09)"
    - "transitions.ts implementa las 42 transiciones del diseño §7"
    - "Los gates triageCompleto/datosCriticos/fechaElegida/horarioElegido/datosCompletos están implementados"
  artifacts:
    - path: "src/lib/agents/varixcenter/comprehension-schema.ts"
      provides: "Zod schema con 24 intents + slots sin sede + tipo_venas enum"
      contains: "tipo_venas"
    - path: "src/lib/agents/varixcenter/transitions.ts"
      provides: "Máquina de estados — 42 transiciones del diseño §7"
    - path: "src/lib/agents/varixcenter/state.ts"
      provides: "merge slots + rechazo domingo/festivo + gates"
    - path: "src/lib/agents/varixcenter/sales-track.ts"
      provides: "decisión de acción a partir de estado+transición"
  key_links:
    - from: "state.ts"
      to: "constants.ts isNonWorkingDay"
      via: "rechazo de fecha en domingo/festivo"
      pattern: "isNonWorkingDay"
---

<objective>
Wave 2 — Clonar la lógica conversacional del agente: comprehension (NLU Haiku), state (merge+gates+rechazo festivo), transitions (máquina §7), sales-track (decisión de acción). Estos son clones verbatim/adaptados de godentist-fb-ig; la adaptación principal es eliminar `sede` y agregar `tipo_venas`/`cedula`, más reescribir la tabla de transiciones según el diseño §7.

Purpose: Producir la "decisión de acción" del agente (qué hacer en cada turno) que varixcenter-agent.ts (Wave 3) orquesta. NO toca templates ni Supabase.
Output: 6 archivos en src/lib/agents/varixcenter/.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/agent-varixcenter/DISENO-COMPLETO.md
@.planning/standalone/agent-varixcenter/PATTERNS.md
@src/lib/agents/godentist-fb-ig/comprehension-schema.ts
@src/lib/agents/godentist-fb-ig/comprehension-prompt.ts
@src/lib/agents/godentist-fb-ig/comprehension.ts
@src/lib/agents/godentist-fb-ig/state.ts
@src/lib/agents/godentist-fb-ig/transitions.ts
@src/lib/agents/godentist-fb-ig/sales-track.ts
@src/lib/agents/varixcenter/constants.ts
@src/lib/agents/varixcenter/config.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: comprehension-schema.ts + comprehension-prompt.ts + comprehension.ts</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/comprehension-schema.ts (analog — bloques intent/extracted_fields/classification)
    - src/lib/agents/godentist-fb-ig/comprehension-prompt.ts (analog — adaptar ejemplos)
    - src/lib/agents/godentist-fb-ig/comprehension.ts (clon verbatim + rename log prefix)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §1 (24 intents) + §2 (slots + enums + mapeos)
    - src/lib/agents/varixcenter/constants.ts (VARIX_INTENTS)
  </read_first>
  <behavior>
    - El schema valida `intent.primary` como uno de los 24 VARIX_INTENTS
    - extracted_fields incluye: nombre, telefono (573XXXXXXXXX), cedula, ciudad, tipo_venas (enum), fecha_preferida, fecha_vaga, preferencia_jornada, horario_seleccionado
    - extracted_fields NO incluye sede_preferida ni servicio_interes
    - tipo_venas mapea "arañitas"/"vasculares"/"venitas"→vasitos, "vena gruesa/pronunciada/interna"→grandes, "las dos"/"de todo"→ambas
  </behavior>
  <action>
    **comprehension-schema.ts:** Clonar de godentist-fb-ig con estos cambios CONCRETOS (diseño §2):
    - `intent.primary: z.enum(VARIX_INTENTS)` (importar de ./constants).
    - **ELIMINAR** `sede_preferida` y `servicio_interes` de extracted_fields (1 sola sede, 1 solo servicio relevante).
    - **AGREGAR** `tipo_venas: z.enum(['grandes','vasitos','ambas']).nullable()` con `.describe()` que liste los mapeos: 'arañitas','vasculares','venitas','vasitos pequeños' → vasitos; 'vena gruesa','vena pronunciada','vena interna','varices grandes' → grandes; 'las dos','ambas','de todo' → ambas.
    - **AGREGAR** `ciudad: z.string().nullable()`.
    - **MANTENER verbatim:** `nombre`, `cedula` (z.string().nullable()), `telefono` (formato `573XXXXXXXXX`), `fecha_preferida`/`fecha_vaga` (la lógica de fecha vaga es idéntica a godentist — copiar verbatim), `preferencia_jornada`, `horario_seleccionado`.
    - `classification` (category/sentiment/idioma): verbatim.
    - `export type MessageAnalysis = z.infer<typeof ...>`.

    **comprehension-prompt.ts:** Clonar de godentist-fb-ig y adaptar el dominio: cambiar ejemplos de odontología a flebología (várices/vasitos/escleroterapia/valoración/cédula). Listar los 24 intents con ejemplos del diseño §1. Incluir instrucciones de los mapeos de tipo_venas. Mantener la estructura del prompt (secciones de extracción de fechas vagas, normalización de teléfono a 573XXXXXXXXX, idioma).

    **comprehension.ts:** Clonar VERBATIM de godentist-fb-ig/comprehension.ts. Solo cambiar: el import del schema/prompt a los de varixcenter, y el log prefix `[godentist-fb-ig]` → `[varixcenter]`. El modelo sigue siendo Haiku (D-12).
  </action>
  <verify>
    <automated>grep -c "tipo_venas" src/lib/agents/varixcenter/comprehension-schema.ts && grep -c "sede_preferida" src/lib/agents/varixcenter/comprehension-schema.ts</automated>
  </verify>
  <acceptance_criteria>
    - comprehension-schema.ts contiene `tipo_venas: z.enum(['grandes','vasitos','ambas'])` y `ciudad`
    - `grep -c "sede_preferida" src/lib/agents/varixcenter/comprehension-schema.ts` = 0
    - `grep -c "servicio_interes" src/lib/agents/varixcenter/comprehension-schema.ts` = 0
    - comprehension-schema.ts mantiene nombre, cedula, telefono, fecha_preferida, fecha_vaga, preferencia_jornada, horario_seleccionado
    - comprehension.ts log prefix es `[varixcenter]`, NO `[godentist`
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/comprehension*.ts` = 0 matches
  </acceptance_criteria>
  <done>Comprehension extrae los slots correctos (con tipo_venas/cedula, sin sede), 24 intents, Haiku.</done>
</task>

<task type="auto">
  <name>Task 2: state.ts (merge slots + rechazo domingo/festivo + gates)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/state.ts (analog — merge + rechazo fecha + gates + camposFaltantes + buildResumenContext)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §4 (gates) + §2 (es_foraneo derivado)
    - src/lib/agents/varixcenter/constants.ts (isNonWorkingDay, CRITICAL_FIELDS)
  </read_first>
  <files>src/lib/agents/varixcenter/state.ts</files>
  <action>
    Clonar `src/lib/agents/godentist-fb-ig/state.ts` con estos cambios CONCRETOS:

    - **Merge de slots:** mergear nombre, telefono, cedula, ciudad, tipo_venas, fecha_preferida, preferencia_jornada, horario_seleccionado. ELIMINAR el merge de sede_preferida.
    - **Rechazo de fecha en domingo/festivo (D-09):** copiar el patrón de godentist/state.ts: si `isNonWorkingDay(fields.fecha_preferida)` retorna 'domingo'|'festivo', NO guardar fecha_preferida como elegida (guardar como fecha_vaga o limpiarla para pedir otra). Importar `isNonWorkingDay` de `./constants`.
    - **Gates (diseño §4)** — implementar/exportar:
      - `triageCompleto` = ciudad ≠ null && tipo_venas ≠ null
      - `datosCriticos` = nombre ≠ null && telefono ≠ null && cedula ≠ null
      - `fechaElegida` = fecha_preferida ≠ null
      - `horarioElegido` = horario_seleccionado ≠ null
      - `datosCompletos` = datosCriticos && fechaElegida && horarioElegido
    - **es_foraneo (derivado, diseño §2):** función que retorna true si ciudad está fuera del área metro (Bucaramanga, Floridablanca, Girón, Piedecuesta). NO bloquea agendamiento (D-15) — solo activa el template `fuera_de_ciudad` como COMP en response-track.
    - **camposFaltantes:** adaptar a CRITICAL_FIELDS de varixcenter (nombre/telefono/cedula) con FIELD_LABELS legibles ("Nombre completo", "Número de cédula", "Número de teléfono").
    - **buildResumenContext:** adaptar para el template `confirmar_cita` (nombre, cedula, telefono, fecha, horario_seleccionado) — SIN sede.
  </action>
  <verify>
    <automated>grep -c "isNonWorkingDay" src/lib/agents/varixcenter/state.ts && grep -c "datosCriticos\|triageCompleto" src/lib/agents/varixcenter/state.ts && grep -c "sede_preferida" src/lib/agents/varixcenter/state.ts</automated>
  </verify>
  <acceptance_criteria>
    - state.ts importa y usa `isNonWorkingDay` para rechazar fecha domingo/festivo (D-09)
    - Exporta gates: triageCompleto, datosCriticos, fechaElegida, horarioElegido, datosCompletos (o estructura equivalente verificable)
    - `grep -c "sede_preferida" src/lib/agents/varixcenter/state.ts` = 0
    - es_foraneo detecta ciudad fuera del área metro pero NO bloquea (D-15)
    - camposFaltantes usa cedula (no sede)
  </acceptance_criteria>
  <done>state.ts mergea slots correctos, rechaza domingo/festivo, implementa los 5 gates, sin sede.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: transitions.ts + sales-track.ts (máquina §7 + decisión de acción)</name>
  <read_first>
    - src/lib/agents/godentist-fb-ig/transitions.ts (analog — estructura de la tabla de transiciones)
    - src/lib/agents/godentist-fb-ig/sales-track.ts (clon verbatim)
    - .planning/standalone/agent-varixcenter/DISENO-COMPLETO.md §7 (las 42 transiciones EXACTAS) + §6 (timers)
    - src/lib/agents/varixcenter/state.ts (gates) + constants.ts (timers L1-L6)
  </read_first>
  <behavior>
    - initial + quiero_agendar + !datosCriticos → pedir_datos (timer L1)
    - initial + datos + datosCriticos + !fechaElegida → pedir_fecha (L3)
    - showing_availability + seleccion_horario → mostrar_confirmacion (L5)
    - confirming + confirmar + datosCompletos → agendar_cita (cancel timer)
    - confirming + rechazar → no_interesa
    - cualquier fase + asesor/queja/reagendamiento/cancelar_cita/paciente_antiguo → handoff (transiciones 37-41)
    - timer_expired:L1 en capturing_data → retoma_datos
  </behavior>
  <action>
    **transitions.ts:** Reescribir la tabla de transiciones según el diseño §7 (las 42 filas son la fuente de verdad). Mantener la ESTRUCTURA del analog godentist-fb-ig (cómo se representa cada transición: estado origen + intent/evento + condición de gate + acción + timer), pero los CONTENIDOS son las 42 transiciones del diseño §7. Copiar VERBATIM las filas del diseño:
    - Desde `initial`: transiciones 1-11 (incl. saludo→silence, quiero_agendar con 3 condiciones de gate, datos con 3 condiciones, info intents→silence L2, sintomas→silence template no_diagnostico, otro conf<80→handoff, timer_expired:L2→invitar_agendar).
    - Desde `capturing_data`: 12-19 (datos con gates, auto:datos_criticos, info→silence reevaluate, acknowledgment→silence L6, timer L1→retoma_datos).
    - Desde `capturing_fecha`: 20-24.
    - Desde `showing_availability`: 25-28 (seleccion_horario→mostrar_confirmacion L5, datos nueva fecha→mostrar_disponibilidad, timer L4→retoma_horario).
    - Desde `confirming`: 29-33 (confirmar+datosCompletos→agendar_cita cancel, rechazar→no_interesa, datos corrección→mostrar_confirmacion, timer L5→retoma_confirmacion).
    - Desde `appointment_registered`: 34-36.
    - Escape cualquier fase: 37-42 (asesor/queja/reagendamiento/cancelar_cita→handoff, paciente_antiguo→handoff template propio, rechazar fuera de confirming→no_interesa).
    Los timers (L1-L6) se referencian desde constants.ts. **CRÍTICO:** la matiz de la transición 5/167 del diseño — si tras saludo el cliente solo respondió el triage (ciudad+tipo_venas), NO es pedir_datos_parcial; el response track manda el info template y L2 invita a agendar. Implementar este matiz (ver nota * del diseño §7 "Desde initial").

    **sales-track.ts:** Clonar VERBATIM de godentist-fb-ig/sales-track.ts. Es el motor genérico que evalúa la tabla de transiciones + gates y produce la acción. Solo cambiar imports (transitions/state/constants de varixcenter) y el log prefix a `[varixcenter]`. El cuerpo de la lógica NO cambia.
  </action>
  <verify>
    <automated>grep -c "agendar_cita" src/lib/agents/varixcenter/transitions.ts && grep -c "mostrar_disponibilidad" src/lib/agents/varixcenter/transitions.ts && grep -c "sede" src/lib/agents/varixcenter/transitions.ts</automated>
  </verify>
  <acceptance_criteria>
    - transitions.ts cubre las 7 fases del diseño §3 como origen
    - Contiene transiciones a: pedir_datos, pedir_fecha, mostrar_disponibilidad, mostrar_confirmacion, agendar_cita, handoff, no_interesa, invitar_agendar, retoma_* 
    - `grep -c "sede" src/lib/agents/varixcenter/transitions.ts` = 0
    - sales-track.ts log prefix es `[varixcenter]`
    - `grep -rn "'godentist'" src/lib/agents/varixcenter/transitions.ts src/lib/agents/varixcenter/sales-track.ts` = 0 matches
    - `npx tsc --noEmit 2>&1 | grep "varixcenter/\(transitions\|sales-track\|state\|comprehension\)"` no muestra errores
  </acceptance_criteria>
  <done>Máquina de estados con las 42 transiciones del diseño §7; sales-track decide la acción correcta por fase.</done>
</task>

</tasks>

<verification>
- 6 archivos existen en src/lib/agents/varixcenter/
- Gate Regla 3: `grep -rn "createClient\|createAdminClient\|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0
- Gate anti-godentist: `grep -rn "'godentist'" src/lib/agents/varixcenter/comprehension*.ts src/lib/agents/varixcenter/state.ts src/lib/agents/varixcenter/transitions.ts src/lib/agents/varixcenter/sales-track.ts` = 0
- `npx tsc --noEmit` no muestra errores nuevos en estos archivos (pueden quedar pendientes imports de response-track/agent de waves siguientes)
</verification>

<success_criteria>
- Comprehension con tipo_venas/cedula, sin sede, Haiku
- state.ts con 5 gates + rechazo festivo + es_foraneo
- transitions.ts con las 42 transiciones del diseño §7
- sales-track clonado verbatim
</success_criteria>

<output>
After completion, create `.planning/standalone/agent-varixcenter/04-SUMMARY.md`
</output>
