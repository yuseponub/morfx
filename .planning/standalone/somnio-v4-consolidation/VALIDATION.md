---
phase: somnio-v4-consolidation
type: validation-strategy
created: 2026-06-10
---

# Validation Strategy — somnio-v4-consolidation

> La arquitectura de validación completa de este standalone vive en
> **`RESEARCH.md §Validation Architecture`** (test framework, mapa de suites,
> sampling rates, estrategia de gates por wave). Este archivo existe para
> satisfacer el gate Nyquist (Dimension 8) y apunta a esa sección como fuente
> canónica — no duplica su contenido.

## Resumen de gates (detalle en RESEARCH.md + CONTEXT.md D-08..D-11)

| Gate | Cuándo | Comando / criterio |
|------|--------|--------------------|
| Baseline lock (D-08) | Plan 01, ANTES de tocar código | Suite v4 completa + Smoke A/B → snapshot a `BASELINE.md` |
| Per-commit (D-09) | Cada commit de los planes 02-12 | `npx tsc --noEmit` + suite v4 verde; asserts intactos salvo carve-outs declarados (Plan 02 escalation, Plan 04 observability/e2e, Planes 10/11 vi.mock paths) |
| Fin de wave (D-10) | Planes 06 (fin W1) y 12 (fin W2) | Smoke A (17 casos) + Smoke B vs baseline: mismos PASS/FAIL, mismos templates deterministas, mismos outcomes del sub-loop, mismas decisiones de gates. NO byte-equality del texto generativo |
| Regla 6 (D-11) | Planes 06 y 12 + checks por plan | grep-gates CLAUDE.md verdes + 3 tests de no-regresión v3 + diff CERO fuera del file-set permitido (incluye extensión declarada: `agent-timers-v4.ts` + test files de mocks) |

## Sampling continuity

Las 31+ tasks de los 12 planes llevan `<verify><automated>` con comando concreto
(grep / vitest / tsc) — verificado por el plan-checker (Dimension 8a-8c PASS).
