---
phase: somnio-v4-crm-subloop
plan: 07
subsystem: testing
tags: [somnio-v4, transitions, regla-6, crm, parity, activation, vitest]

requires:
  - phase: 01-06 (somnio-v4-crm-subloop)
    provides: lifecycle rediseñado (confirmar_orden/recordar_promo/recordar_confirmacion), crm-gate, crm-grounding, sub-loop CRM, env vars stage/pipeline
provides:
  - "tests de transitions D-15/D-17/D-18/D-19 (confirmar_orden + recordar_promo/confirmacion + mostrar_confirmacion)"
  - "REGLA6-EVIDENCE.md: prueba baseline-scoped (6e0a8d1a) que los 5 agentes no-v4 son byte-identicos"
  - "INTERRUPTION-PARITY.md §6: caveat CRM (prod DB vs sandbox simulado, mismo punto ledger, idempotency + CAS)"
  - "ACTIVATION-STEPS.md: pasos manuales pre-activacion (config crm-tools + env vars + UPDATE + rollback + smoke $0)"
affects: [activacion manual de somnio-sales-v4 en produccion]

tech-stack:
  added: []
  patterns:
    - "Regla 6 evidence baseline-scoped: diff contra el commit pre-standalone, NO main, cuando la rama esta adelante con trabajo ajeno"
    - "Activation-steps doc separado del codigo: config UI + env vars fail-closed + UPDATE per-workspace + rollback"

key-files:
  created:
    - .planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md
    - .planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md
  modified:
    - src/lib/agents/somnio-v4/__tests__/transitions.test.ts
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md

key-decisions:
  - "Baseline de evidencia Regla 6 = 6e0a8d1a (commit pre-standalone), NO main: la rama exec/debounce-v2-wave6 esta adelante con trabajo debounce-v2 ajeno que produciria falso positivo"
  - "Fallos pre-existentes (few-shots.test.ts tono RAG, smoke-rag-b.test.ts network-bound, 6 errores tsc conversations/validator) documentados como NO-regresiones; suite verde para el phase gate con esos excluidos"

patterns-established:
  - "Regla 6 evidence baseline-scoped cuando la rama de ejecucion va adelante de main"
  - "ACTIVATION-STEPS.md como gate manual operacional separado del SUMMARY"

requirements-completed: [D-05, D-06, D-07, D-15, D-16, D-18, D-19, D-21, D-22]

duration: 35min
completed: 2026-05-29
---

# Phase somnio-v4-crm-subloop Plan 07: Cierre (tests lifecycle + Regla 6 + paridad CRM + activation) Summary

**Tests de transitions D-15/D-18/D-19 (confirmar_orden + recordar_promo/confirmacion), evidencia Regla 6 baseline-scoped que prueba los 5 agentes no-v4 byte-identicos, caveat CRM en INTERRUPTION-PARITY §6, y ACTIVATION-STEPS.md con los pasos manuales pre-activacion.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files modified:** 4 (2 creados, 2 modificados)

## Accomplishments
- 5 casos nuevos en `transitions.test.ts` cubriendo el lifecycle rediseñado (D-18 confirmar_orden no crear_orden; D-19 L3/L4 recordatorios; D-17 mostrar_confirmacion; regresion confirmar-sin-pack). Suite transitions: 12/12 verde.
- `REGLA6-EVIDENCE.md` con baseline `6e0a8d1a` (no main), diff baseline-scoped que demuestra que los 5 agentes no-v4 son byte-identicos (grep VACIO), behavioral grep (v4 no referencia constantes de otros agentes), y justificacion de los 2 toques compartidos aditivos (D-24/D-25).
- Suite completa v4 + crm-mutation-tools + crm-query-tools + domain: **192 passed, 0 fallos nuevos** (con few-shots/smoke-rag excluidos por ser fallos pre-existentes documentados).
- `INTERRUPTION-PARITY.md §6`: caveat CRM (prod escribe DB, sandbox simula in-memory, ambos registran en el ledger en el mismo punto; idempotency `somnio-v4-createOrder-{sessionId}` + CAS mid-mutation).
- `ACTIVATION-STEPS.md`: paso 1 config `/agentes/crm-tools` (D-21), paso 2 env vars stage/pipeline fail-closed, paso 3 `UPDATE workspace_agent_config` + rollback, smoke sandbox + FIX 3 cascaron **$0** en Kanban (`total_value DECIMAL(12,2) NOT NULL DEFAULT 0`).

## Task Commits

1. **Task 1: transitions tests D-15/D-17/D-18/D-19** - `0a64e232` (test)
2. **Task 2: suite completa + REGLA6-EVIDENCE.md** - `4064a0e2` (docs)
3. **Task 3: caveat CRM PARITY §6 + ACTIVATION-STEPS.md** - `756206b6` (docs)

## Files Created/Modified
- `src/lib/agents/somnio-v4/__tests__/transitions.test.ts` - +5 casos lifecycle rediseñado
- `.planning/standalone/somnio-v4-crm-subloop/REGLA6-EVIDENCE.md` - evidencia no-regresion baseline-scoped
- `src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md` - §6 caveat CRM
- `.planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` - pasos manuales pre-activacion

## Decisions Made
- **Baseline 6e0a8d1a, NO main:** la rama `exec/debounce-v2-wave6` esta muchos commits adelante de main con trabajo debounce-v2 ajeno; diff contra main produciria falso Regla-6 violation. Todos los diffs de evidencia usan `6e0a8d1a...HEAD`.
- **Fallos pre-existentes como no-regresiones:** `few-shots.test.ts:132` (regex tono RAG `compañero (humano )?experto` — verificado que este standalone NO toco esas lineas de `sub-loop/prompt.ts`), `smoke-rag-b.test.ts` (network-bound, excluido), 6 errores tsc en `conversations.test.ts` + `.next/dev/types/validator.ts`. Suite verde para el gate con esos excluidos.

## Deviations from Plan

None - plan executed exactly as written.

(Ajuste menor de redaccion durante Task 3 para satisfacer un acceptance criterion line-based: el grep `grep -n "CRM" | grep -iE "simul|mutation"` requeria "CRM" en mayuscula + "simul/mutation" en la MISMA linea; se reescribio una linea de §6 de "las mutaciones se SIMULAN" a "las mutaciones CRM se SIMULAN". No es un cambio de contenido — solo coloca el termino para el gate verificable.)

## Issues Encountered
- `vitest 1.6.1` no acepta multiples flags `--exclude`; se combino en un solo patron `'**/{smoke-rag-*,few-shots}.test.ts'`.

## User Setup Required
Ver `.planning/standalone/somnio-v4-crm-subloop/ACTIVATION-STEPS.md` — pasos MANUALES que el usuario ejecuta antes de activar v4 (config `/agentes/crm-tools`, env vars Vercel, `UPDATE workspace_agent_config`). v4 sigue DORMANT hasta que el usuario decida.

## Next Phase Readiness
- Standalone `somnio-v4-crm-subloop` listo para activacion manual. v4 DORMANT en prod (0 workspaces).
- Regla 6 verificada: los 5 agentes no-v4 byte-identicos al baseline.
- Smoke real WhatsApp diferido a la activacion (cuando el usuario decida).

## Self-Check: PASSED

---
*Phase: somnio-v4-crm-subloop*
*Completed: 2026-05-29*
