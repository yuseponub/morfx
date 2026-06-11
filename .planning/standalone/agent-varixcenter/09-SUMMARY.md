---
phase: agent-varixcenter
plan: 09
subsystem: domain-layer / varix-clinic test coverage
tags: [tests, vitest, availability, booking, timezone, reconciliation]
dependency_graph:
  requires:
    - "src/lib/domain/varix-clinic/__tests__/availability.test.ts (Plan 05 — TDD Wave 2, 13 tests)"
    - "src/lib/domain/varix-clinic/__tests__/booking.test.ts (Plan 05 — TDD Wave 2, 11 tests)"
    - "src/lib/domain/varix-clinic/availability.ts + booking.ts + constants.ts (Plan 05)"
  provides:
    - "Cobertura completa de las invariantes del Plan 09 sobre el domain varix-clinic (reconciliada con Wave 2)"
  affects:
    - "Plan 06 (varixcenter-agent): consume getVarixAvailability + parseSlotToISO + bookVarixAppointment ya bajo test"
tech_stack:
  added: []
  patterns:
    - "Reconciliación de cobertura: extender suites verdes existentes en vez de reescribir/duplicar"
    - "Test TZ-safe explícito: fecha boundary que fallaría bajo new Date(fecha).getDay() local (Regla 2)"
key_files:
  created: []
  modified:
    - "src/lib/domain/varix-clinic/__tests__/availability.test.ts (+1 describe, +3 tests TZ-safe)"
decisions:
  - "Plan 09 apunta a los MISMOS 2 archivos que el TDD del Plan 05 ya creó → se reconcilia, no se duplica (mandato important_context)"
  - "Booking.test.ts ya cubre el 100% del Plan 09 Task 2 → cero cambios en booking (no se reescribe suite verde)"
  - "Único gap real: el TZ-safe weekday test que el Plan 09 Task 1 pide explícitamente ('un test que pasaría mal con getDay() local') → se agrega como bloque nuevo"
metrics:
  duration_minutes: 6
  tasks_completed: 1
  files_created: 0
  files_modified: 1
  tests_total: 27
  tests_added: 3
  completed_date: 2026-06-11
---

# Phase agent-varixcenter Plan 09: Tests del domain varix-clinic (reconciliados) Summary

El Plan 09 (Wave 4) pedía 2 suites de test para el domain `varix-clinic` (availability + booking). El TDD del Plan 05 (Wave 2) **ya había creado ambas suites** en `src/lib/domain/varix-clinic/__tests__/` (24 tests verdes). Por mandato de `important_context`, este plan **RECONCILIA**: verifica qué casos del Plan 09 ya están cubiertos y **extiende solo lo faltante** — sin duplicar ni reescribir suites verdes. Resultado: un único bloque nuevo de 3 tests TZ-safe en `availability.test.ts`; booking quedó intacto por estar 100% cubierto.

## Reconciliación: Plan 09 must-haves vs cobertura del Plan 05

### `availability.test.ts` (Plan 09 Task 1)

| Caso pedido por Plan 09 Task 1 | Estado | Dónde |
| --- | --- | --- |
| Día hábil sin citas: grilla mañana + tarde | YA cubierto (Plan 05) | "genera mañana 8:00..11:00" + "genera tarde 14:30/14:50/15:10" |
| Sábado: mañana hasta ~11:40, tarde vacío | YA cubierto (Plan 05) | "solo mañana 8:00..11:40, tarde vacío" |
| Domingo: `{manana:[],tarde:[]}` sin tocar Supabase (D-09) | YA cubierto (Plan 05) | "domingo → vacío SIN consultar Supabase" |
| Festivo: `{manana:[],tarde:[]}` (D-09) | YA cubierto (Plan 05) | "festivo → vacío SIN consultar Supabase" |
| Merge: doble-ocupado se excluye, mono-ocupado se incluye | YA cubierto (Plan 05) | "slot mono-ocupado SÍ aparece" + "doble-ocupado NO aparece" + 2 tests de solape semi-abierto |
| **TZ-safe: test que pasaría mal con `getDay()` local (fecha límite)** | **GAP → AGREGADO (Plan 09)** | nuevo `describe('TZ-safe weekday')` con 3 tests |

### `booking.test.ts` (Plan 09 Task 2)

