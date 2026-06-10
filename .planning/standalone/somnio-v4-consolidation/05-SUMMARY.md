---
phase: somnio-v4-consolidation
plan: 05
subsystem: somnio-v4
tags: [D-17, M-6, M-7, rename, docs-sync, sub-loop, crm-gate, architecture]
requires:
  - phase: "01"
    provides: "BASELINE.md SUITE_CMD (gate D-09) + criterio equivalencia D-10"
provides:
  - "Rename interno runLegacySubLoop→runCrmMutationSubLoop (+ Raw) sin cambio de API pública"
  - "ARCHITECTURE.md sincronizada con la realidad post-híbrido (invocations.ts eliminado, G-1/G-2/G-3 cerrados, pipeline §2.0 con slot resolver + crm-gate)"
  - "INTERRUPTION-PARITY.md §6 caveat RAG-send marcado OBSOLETO"
  - "AUDIT-2026-06-10.md sección Correcciones post-research (Pitfalls 1/3/4)"
affects: [planes W2 de somnio-v4-consolidation, futuras lecturas del ARCHITECTURE/AUDIT]
tech-stack:
  added: []
  patterns: [rename-mecanico-sin-cambio-de-api, docs-historical-note-en-vez-de-borrado]
key-files:
  created:
    - .planning/standalone/somnio-v4-consolidation/05-SUMMARY.md
  modified:
    - src/lib/agents/somnio-v4/sub-loop/index.ts
    - src/lib/agents/somnio-v4/ARCHITECTURE.md
    - src/lib/agents/somnio-v4/INTERRUPTION-PARITY.md
    - .planning/standalone/somnio-v4-audit/AUDIT-2026-06-10.md
key-decisions:
  - "Las notas que documentan el rename refieren al antiguo nombre sin el token literal runLegacySubLoop — satisface el grep-gate (0 matches) Y la intención de step 3 de documentar el rename"
  - "invocations.ts se conserva en ARCHITECTURE solo como nota histórica ('eliminado') — el acceptance criterion lo permite explícitamente"
  - "El bloque 'Deferred a V1.1' de §12 (UUID-resolution inline) se reemplaza por nota histórica: ese CRM inline murió en el big-bang D-06 de crm-subloop"
patterns-established:
  - "Rename mecánico Raw-primero (sed más largo antes que más corto) para evitar colisión de prefijos"
  - "Docs-sync que documenta el estado de cierre de wave, no el estado del worktree base"
requirements-completed: [D-17]
duration: ~15min
completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 05: Rename M-6 + Docs-Sync M-7 (D-17) Summary

**Nombres y docs honestos antes de la reestructuración del core: `runLegacySubLoop` (una función VIVA que es el motor del crm-gate) renombrada a `runCrmMutationSubLoop` sin tocar la API pública, y ARCHITECTURE/PARITY/AUDIT alineados con la realidad post-híbrido del código.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-10 (worktree base a8cb5609, Plan 01 baseline)
- **Completed:** 2026-06-10
- **Tasks:** 2/2
- **Files modified:** 4 (1 .ts + 3 .md)

## Accomplishments

### Task 1 — Rename runLegacySubLoop → runCrmMutationSubLoop (commit `84fc6784`)

- Rename mecánico Raw-primero en `sub-loop/index.ts`: `runLegacySubLoopRaw`→`runCrmMutationSubLoopRaw` (4 sites) + `runLegacySubLoop`→`runCrmMutationSubLoop` (def + call :265 + comentarios).
- Comentario D-17 en la definición documentando que la función está VIVA (motor del crm-gate vía `runCrmSubLoop`) y que el rótulo "legacy" invitaba a borrarla por error.
- **Exports públicos `runSubLoop` y `runCrmSubLoop` INTACTOS** — `crm-gate.ts` no necesitó ni un cambio (import `{ runCrmSubLoop } from './sub-loop'` verbatim, file ausente del diff del plan).
- Cero cambios de lógica. Suite del sub-loop: 7 suites, 78 passed + 2 skipped, cero asserts cambiados.

