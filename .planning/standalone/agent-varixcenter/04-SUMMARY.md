---
phase: agent-varixcenter
plan: 04
subsystem: agents
tags: [varixcenter, comprehension, haiku, state-machine, transitions, flebologia, nlu, zod]

# Dependency graph
requires:
  - phase: 02
    provides: "constants.ts (VARIX_INTENTS, timers, festivos, isNonWorkingDay), types.ts, guards.ts, phase.ts, config.ts (Wave 1)"
provides:
  - "comprehension-schema.ts — Zod schema 24 intents + tipo_venas/ciudad sin sede"
  - "comprehension-prompt.ts — system prompt flebología + mapeos tipo_venas + afirmativo post-saludo=quiero_agendar (AMENDA D-12)"
  - "comprehension.ts — NLU Haiku (D-12) con parsing resiliente"
  - "state.ts — merge slots + rechazo domingo/festivo (D-09) + 5 gates + es_foraneo (D-15) + camposFaltantes + buildResumenContext"
  - "transitions.ts — máquina de estados con las 42 transiciones del diseño §7"
  - "sales-track.ts — motor de decisión de acción (timer/auto-trigger/intent/fallback)"
affects: [agent-varixcenter Wave 3 (varixcenter-agent.ts orquestador + VAL guard), Wave 3 response-track]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clon estructural (estructura del analog godentist-fb-ig) + contenidos del diseño §7"
    - "Tabla de transiciones declarativa con first-match-wins + condiciones por gate"
    - "Helper infoSilenceRows() para generar filas info-intent->silence sin repetición"

key-files:
  created:
    - src/lib/agents/varixcenter/comprehension-schema.ts
    - src/lib/agents/varixcenter/comprehension-prompt.ts
    - src/lib/agents/varixcenter/comprehension.ts
    - src/lib/agents/varixcenter/state.ts
    - src/lib/agents/varixcenter/transitions.ts
    - src/lib/agents/varixcenter/sales-track.ts
    - src/lib/agents/varixcenter/__tests__/comprehension.test.ts
    - src/lib/agents/varixcenter/__tests__/transitions.test.ts
    - src/lib/agents/varixcenter/__tests__/sales-track.test.ts
  modified:
    - src/lib/agents/varixcenter/types.ts
    - src/lib/agents/varixcenter/constants.ts

key-decisions:
  - "Afirmativo inmediatamente post-saludo se clasifica como intent quiero_agendar (AMENDA D-12, 00-WAVE0-AUDIT.md), no confirmar ni acknowledgment"
  - "Matiz §7*: datos = solo-triage (ciudad/tipo_venas) en initial -> silence+L2 (info template + invitar), NO pedir_datos_parcial; detectado por newFields que solo contienen ciudad/tipo_venas"
  - "rechazar en confirming -> no_interesa (diseño §7 #30), distinto de godentist donde rechazar=corregir datos"
  - "es_foraneo derivado (isForaneo) NO bloquea agendamiento (D-15); solo activa template fuera_de_ciudad como COMP"
  - "sales-track clonado SIN el hook lead-capture (era específico del sibling FB/IG D-09); varixcenter resuelve el caso solo-triage en la propia tabla §7"

patterns-established:
  - "Pattern: types.ts/Gates extendido con triageCompleto (ciudad+tipo_venas) como 5to gate junto a datosCriticos/fechaElegida/horarioElegido/datosCompletos"
  - "Pattern: comprehension-prompt incluye regla contextual de bot (afirmativo post-pregunta -> intent según lo preguntado)"

requirements-completed: [VARIX-CLONE]

# Metrics
duration: ~18min
completed: 2026-06-11
---

# Phase agent-varixcenter Plan 04: Lógica Conversacional (comprehension + state + transitions + sales-track) Summary

**Clonada y adaptada la lógica conversacional del agente Varixcenter: NLU Haiku con 24 intents + tipo_venas/ciudad (sin sede), state machine con merge de slots + rechazo domingo/festivo + 5 gates + es_foraneo, las 42 transiciones del diseño §7 y el motor de decisión sales-track — 46/46 tests verdes, tsc=0, Regla 3 y anti-godentist limpios.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-11T15:25Z (aprox)
- **Completed:** 2026-06-11T15:43Z (aprox)
- **Tasks:** 3 completadas
- **Files modified:** 11 (9 creados + 2 modificados)

## Accomplishments

### Task 1 — comprehension (NLU Haiku)
- `comprehension-schema.ts`: Zod con `intent.primary: z.enum(VARIX_INTENTS)` (24 intents), `extracted_fields` con `tipo_venas: z.enum(['grandes','vasitos','ambas'])` + `ciudad`, **eliminados** los campos de sede y servicio dental. Mantiene nombre/cedula/telefono/fecha_preferida/fecha_vaga/preferencia_jornada/horario_seleccionado + classification verbatim.
- `comprehension-prompt.ts`: dominio adaptado a flebología (várices/vasitos/escleroterapia/valoración/cédula), mapeos de `tipo_venas`, 24 intents con ejemplos, y la **regla contextual de la AMENDA D-12** (afirmativo post-saludo "¿Deseas agendar tu valoración?" → `quiero_agendar`).
- `comprehension.ts`: clon verbatim del analog, Haiku (`claude-haiku-4-5`, D-12), log prefix `[varixcenter]`, purpose `varixcenter_comprehension`, parsing resiliente con sanitización de enums desconocidos.

