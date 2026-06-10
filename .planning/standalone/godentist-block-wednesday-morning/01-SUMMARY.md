---
phase: godentist-block-wednesday-morning
plan: 01
subsystem: agents/godentist
tags: [godentist, godentist-fb-ig, availability, business-rule, regla-6, regla-2]
requires: []
provides:
  - "Punto A: manana=[] los miércoles en checkDentosAvailability (ambos agentes)"
  - "Punto B: slots_manana='No hay disponibilidad' los miércoles en fallback de response-track (ambos agentes)"
affects:
  - src/lib/agents/godentist/dentos-availability.ts
  - src/lib/agents/godentist-fb-ig/dentos-availability.ts
  - src/lib/agents/godentist/response-track.ts
  - src/lib/agents/godentist-fb-ig/response-track.ts
tech-stack:
  added: []
  patterns:
    - "Detección de día-de-semana vía Date.UTC + getUTCDay()===3 (Regla 2, sin drift timezone)"
    - "Clones byte-idénticos salvo header de comentario (Regla 6, D-03)"
key-files:
  created:
    - src/lib/agents/godentist/__tests__/dentos-availability.test.ts
    - src/lib/agents/godentist-fb-ig/__tests__/dentos-availability.test.ts
    - src/lib/agents/godentist/__tests__/response-track-wednesday.test.ts
  modified:
    - src/lib/agents/godentist/dentos-availability.ts
    - src/lib/agents/godentist-fb-ig/dentos-availability.ts
    - src/lib/agents/godentist/response-track.ts
    - src/lib/agents/godentist-fb-ig/response-track.ts
    - src/lib/agents/godentist-fb-ig/__tests__/response-track.test.ts
decisions:
  - "D-01: regla global a todas las sedes (no per-sede)"
  - "D-04: solo ocultar mañana, sin mensaje ni template/intent nuevo"
  - "D-05: sin migración DB, sin feature flag (ajuste de regla sobre agentes existentes)"
  - "D-06 / Regla 2: detección de miércoles en UTC (getUTCDay()===3)"
metrics:
  duration: ~25min
  completed: 2026-06-10
---

# Plan 01: Bloquear jornada de mañana de los miércoles (GoDentist) Summary

Los agentes GoDentist (`godentist` WhatsApp + `godentist-fb-ig` FB/IG) ya no ofrecen la jornada de mañana los miércoles: se vacía por encima de lo que reporta el robot Dentos (Punto A) y se fuerza `'No hay disponibilidad'` en el branch fallback (Punto B). La tarde y los demás días quedan intactos.

## What Was Built

**Punto A — `checkDentosAvailability` (ambos `dentos-availability.ts`):**
Tras el merge de slots y antes del `return success`, se parsea la fecha en UTC y, si `getUTCDay()===3`, se reemplaza `mergedManana` por `[]` (`finalManana`). La tarde nunca se altera. Cambio byte-idéntico entre los dos clones (Regla 6, D-03).

**Punto B — branch fallback de `response-track.ts` (ambos agentes):**
En el `case 'mostrar_disponibilidad'`, branch fallback, se extiende el cálculo de día-de-semana (ya existía `isSaturday`) con `isWednesday = dow === 3`. Cuando es miércoles, `slotsManana = 'No hay disponibilidad'`; en otro caso se mantiene la lógica previa (sábado / horario normal). `slotsTarde` y el branch NO-fallback intactos.

**Tests:**
- Punto A: 2 suites nuevas (WhatsApp + FB/IG), 6 tests, mock de `global.fetch` con robot OK (mañana + tarde). Miércoles → `manana=[]`; martes/jueves intactos; tarde intacta.
- Punto B: nuevo describe en la suite fb-ig existente (+2 tests, captura `slots_manana` del 2º arg de `processTemplates`) + primera suite del agente WhatsApp (`response-track-wednesday.test.ts`, 2 tests). Miércoles → `'No hay disponibilidad'`; martes no.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Punto A — vaciar mañana miércoles en checkDentosAvailability | `2b60bf8b` | godentist + fb-ig dentos-availability.ts |
| 2 | Punto B — slots_manana='No hay disponibilidad' en fallback | `52ae7fe4` | godentist + fb-ig response-track.ts |
| 3 | Tests Punto A (2 suites, 6 tests) | `ddaf4550` | godentist + fb-ig __tests__/dentos-availability.test.ts |
| 4 | Tests Punto B (+2 fb-ig, nueva suite WhatsApp) | `fc387cf4` | fb-ig response-track.test.ts + godentist response-track-wednesday.test.ts |
| 5 | Verificación global + push | (sin commit propio) | tsc 0, suites verdes, push a main |

## Verification Results

- `npx tsc --noEmit` → exit 0, sin errores.
- `npx vitest run` godentist + fb-ig → **9 test files, 103 tests passed (0 failed)**.
  - fb-ig: 98 (93 baseline + 3 dentos + 2 response-track) — baseline no rota.
  - godentist: 5 (3 dentos + 2 response-track).
- Fechas verificadas: `getUTCDay()` para 2026-06-10 / 09 / 11 → `3 2 4` (miércoles/martes/jueves).
- **Paridad Regla 6 (D-03):** `diff godentist/dentos-availability.ts <(tail -n +3 fb-ig/dentos-availability.ts)` → vacío (exit 0). Clones byte-idénticos salvo header.
- Branch NO-fallback intacto (grep `slots?.manana?.length ? slots.manana.join` = 1 en ambos).
- `slotsTarde` del fallback intacto (grep `isSaturday ? (horarios.sabado_tarde` = 1 en ambos).
- Sin imports de `constants` añadidos en `dentos-availability.ts`.

## Deviations from Plan

**Commits atómicos por task (no commit único en Task 5).** El plan sugería un commit único en Task 5; se aplicó el protocolo gsd-executor de un commit atómico por task completada (4 commits: feat A, feat B, test A, test B). Resultado equivalente: los 8 archivos quedan committeados y pusheados como una unidad a main. Ningún cambio de comportamiento ni de scope.

No se encontraron bugs ni funcionalidad crítica faltante (Reglas 1-3 no se dispararon). No se requirió decisión arquitectónica (Regla 4 no aplicó).

## Regla 6 (paridad / no-regresión)

- Cambio del Punto A byte-idéntico entre clones (diff vacío salvo header).
- Snippet del Punto B idéntico entre los dos `response-track.ts` (verificado en Task 2).
- Baseline fb-ig (93 tests) intacta; ningún otro agente alterado.

## Push

- `git push origin main` → `a4d7a0d4..fc387cf4` (HEAD `fc387cf4`). Vercel deploy disparado.
- Sin migración DB (D-05) → Regla 5 no aplica.

## Self-Check: PASSED
- Archivos creados: 3 test files — todos presentes.
- Archivos modificados: 5 — todos con los cambios.
- Commits `2b60bf8b`, `52ae7fe4`, `ddaf4550`, `fc387cf4` — presentes en git log.