### Task 2 — Sincronizar ARCHITECTURE + PARITY §6 + AUDIT (commit `b293ec66`)

Checklist exacta del RESEARCH §State of the Art:

- **ARCHITECTURE §0 tabla:** fila "Mutations CRM" pasa de `invocations.ts` inline a `crm-gate + sub-loop grounded` con nota de eliminación (big-bang D-06 crm-subloop).
- **ARCHITECTURE §1 tabla de archivos:** eliminada la fila `invocations.ts`, añadida `crm-gate.ts`; line counts actualizados a `wc -l` real (somnio-v4-agent 1008→1475, engine-v4 730→768, sub-loop/index 914→985) + nota "counts al 2026-06-10, cambiarán en W2 (core/)".
- **ARCHITECTURE §2.0 diagrama:** pasos 9/10 (executeInvocations / createOrder inline) reemplazados por el flujo real post-híbrido (slot resolver → crm-gate → runCrmSubLoop grounded; pseudo-templates `rag:*` por el path de templates).
- **ARCHITECTURE §4.2 + §12:** G-1 y G-2 marcados cerrados (híbrido `rag:*`), G-3 cerrado por D-14 de este standalone (branch fallback borrado + warning `v4_messages_without_templates`). Tabla de gaps §12 actualizada con filas tachadas ✅ CERRADO.
- **ARCHITECTURE:** todas las menciones `runLegacySubLoop` → `runCrmMutationSubLoop`.
- **INTERRUPTION-PARITY §6:** caveat RAG-send marcado ⚠️ OBSOLETO con nota (slot resolver emite `rag:*` por el path de templates; reducción completa diferida a D-07/Plan 12). Texto histórico conservado.
- **AUDIT-2026-06-10.md:** sección `## Correcciones post-research` con (a) M-2/D-13 "nadie lo consume" incorrecto — 3 consumidores type-coupled (Pitfall 1); (b) `mapOutcomeToAgentOutput` ~233 líneas entera muerta (Pitfall 3); (c) M-4/D-15 confidence legacy load-bearing → deprecación no borrado (Pitfall 4); (d) `interruption-tab.tsx` 3 labels stale inofensivos, fuera de scope D-11.

## must_haves — verificados

| Truth | Estado |
|---|---|
| `runLegacySubLoop` ya no existe — es `runCrmMutationSubLoop` (vivo, motor del crm-gate) | ✓ `grep -rn runLegacySubLoop src/ = 0` |
| `runSubLoop`/`runCrmSubLoop` NO cambiaron — crm-gate.ts compila sin tocar import | ✓ crm-gate.ts ausente del diff; tsc exit 0 |
| ARCHITECTURE sin invocations.ts (live), G-1/G-2/G-3 cerrados, §2.0 flujo real | ✓ 4 menciones invocations.ts = solo notas históricas "eliminado" |
| AUDIT con corrección de claims refutados (Pitfalls 1, 3, 4) | ✓ sección Correcciones post-research presente |

## Acceptance criteria

| Criterio | Resultado |
|---|---|
| `grep -rn runLegacySubLoop src/` = 0 | ✓ 0 |
| `grep -c runCrmMutationSubLoop sub-loop/index.ts` ≥ 4 | ✓ 8 |
| diff Task 1 = solo sub-loop/index.ts (crm-gate.ts sin cambios) | ✓ |
| `grep -c invocations.ts ARCHITECTURE.md` = 0 o solo nota histórica | ✓ 4 menciones, todas "eliminado"/"Nota histórica" |
| `grep -n runLegacySubLoop ARCHITECTURE.md` = 0 | ✓ 0 |
| `grep -c crm-gate ARCHITECTURE.md` ≥ 1 | ✓ 7 |
| `grep -ci obsolet INTERRUPTION-PARITY.md` ≥ 1 | ✓ 2 |
| `grep -c "Correcciones post-research" AUDIT` = 1 | ✓ 1 |
| `grep -c interruption-tab AUDIT` ≥ 1 | ✓ 1 |