| Caso pedido por Plan 09 Task 2 | Estado | Dónde |
| --- | --- | --- |
| Patient nuevo → insert patient + appointment ok | YA cubierto (Plan 05) | "crea patient + appointment y retorna ok con ids" |
| Patient existente (idempotencia) → NO re-insert | YA cubierto (Plan 05) | "reusa patientId existente y NO inserta patient" |
| Split nombre/apellido (multi-token + single-token `.`) | YA cubierto (Plan 05) | "primer token = nombre, resto = apellido" + "un solo token → apellido `.`" |
| Celular 10 dígitos (`573001234567` → `3001234567`) | YA cubierto (Plan 05) | "celular normalizado a 10 dígitos" |
| 23P01 retry por doctor → doctor B | YA cubierto (Plan 05) | "doctor A da 23P01 → reintenta con doctor B y agenda" |
| Ambos 23P01 → `slot_taken` | YA cubierto (Plan 05) | "ambos doctores dan 23P01 → slot_taken" |
| Error no-23P01 → `{ok:false, reason:'error', detail}` | YA cubierto (Plan 05) | "error no-23P01 → error sin reintentar" |
| TZ -05:00 en el insert del appointment | YA cubierto (Plan 05) | "appointment con ... TZ -05:00" (asserta `fecha_hora_inicio`='...-05:00') |

**Conclusión:** booking.test.ts ya satisface el 100% del Plan 09 Task 2 (incluye además carrera 23505 y error en patient insert, que el Plan 09 ni pedía). `grep -c "23P01"` = 11 (gate Plan 09 ≥ 2). **Cero cambios** — no se reescribe una suite verde.

## What Was Built (lo único nuevo)

### `availability.test.ts` — bloque `TZ-safe weekday (Plan 09 — Regla 2)`

3 tests que blindan el cálculo de día-de-semana con `Date.UTC(...).getUTCDay()` (Regla 2) contra una regresión a `new Date(fecha).getDay()` local. Verificado en runtime America/Bogota (UTC-5) que la divergencia es real:

- `2026-06-20` (sábado): `getUTCDay()`=6 vs `getDay()`=5 (viernes). El test asserta `tarde === []` + último slot mañana `'11:40 AM - 12:00 PM'` (rango `saturday`). Bajo `getDay()` se elegiría `weekday` → tendría tarde → fallaría.
- `2026-06-21` (domingo): `getUTCDay()`=0 vs `getDay()`=6 (sábado). El test asserta `{manana:[],tarde:[]}` + que NO se llamó a Supabase (no-hábil D-09). Bajo `getDay()` se trataría como sábado → tendría grilla → fallaría.
- `2026-06-22` (lunes): `getUTCDay()`=1 → `weekday`. Asserta cierre mañana `'11:00 AM - 11:20 AM'` (≤ 11:30) + `tarde.length > 0`.

Por qué importa: el test de "sábado" original del Plan 05 ya catchearía implícitamente la regresión, pero no documentaba esa intención TZ; el Plan 09 pide explícitamente un test boundary que falle bajo `getDay()` local. Este bloque lo hace explícito y auto-documentado, y añade el caso lunes como control positivo de la selección de horario.

Nota aritmética (heredada del 05-SUMMARY, confirmada acá): la grilla de 20 min weekday cierra en `11:00 AM - 11:20 AM` (no "11:10"), porque desde 8:00 los inicios caen en :00/:20/:40 y el último cuyo fin ≤ 11:30 es 11:00–11:20.

## Deviations from Plan

Ninguna desviación de código de producción (este plan solo añade tests). La única "desviación" respecto a la letra del Plan 09 es de proceso y está mandada por `important_context`: el Plan 09 describía crear 2 suites desde cero, pero el TDD del Plan 05 ya las había creado. Se reconcilia extendiendo lo faltante en vez de recrear — evita duplicación y respeta las suites verdes.

## Verification

- `npx vitest run src/lib/domain/varix-clinic/__tests__/` → 2 suites, **27/27 tests verdes** (availability 16 = 13 previos + 3 nuevos; booking 11 sin cambios).
- `npx tsc --noEmit | grep "varix-clinic/__tests__"` → sin errores.
- `grep -c "23P01" src/lib/domain/varix-clinic/__tests__/booking.test.ts` → 11 (≥ 2, gate Plan 09 Task 2).
- Sin deleciones en el commit (`git diff --diff-filter=D HEAD~1 HEAD` vacío).

## Known Stubs

Ninguno. Las suites mockean `getVarixClinicClient` (sin red real, según `<interfaces>` del plan) y cubren las invariantes críticas (grilla 20min, festivos D-09, merge D-03, 23P01 D-04, idempotencia, Pitfalls 5/6, TZ -05:00 / Regla 2).

## Threat Surface

Sin superficie nueva. Solo tests; las mitigaciones T-varix-01/03/04 ya viven en el código del Plan 05 y quedan ejercitadas por estas suites.

## Commits

- 23924bdd — test(agent-varixcenter 09): extiende availability.test con bloque TZ-safe weekday (Regla 2)

## Self-Check: PASSED

- `src/lib/domain/varix-clinic/__tests__/availability.test.ts` existe y contiene el bloque `TZ-safe weekday` (3 tests nuevos) — FOUND.
- Commit `23924bdd` en el historial — FOUND.
- Suite 27/27 verde + tsc limpio + gate 23P01=11 — verificados arriba.
