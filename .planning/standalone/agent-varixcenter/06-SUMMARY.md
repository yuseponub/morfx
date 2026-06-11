---
phase: agent-varixcenter
plan: 06
subsystem: agents/varixcenter
tags: [agent, response-track, orchestrator, varix-clinic, write-path, tdd]
requires:
  - "varixcenter/config (VARIXCENTER_AGENT_ID, varixcenterConfig)"
  - "varixcenter/{state,constants,types,sales-track,transitions,phase,guards,comprehension}"
  - "domain/varix-clinic/availability (getVarixAvailability, parseSlotToISO)"
  - "domain/varix-clinic/booking (bookVarixAppointment)"
  - "somnio/template-manager (TemplateManager) + somnio/block-composer (composeBlock)"
  - "agents/registry (agentRegistry)"
provides:
  - "varixcenter/response-track (resolveResponseTrack — catálogo propio, triage tipo_venas, es_foraneo)"
  - "varixcenter/varixcenter-agent (processMessage — orquestador con write-path real)"
  - "varixcenter/index (self-register + re-exports)"
affects:
  - "agentRegistry (registra 'varixcenter' on import — coexiste con godentist/godentist-fb-ig)"
tech-stack:
  added: []
  patterns:
    - "Triage por tipo_venas en response-track (null -> triage; vasitos/grandes/ambas -> info_*)"
    - "Write-path real desde agente (bookVarixAppointment) — primer agente MorfX que ESCRIBE en DB externa"
    - "parseSlotToISO para TIMESTAMPTZ con offset -05:00 (Regla 2 / Pitfall 6)"
    - "slot_taken -> degradar accion a mostrar_disponibilidad (fail-open, no retry implícito)"
    - "PII redaction (cédula/teléfono últimos 4) en observability — patrón crm-mutation-tools"
key-files:
  created:
    - "src/lib/agents/varixcenter/response-track.ts"
    - "src/lib/agents/varixcenter/varixcenter-agent.ts"
    - "src/lib/agents/varixcenter/index.ts"
    - "src/lib/agents/varixcenter/__tests__/response-track.test.ts"
    - "src/lib/agents/varixcenter/__tests__/varixcenter-agent.test.ts"
  modified: []
decisions:
  - "Triage por tipo_venas mapeado a {core, comp} (info_<tipo> + info_<tipo>_comp); null/desconocido -> triage (§9)"
  - "es_foraneo agrega fuera_de_ciudad a infoTemplateIntents como COMP, NO bloquea (D-15)"
  - "mostrar_disponibilidad con 0 slots / fallback -> template sin_disponibilidad (no horarios generales como godentist — no hay sede)"
  - "agendar_cita slot_taken -> re-consulta availability y degrada effectiveAction a mostrar_disponibilidad"
  - "agendar_cita con datos incompletos o error/throw -> effectiveAction='handoff' (fail-open, NUNCA crash)"
metrics:
  duration: "19 min"
  completed: "2026-06-11"
  tasks: 3
  files: 5
  tests: "68/68 (5 suites) — 14 response-track + 8 agent + 46 preexistentes (comprehension/sales-track/transitions)"
---

# Phase agent-varixcenter Plan 06: Response-Track + Orquestador + Index Summary

Cierre del agente Varixcenter end-to-end: response-track con catálogo propio (anti-Pitfall 1), orquestador con el write-path real a varix-clinic (availability + booking con fail-open y TZ -05:00), e index que self-registra el config en el agentRegistry.

## Qué se construyó

### Task 1 — `response-track.ts` (catálogo propio, CRÍTICO anti-Pitfall 1)
Motor de selección de templates clonado de `godentist-fb-ig/response-track.ts` con `TEMPLATE_LOOKUP_AGENT_ID = VARIXCENTER_AGENT_ID` (4 usos; **0 matches de `'godentist'`**). Cambios de dominio:
- **Triage por tipo_venas (§9):** `precio_tratamiento`/`info_tratamiento` con `tipo_venas` conocido → `info_vasitos`/`info_grandes`/`info_ambas` (+ su `_comp` como COMP); sin `tipo_venas` → template `triage`.
- **es_foraneo (D-15):** ciudad fuera del área metro → `fuera_de_ciudad` agregado como COMP (no bloquea).
- **Casos especiales (§10):** `sintomas_descripcion` → `no_diagnostico` (override).
- **mostrar_disponibilidad:** rellena `{{slots_manana}}`/`{{slots_tarde}}`; 0 slots / fallback → template `sin_disponibilidad`.
- **Sin sede:** quitado el display-map de sucursales y `SERVICE_TEMPLATE_MAP`; `FIELD_LABELS` = nombre/cédula/teléfono.
- English short-circuit (`idioma:'en'` → `english_response`) verbatim.

