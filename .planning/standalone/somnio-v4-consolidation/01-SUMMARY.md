---
phase: somnio-v4-consolidation
plan: 01
subsystem: somnio-v4
tags: [baseline-lock, D-08, D-09, D-10, smoke-rag, vitest]
requires: []
provides:
  - "BASELINE.md con SUITE_CMD canónico (gate D-09 de planes 02..12)"
  - "Baseline operativo Smoke A/B 2026-06-10 (gate D-10 por wave)"
  - "Criterio de equivalencia D-10 fijado ANTES de tocar código"
affects: [planes 02..12 de somnio-v4-consolidation]
tech-stack:
  added: []
  patterns: [pitfall-12-one-rerun-per-flaky-case, splice-filtered-rerun-into-full-results]
key-files:
  created:
    - .planning/standalone/somnio-v4-consolidation/BASELINE.md
  modified:
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-A-RESULTS.md
    - .planning/standalone/somnio-v4-rag-generative/SMOKE-B-RESULTS.md
    - src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts
decisions:
  - "Fix autorizado por usuario del test rojo pre-existente few-shots.test.ts:132 (assert M1 stale desde ada1e0a0) — único cambio en src/"
  - "Baseline OPERATIVO = corrida fresca 2026-06-10, no los números documentales 2026-06-05 (15/17 vs 14/17 discrepancia registrada)"
  - "Re-runs Pitfall 12 consumidos: Smoke A caso 16 (→PASS) y Smoke B caso 1 (→FAIL genuino, queda como baseline)"
metrics:
  duration: "~45 min (incluye 2 corridas smoke LLM completas + 2 re-runs filtrados)"
  completed: 2026-06-10
---

# Phase somnio-v4-consolidation Plan 01: Baseline Lock (D-08) Summary

**One-liner:** Baseline de regresión congelado pre-refactor: SUITE_CMD canónico (348 passed | 7 skipped, 0 failed), Smoke A fresco 15/17 + Smoke B 2/3 REAL, y criterio de equivalencia D-10 escrito antes de tocar una línea de código.

## SUITE_CMD final (D-09)

```
npx vitest run src/lib/agents/somnio-v4 src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts src/lib/agents/engine/__tests__/v4-production-runner-pathb.test.ts src/lib/agents/interruption-system-v2 src/lib/agents/engine-adapters/production/__tests__/v4-messaging-adapter.test.ts src/lib/agents/media/__tests__/media-gate-v4.test.ts src/lib/agents/production/__tests__/webhook-processor-routing.test.ts --exclude '**/smoke-rag-*.test.ts'
```

**Conteo canónico:** 37 test files passed | 1 skipped (38); **348 tests passed** | 7 skipped (355); 0 failed; 85.49s. `npx tsc --noEmit` exit 0. Verificado que `--exclude` funciona en vitest 1.6.1 con paths posicionales (smoke-rag-a/b NO corren).

## Lo que se hizo

1. **Task 1 (ejecutor previo, commit `224c09ee`):** SMOKE-A/B-RESULTS.md sucios congelados as-is + snapshot pre-run verbatim (17+10 casos del run 2026-06-05) en BASELINE.md §Snapshot pre-run.
2. **Fix autorizado (commit `5cbdc564`):** test rojo pre-existente `few-shots.test.ts:132` — assert `/compañero (humano )?experto/` stale desde `ada1e0a0` (2026-05-20, reformulación deliberada del bloque M1 en `sub-loop/prompt.ts`). Reemplazado por `/cumpla FIELMENTE la Posición del negocio/` (wording M1 vigente). Pre-fix: 347 passed + 1 stale-failed. Cero cambios en `prompt.ts`.
3. **Task 2:** SUITE_CMD corrido → 0 failed. Sección `## Suite canónica (D-09)` escrita en BASELINE.md.
4. **Task 3:** Smoke A (704.99s) + Smoke B (124.05s) corridos con keys reales (cero skip por keys). Baseline operativo + criterio D-10 escritos. Commit `510017b2`.

## Baseline operativo (corrida fresca 2026-06-10)

