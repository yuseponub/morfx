---
phase: agent-varixcenter
plan: 05
subsystem: domain-layer / varix-clinic integration
tags: [availability, booking, cross-project-supabase, timezone, postgres-constraint]
dependency_graph:
  requires:
    - "src/lib/domain/varix-clinic/client.ts (Wave 1 — getVarixClinicClient)"
    - "src/lib/domain/varix-clinic/constants.ts (Wave 1 — DOCTOR_UUIDS, HORARIOS, SLOT_MINUTES, VALORACION_MOTIVO)"
    - "src/lib/agents/varixcenter/constants.ts (Wave 1 — isNonWorkingDay TZ-safe)"
  provides:
    - "getVarixAvailability(fecha) → { manana: string[], tarde: string[] }"
    - "parseSlotToISO(fecha, slotStr) → { inicio, fin } con offset -05:00"
    - "bookVarixAppointment(params) → { ok:true, appointmentId, patientId } | { ok:false, reason }"
  affects:
    - "Plan 06 (varixcenter-agent): consume getVarixAvailability (mostrar_disponibilidad) + parseSlotToISO + bookVarixAppointment (agendar_cita)"
tech_stack:
  added: []
  patterns:
    - "Generación de grilla propia (primer caso en MorfX; godentist recibe slots del robot)"
    - "Merge de N agendas: slot libre si AL MENOS uno de los doctores está libre"
    - "Retry-por-doctor en constraint Postgres 23P01 → slot_taken (mismo contract que crm-writer)"
    - "TIMESTAMPTZ con offset literal -05:00 (NUNCA new Date sin offset) — Regla 2 / Pitfall 6"
    - "Patient idempotente por cédula con manejo de carrera 23505 (re-SELECT)"
key_files:
  created:
    - "src/lib/domain/varix-clinic/availability.ts"
    - "src/lib/domain/varix-clinic/booking.ts"
    - "src/lib/domain/varix-clinic/__tests__/availability.test.ts"
    - "src/lib/domain/varix-clinic/__tests__/booking.test.ts"
  modified: []
decisions:
  - "Grilla 20min desde el inicio de cada rango → minutos :00/:20/:40 (slot mañana weekday termina en 11:00-11:20, no 11:10 como decía el plan por arithmetic slip)"
  - "Solape de rangos semi-abiertos [) (aInicio < sFin && aFin > sInicio), idéntico al gist '[)' del constraint"
  - "created_by NULL (A2 research — el bot no es un auth.users)"
  - "apellido placeholder '.' cuando el nombre tiene un solo token (apellido NOT NULL)"
metrics:
  duration_minutes: 11
  tasks_completed: 2
  files_created: 4
  tests: 24
  completed_date: 2026-06-11
---

# Phase agent-varixcenter Plan 05: Availability + Booking contra varix-clinic Summary

Las dos piezas genuinamente nuevas de la fase (sin analog directo en MorfX): generación de grilla de disponibilidad de 20min fusionando 2 agendas de doctores, y escritura real cross-project de patient+appointment en el Supabase de varix-clinic con manejo del constraint anti-solapamiento 23P01.

## What Was Built

### Task 1 — `availability.ts` (grilla 20min + merge 2 agendas + festivos)
- `getVarixAvailability(fecha)` genera slots fijos de 20 min dentro de los horarios hábiles (L-V mañana 8:00–11:30 + tarde 14:30–15:30; sábado mañana 8:00–12:00).
- Domingo / festivo → `{ manana: [], tarde: [] }` SIN consultar Supabase (D-09), vía `isNonWorkingDay` (TZ-safe `Date.UTC`).
- Día de semana calculado con `Date.UTC(...).getUTCDay()` (Regla 2) — NUNCA `new Date(fecha).getDay()`.
- Consulta las citas activas del día (`estado NOT IN (cancelada, no_asistio)`) de ambos doctores y aplica la regla de **merge**: un slot se descarta solo si AMBOS doctores están ocupados; solape evaluado con rangos semi-abiertos `[)` (igual al gist del constraint).
- `parseSlotToISO(fecha, slotStr)` exportado: convierte `"8:00 AM - 8:20 AM"` + fecha en `{ inicio, fin }` ISO con offset literal `-05:00` (Pitfall 6). Lo consume Plan 06 para construir los timestamps de `bookVarixAppointment`.