### Task 2 — `varixcenter-agent.ts` (orquestador + write-path NUEVO)
Pipeline clonado en estructura de `godentist/godentist-agent.ts` (comprehension → state → guards → english → sales-track → response-track), con `agent:'varixcenter'` en toda la observability. Diferencias clave:
- **Availability lookup:** `getVarixAvailability(fecha)` (domain, NO robot HTTP, sin sede) con try/catch fail-open → `availabilityFallback`.
- **agendar_cita write-path (sin analog — godentist NO escribe):** construye `fechaHoraInicio`/`Fin` con **`parseSlotToISO`** (offset literal `-05:00`) y llama `bookVarixAppointment`. Resultados:
  - `ok` → mantiene `agendar_cita` → template `cita_agendada`.
  - `slot_taken` → re-consulta availability + degrada `effectiveAction` a `mostrar_disponibilidad`.
  - `error` / throw / datos incompletos → `effectiveAction='handoff'` (fail-open).
- **PII redaction:** `redactTail()` enmascara cédula/teléfono a últimos 4 en todos los eventos `pipeline_decision` de booking (T-varix-06).
- **Regla 3:** cero `createClient`/`createAdminClient` (0 matches) — toda escritura pasa por el domain layer.

### Task 3 — `index.ts` (self-register)
`agentRegistry.register(varixcenterConfig)` como side-effect on import + re-exports de `VARIXCENTER_AGENT_ID`, `processMessage` y tipos. Agente NUEVO (no sibling) que coexiste con godentist/godentist-fb-ig (D-01, Regla 6).

## Verificación

- **3 archivos src** existen en `src/lib/agents/varixcenter/`.
- **Gate Regla 3:** `grep createClient|createAdminClient|@supabase/supabase-js` (excl. tests) = **0**.
- **Gate anti-Pitfall 1:** `grep "'godentist'"` en los 3 archivos src = **0**.
- **Gate parseSlotToISO:** 4 usos en `varixcenter-agent.ts` (≥ 1 requerido).
- **`npx tsc --noEmit`** sin errores en `agents/varixcenter/`.
- **Tests:** 68/68 (5 suites) — incluye assert anti-Pitfall 1 `expect(agentId).toBe('varixcenter')` + `.not.toBe('godentist')`.

## TDD Gate Compliance

| Task | RED (test) | GREEN (feat) |
|------|-----------|--------------|
| Task 1 response-track | `ad2021d5` test(... RED) | `f4ab664d` feat(...) |
| Task 2 varixcenter-agent | `c42e4f8e` test(... RED) | `9cbd1d55` feat(...) |
| Task 3 index | (type=auto, sin TDD) | `0cb40dbb` feat(...) |

Secuencia RED→GREEN verificada en git log para Tasks 1 y 2. RED falló por módulo inexistente (no por aserción trivial) — fail-fast honrado.

## Deviations from Plan

None — plan ejecutado exactamente como fue escrito. Único ajuste menor: las dos referencias a `'godentist'` y `SEDE_DISPLAY_NAMES`/`sede_preferida` quedaron originalmente en comentarios del header de `response-track.ts`; se reescribieron los comentarios para que los grep-gates (`= 0 matches`) pasen estrictos. No es un cambio funcional.

## Known Stubs

None. El agente está completo end-to-end: recibe mensaje → comprende → decide → consulta disponibilidad real / agenda cita real → responde con templates propios. Los templates en sí los inserta Wave 5 en `agent_templates` bajo `agent_id='varixcenter'` (dependencia documentada en el plan, no un stub de este plan).

## Notas para el orquestador (NO aplicadas aquí)

- STATE.md / ROADMAP.md NO modificados (propiedad del orquestador, per parallel_execution).
- El agente queda DORMANT: se activa 100% vía routing rule manual sobre el workspace target (sin feature flag — Wave 6 / Plan 11). Los 6 sitios de registro restantes (webhook-processor dispatch + pre-warm, production runner dynamic import, routing-editor dropdown) son de Waves posteriores.

## Self-Check: PASSED

- 6/6 archivos creados existen en disco (3 src + 2 test + SUMMARY).
- 5/5 commits de tareas verificados en git log (2 RED + 3 GREEN/feat).