- **Smoke A: 15/17 judge PASS** — FAIL casos 1 (handoff cuando KB tenía respuesta de alcohol; relevance FAIL) y 12 (handoff correcto de devoluciones pero conf 0.95 → MISCALIBRATED_HIGH). 0 errores de infra tras re-run.
- **Smoke B: 2/3 REAL PASS + 7 SKIP** — FAIL caso 1 (razonamiento_libre leak a `generated` topic insomnio_largo_plazo). SKIPs esperados (Regla 6 + state-machine upstream + cas_reject cubierto por integration tests).

## Divergencias flaky vs snapshot 2026-06-05 (registradas en BASELINE.md con ambos valores)

| Caso | 06-05 | 06-10 |
|---|---|---|
| A/1 | ERROR infra | FAIL (escalation cuando expected generated) |
| A/2 | ERROR infra | PASS |
| A/10 | FAIL (nunca_decir) | PASS |
| A/12 | PASS | FAIL (solo calibration; misma decisión handoff) |
| A/16 | PASS | infra → 1 re-run → PASS (reason distinta, misma decisión) |
| B/1 | ERROR infra | infra → 1 re-run → FAIL genuino (generated) |
| B/2 | FAIL (generated) | PASS (no_match) |

**Re-runs Pitfall 12:** A/16 y B/1, ambos vía `vitest -t` filtrado con backup+splice del bloque en el results file completo (writeHeader corre a collect-time y pisaría el archivo). Ambos anotados con "Nota re-run (Pitfall 12)" dentro del bloque del caso en los SMOKE-*-RESULTS.md.

## Deviations from Plan

### Auto-fixed Issues

**1. [Autorizado por usuario - pre-existente] Test rojo few-shots.test.ts:132**
- **Found during:** Task 2 del ejecutor previo (STOP condition del plan: "si algún test sale rojo ANTES de tocar nada: PARAR")
- **Issue:** assert M1 stale desde `ada1e0a0`
- **Fix:** assert actualizado al wording vigente (commit `5cbdc564`), autorización explícita del usuario
- **Files modified:** src/lib/agents/somnio-v4/sub-loop/__tests__/few-shots.test.ts (línea 132 únicamente)

**2. [Rule 3 - Blocking] Splice de re-runs filtrados en results files**
- **Issue:** `writeHeader()` corre a collect-time → un re-run con `-t` pisa el results file completo
- **Fix:** backup del archivo completo, re-run filtrado, splice del bloque del caso re-corrido + anotación; verificado 17/10 casos presentes post-merge

### Nota de acceptance criteria

- `git status --porcelain .planning/standalone/` NO retorna vacío globalmente: existen archivos untracked PRE-EXISTENTES de OTROS standalones (whatsapp-history-reader, godentist-block-wednesday-morning, realtime-inbox-badge) fuera del scope de este plan. Los archivos de ESTE standalone y de somnio-v4-rag-generative quedan 100% commiteados.

## Verificación

- `git diff --name-only 224c09ee..HEAD -- src/` → solo `few-shots.test.ts` ✓
- BASELINE.md contiene las 4 secciones (Snapshot pre-run, Suite canónica, Baseline operativo, Criterio D-10) ✓
- 17 entradas Smoke A + 10 Smoke B en baseline operativo ✓
- SUITE_CMD 0 failed; tsc exit 0 ✓
- Smokes con keys reales, cero skip masivo ✓

## Commits

| Commit | Descripción |
|---|---|
| `224c09ee` | Task 1 (ejecutor previo): congela SMOKE-A/B + snapshot pre-run |
| `5cbdc564` | Fix autorizado assert M1 few-shots (único cambio src/) |
| `510017b2` | BASELINE.md completo + SMOKE-A/B frescos |

## Self-Check: PASSED

- 5/5 archivos clave existen (BASELINE.md, 01-SUMMARY.md, PATTERNS.md, SMOKE-A/B-RESULTS.md)
- 3/3 commits verificados en git log (`224c09ee`, `5cbdc564`, `510017b2`)
- 0 deletions en `224c09ee..HEAD`