## Verificación de regresión (D-09 + D-11)

- `npx tsc --noEmit` → exit 0.
- SUITE_CMD completo: **37 test files passed | 1 skipped (38); 348 tests passed | 7 skipped (355); 0 failed** — IDÉNTICO al baseline del Plan 01 (348 passed | 7 skipped). Cero asserts cambiados.
- Suite del sub-loop: 78 passed + 2 skipped, sin tocar esos tests.
- Diff fuera de scope = 0: solo `{sub-loop/index.ts, ARCHITECTURE.md, INTERRUPTION-PARITY.md, AUDIT-2026-06-10.md}`. Regla 6 intacta (cero cambios de comportamiento; rename interno + docs).

## Deviations from Plan

### Tensión resuelta — acceptance criterion vs action step 3/5 (notas de rename)

- **Situación:** la action step 3 manda añadir un comentario que documenta el rename mencionando `runLegacySubLoop`, pero el acceptance criterion exige `grep -rn "runLegacySubLoop" src/` = 0 (y `grep -n "runLegacySubLoop" ARCHITECTURE.md` = 0).
- **Resolución (Rule 3 - blocking, juicio):** las notas que documentan el rename refieren al "antiguo nombre 'legacy'" SIN el token literal `runLegacySubLoop`. Esto satisface ambos: el grep-gate da 0 matches Y la intención de step 3 (documentar honestamente que la función fue renombrada y por qué) se preserva. Aplicado tanto en `sub-loop/index.ts` (comentario de la def) como en `ARCHITECTURE.md` §2.4.
- **Files:** sub-loop/index.ts, ARCHITECTURE.md — **Commits:** `84fc6784`, `b293ec66`.

### Auto-fixed (Rule 1 - docs stale fuera de la checklist literal)

- **ARCHITECTURE §9 (observability) + §12 (Deferred V1.1):** dos referencias adicionales a `invocations.ts` que la checklist literal del RESEARCH no enumeraba pero que el acceptance criterion (`invocations.ts` solo en notas históricas) obligaba a tratar. La fila de eventos `updateOrder_failed`/`moveOrderToStage_failed` se re-apunta a `crm-gate.ts → runCrmSubLoop`, y el bloque "Deferred a V1.1" (UUID-resolution inline del CRM viejo) se reemplaza por una nota histórica (ese CRM inline murió en el big-bang D-06). Sin esto el acceptance criterion habría quedado con referencias live a un archivo inexistente.
- **Files:** ARCHITECTURE.md — **Commit:** `b293ec66`.

### Nota de contexto — worktree base vs claims forward-looking del plan

El plan referencia work de "Plan 02" (mapOutcomeToAgentOutput muerto, shouldCreateOrder removido, confidence deprecado) como ya completado. Este worktree W2 está basado en el baseline del Plan 01 (`a8cb5609`), donde esos planes aún no corrieron — `mapOutcomeToAgentOutput` y `shouldCreateOrder` siguen presentes en el código base. La sección Correcciones post-research del AUDIT se escribió tal como la action step 7 la especifica (documenta lo que el standalone COMPLETO resuelve), porque es un doc de cierre de wave, no un snapshot del worktree base. Sin impacto en código: Task 2 es 100% docs.

## Known Stubs

Ninguno. Plan de rename + docs; cero código nuevo con data source pendiente.

## Threat Flags

Ninguno. T-cons-06 (rename accidental del export público) mitigado: `crm-gate.ts` ausente del diff, `runCrmSubLoop`/`runSubLoop` conservan nombre.

## Commits

| Commit | Tipo | Descripción |
|---|---|---|
| `84fc6784` | refactor | D-17 rename runLegacySubLoop→runCrmMutationSubLoop (función viva, motor del crm-gate) |
| `b293ec66` | docs | D-17 sincroniza ARCHITECTURE/PARITY§6/AUDIT con la realidad del código |

## Self-Check: PASSED