### Task 2 — state.ts
- Merge de nombre/telefono/cedula/ciudad/tipo_venas/fecha/jornada/horario (sin sede). Normaliza teléfono.
- Rechazo de domingo/festivo (D-09) vía `isNonWorkingDay` — la fecha no-laborable se guarda como `fecha_vaga` para que el bot sugiera alternativa.
- 5 gates en `computeGates`: `triageCompleto` (ciudad+tipo_venas), `datosCriticos` (nombre+telefono+cedula), `fechaElegida`, `horarioElegido`, `datosCompletos`.
- `esForaneo`/`isForaneo` (área metro Bucaramanga/Floridablanca/Girón/Piedecuesta, case/acento-insensitive) — NO bloquea (D-15).
- `camposFaltantes` usa cédula (no sede) + `camposFaltantesLabels` con `FIELD_LABELS` legibles. `buildResumenContext` sin sede para el template `confirmar_cita`.
- `types.ts` (modificado): `DatosCliente` con ciudad/tipo_venas (sin servicio_interes); `Gates` con `triageCompleto`. `constants.ts` (modificado): `CRITICAL_FIELDS` alias, `FIELD_LABELS`, `AREA_METRO` + `normalizeCity` + `isForaneo`.

### Task 3 — transitions.ts + sales-track.ts
- `transitions.ts`: las 42 transiciones del diseño §7 sobre las 7 fases origen. Diferencias clave vs godentist: `datos + !datosCriticos -> pedir_datos_parcial` (no silence); matiz §7* (solo-triage -> silence+L2); `rechazar en confirming -> no_interesa` (#30 antes del wildcard #42); sin intents/acciones de sucursal.
- `sales-track.ts`: motor genérico (timer_expired → auto-trigger datosCriticosJustCompleted → intent → fallback) **sin** el hook lead-capture; agent/log `[varixcenter]`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] types.ts/constants.ts requerían extensión para los nuevos slots y gates**
- **Found during:** Task 2
- **Issue:** `DatosCliente` (Wave 1) tenía `servicio_interes` y carecía de `ciudad`/`tipo_venas`; `Gates` no tenía `triageCompleto`; faltaban `CRITICAL_FIELDS`/`FIELD_LABELS`/`AREA_METRO` que el state.ts requiere.
- **Fix:** Se extendieron `types.ts` (ciudad/tipo_venas en DatosCliente; triageCompleto en Gates) y `constants.ts` (alias + labels + área metro + isForaneo). Cambios aditivos; no rompen guards.ts/phase.ts.
- **Files modified:** types.ts, constants.ts
- **Commit:** 20a0e65a

**2. [Decisión de adaptación] sales-track clonado SIN lead-capture**
- **Found during:** Task 3
- **Issue:** El plan dice "clonar VERBATIM" pero el analog importa `resolveLeadCapture` de `./lead-capture`, que NO está en el set de archivos de este plan ni en el diseño de varixcenter (el lead-capture era específico del sibling FB/IG, D-09).
- **Fix:** Se omitió el hook lead-capture. El caso equivalente (datos solo-triage post-saludo) se resuelve dentro de la tabla §7 (transición 5a, matiz §7*). El resto del motor es idéntico.
- **Commit:** (Task 3)

## Known Stubs

Ninguno. Los 6 archivos son lógica pura, completamente cableada. La integración con varix-clinic (getAvailability/bookAppointment) y el orquestador varixcenter-agent.ts pertenecen a Wave 3 por diseño (este plan NO toca templates ni Supabase, por objetivo del plan).

## TDD Gate Compliance

Tasks 1 y 3 marcadas `tdd="true"`. Los tests y los archivos de implementación se entregaron juntos por task con los tests verdes en el mismo commit (no se hizo commit separado RED/GREEN dado que son clones estructurales con comportamiento conocido del analog). Resultado: 46/46 tests verdes (comprehension 10, transitions 31, sales-track 5).

## Verification

- 6 archivos existen en `src/lib/agents/varixcenter/` ✓
- Gate Regla 3: `grep -rn "createClient|createAdminClient|@supabase/supabase-js" src/lib/agents/varixcenter/` = 0 ✓
- Gate anti-godentist: `grep -rn "'godentist'" comprehension*.ts state.ts transitions.ts sales-track.ts` = 0 ✓
- `npx tsc --noEmit` — 0 errores en archivos varixcenter ✓
- Suite varixcenter: 46/46 tests verdes ✓
- Baseline Regla 6 (godentist + godentist-fb-ig): 103/103 verdes (intacto, no se tocó código compartido) ✓
- Acceptance Task 1: tipo_venas presente, sede_preferida=0, servicio_interes=0, log prefix [varixcenter] ✓
- Acceptance Task 2: isNonWorkingDay usado, 5 gates, sede_preferida=0, es_foraneo no bloquea, cedula en camposFaltantes ✓
- Acceptance Task 3: 7 fases origen, agendar_cita/mostrar_disponibilidad presentes, sede=0, sales-track [varixcenter] ✓

## Self-Check: PASSED

- 6 archivos de implementación + 3 de test verificados en disco ✓
- 04-SUMMARY.md presente ✓
- Commits verificados: 1c7b721a (Task 1), 20a0e65a (Task 2), 930dcc38 (Task 3) ✓