### Task 2 — `booking.ts` (patient idempotente + appointment + 23P01 retry)
- `bookVarixAppointment(params)` crea patient idempotente por cédula: SELECT primero; si no existe, INSERT; maneja la carrera `23505` (otro proceso creó el patient) con re-SELECT.
- Split nombre/apellido (primer token = nombre, resto = apellido; un solo token → apellido `'.'`) y celular normalizado a 10 dígitos (últimos 10 dígitos numéricos, quita prefijo país) — Pitfall 5.
- INSERT del appointment con **retry por doctor** en `23P01`: doctor A → si choca, doctor B → si ambos chocan, `{ ok:false, reason:'slot_taken' }`. Error no-23P01 retorna `error` sin reintentar.
- `estado:'programada'` + `motivo_consulta = VALORACION_MOTIVO` + `fecha_hora_*` verbatim con `-05:00`. `created_by` NULL (A2).
- Scope acotado a `patients` (select/insert) + `appointments` (insert) — Threat T-varix-03.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock de test con leak de mockImplementation entre tests**
- **Found during:** Task 2 (GREEN)
- **Issue:** El test "carrera 23505" sobreescribe `getVarixClinicClientMock.mockImplementation(...)`; `vi.clearAllMocks()` limpia el historial de llamadas pero NO restaura la implementación, así que los 4 tests siguientes recibían el cliente del test de carrera (devolvía `patient-race`/`appt-1`).
- **Fix:** Re-establecer `getVarixClinicClientMock.mockImplementation(() => makeClient())` en `beforeEach`.
- **Files modified:** `src/lib/domain/varix-clinic/__tests__/booking.test.ts`
- **Commit:** 8c341322

### Plan-vs-implementation discrepancy (no bug, test corregido)

**Grilla de mañana weekday: el plan decía "8:00..11:10" — es un arithmetic slip.**
- Una grilla de 20 min desde 8:00 produce inicios en :00/:20/:40; 11:10 NO es alcanzable. El último slot cuyo fin no excede 11:30 es `11:00 AM - 11:20 AM` (11:20 ≤ 11:30). El test inicial reflejaba el slip del plan; se corrigió a la grilla real. La implementación es correcta y respeta el criterio "último slot mañana termina ≤ 11:30".
- No afecta `parseSlotToISO` ni el merge; solo la enumeración esperada de slots.

## TDD Gate Compliance

Ambas tasks siguieron RED → GREEN:
- Task 1: `test(...)` ddb748d1 (rojo, ERR_MODULE_NOT_FOUND) → `feat(...)` 0d5ff555 (verde, 13/13).
- Task 2: `test(...)` d7b549c4 (rojo, ERR_MODULE_NOT_FOUND) → `feat(...)` 8c341322 (verde, 11/11).
- REFACTOR: no necesario (implementaciones limpias en el primer GREEN).

## Verification

- `getVarixAvailability` = 1, `isNonWorkingDay` = 3, `Date.UTC` = 3, `export function parseSlotToISO` = 1, offset `-05:00` presente — todos OK.
- `bookVarixAppointment` = 1, `23P01` = 7, `slot_taken` = 5 — todos OK.
- `npx vitest run src/lib/domain/varix-clinic/` → 2 suites, 24/24 tests verdes.
- `npx tsc --noEmit` → 0 errores en `varix-clinic/availability.ts` y `varix-clinic/booking.ts` (exit 0).

## Threat Surface

Sin superficie nueva fuera del threat model del plan. Las mitigaciones T-varix-01 (queries parametrizadas supabase-js), T-varix-03 (scope solo patients+appointments) y T-varix-04 (constraint 23P01 → slot_taken) quedan implementadas en código. T-varix-05 (redaction de cédula/teléfono en observability) corresponde a Wave 3.

## Known Stubs

Ninguno. Ambos módulos están completamente cableados a `getVarixClinicClient`. Sin consumidores en runtime todavía (Plan 06 los conecta al agente — coexistencia Regla 6, sin tráfico hasta routing rule manual).

## Commits

- ddb748d1 — test(agent-varixcenter 05): test rojo getVarixAvailability + parseSlotToISO
- 0d5ff555 — feat(agent-varixcenter 05): availability.ts (grilla 20min + merge + festivos)
- d7b549c4 — test(agent-varixcenter 05): test rojo bookVarixAppointment
- 8c341322 — feat(agent-varixcenter 05): booking.ts (patient idempotente + 23P01 retry)

## Self-Check: PASSED

Todos los archivos creados existen y los 4 commits de tarea están en el historial.
