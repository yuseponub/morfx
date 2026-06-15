---
phase: v4-llm-fallback-resilience
plan: "01"
subsystem: somnio-v4/llm-fallback
tags: [fallback, gemini, observability, predicates, resilience]
dependency_graph:
  requires: []
  provides:
    - isGeminiBillingError (saturation.ts)
    - isGeminiSchemaCapacity (saturation.ts)
    - llm_credits_depleted (FallbackEventLabel)
    - gemini_schema_capacity_fallback (FallbackEventLabel)
  affects:
    - src/lib/agents/somnio-v4/llm-fallback/index.ts (Plan 03 consumidor)
tech_stack:
  added: []
  patterns:
    - Dual-shape predicate: APICallError branch + message fallback (Pitfall #5 pattern)
    - Named discriminators: predicados específicos, nunca "cualquier error → fallback" (Pitfall #4)
key_files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/llm-fallback/saturation.ts
    - src/lib/agents/somnio-v4/llm-fallback/observability.ts
    - src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts
decisions:
  - "BILLING_MSG no extiende SATURATION_MSG: predicados separados permiten eventos específicos y tratamiento distinto de doble-fallo"
  - "anyOf suelto excluido de SCHEMA_CAP_MSG: demasiado genérico, riesgo de falso-positivo con parse errors (Pitfall #4)"
  - "Dual-shape match (APICallError + plain Error): cubre tanto call-sites raw como comprehension re-wrap"
metrics:
  duration: "~15 min"
  completed: "2026-06-14"
  tasks_completed: 3
  files_modified: 3
---

# Phase v4-llm-fallback-resilience Plan 01: Predicados de discriminación + etiquetas observability

**One-liner:** Dos predicados nombrados (`isGeminiBillingError`, `isGeminiSchemaCapacity`) con dual-shape match + dos etiquetas tipadas en `FallbackEventLabel` para discriminar créditos-agotados vs union-types vs saturación.

## What was built

### Task 1 — `isGeminiBillingError` + `isGeminiSchemaCapacity` en `saturation.ts`

Dos nuevos predicados exportados que siguen el molde exacto de `isGeminiSaturation`:

- `unwrap(err)` para desenvolver `RetryError`
- Branch `APICallError.isInstance(e)`: match de `e.message` y `e.responseBody` contra el regex
- Fallback final sobre `err instanceof Error ? err.message : String(err)` — cubre el re-wrap de `comprehension.ts` (Pitfall #5)

**`BILLING_MSG`** — `/prepayment credits are depleted|billing|insufficient.*credit|RESOURCE_EXHAUSTED[^]*quota|quota[^]*RESOURCE_EXHAUSTED/i`
- Distingue `RESOURCE_EXHAUSTED` de billing de `RESOURCE_EXHAUSTED` de saturación (ya en `SATURATION_MSG`) usando la variante con quota/credits

**`SCHEMA_CAP_MSG`** — `/too many parameters with union types|too many states for serving|union type/i`
- NO incluye `anyOf` suelto (Pitfall #4 — falso-positivo con parse errors genuinos)

`SATURATION_MSG`, `isGeminiSaturation`, `isTimeoutError` sin cambios.

### Task 2 — Dos etiquetas tipadas en `FallbackEventLabel` en `observability.ts`

`FallbackEventLabel` pasa de 6 a 8 labels:
- `'llm_credits_depleted'` — D-01/D-04, payload `{ callSite, provider:'gemini', errorCode }`
- `'gemini_schema_capacity_fallback'` — D-02 evento RUIDOSO, payload `{ callSite, errorCode }`

`emitFallbackEvent` body y T-fb-01 sin cambios. Garantía de compilación: label inválido = error TypeScript.

### Task 3 — 14 nuevos tests en `saturation.test.ts`

Test suite crece de 18 a 32 casos (suite completa: 45/45):

| Grupo | Casos | Cobertura |
|-------|-------|-----------|
| `isGeminiBillingError` positivos | 3 | APICallError message, re-wrap Pitfall #5, responseBody quota |
| `isGeminiBillingError` negativos | 1 | statusCode 503 solo (saturación, no billing) |
| `isGeminiBillingError` Pitfall #4 | 1 | NoObjectGeneratedError → false |
| `isGeminiSchemaCapacity` positivos | 2 | union-types message, re-wrap "too many states for serving" |
| `isGeminiSchemaCapacity` negativos | 1 | bare "anyOf parse failure" → false |
| `isGeminiSchemaCapacity` Pitfall #4 | 1 | NoObjectGeneratedError → false |
| Pitfall #4 consolidado | 3 | NoObjectGeneratedError → false en los 3 predicados |
| No-overlap regresión | 2 | billing/schema-cap strings → false en isGeminiSaturation |

## Verification results

- `npx tsc --noEmit` → exit 0 (no errors)
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts` → 32/32 passed
- `npx vitest run src/lib/agents/somnio-v4/llm-fallback/__tests__/` → 45/45 passed (4 test files)
- Regla 6: solo archivos en `src/lib/agents/somnio-v4/llm-fallback/` modificados

## Commits

| Hash | Tipo | Descripción |
|------|------|-------------|
| `0db1c3e3` | feat | isGeminiBillingError + isGeminiSchemaCapacity en saturation.ts |
| `4ea27557` | feat | FallbackEventLabel extendida con 2 nuevas etiquetas tipadas |
| `ab1d022e` | test | 14 nuevos casos en saturation.test.ts |

## Deviations from Plan

Ninguna — el plan se ejecutó exactamente como escrito.

La única micro-decisión fue reemplazar `anyOf` en un comentario de `saturation.ts` por `union/allOf` para satisfacer el acceptance grep `grep -c "anyOf" ... returns 0` (el plan especifica que la palabra `anyOf` no debe aparecer en el archivo, incluyendo comentarios). El espíritu del criterio — que bare `anyOf` no está en el regex — se respeta completamente.

## Threat Flags

Ninguno — Plan 01 solo añade predicados booleanos y labels tipados. Sin nuevos endpoints, rutas de auth, acceso a archivos ni cambios de schema.

## Self-Check

- [x] `src/lib/agents/somnio-v4/llm-fallback/saturation.ts` modificado — FOUND
- [x] `src/lib/agents/somnio-v4/llm-fallback/observability.ts` modificado — FOUND
- [x] `src/lib/agents/somnio-v4/llm-fallback/__tests__/saturation.test.ts` modificado — FOUND
- [x] Commit `0db1c3e3` — FOUND
- [x] Commit `4ea27557` — FOUND
- [x] Commit `ab1d022e` — FOUND

## Self-Check: PASSED
