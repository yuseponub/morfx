---
phase: v4-hybrid-template-rag-turn
plan: "01"
subsystem: somnio-v4/comprehension
tags: [comprehension, schema, zod, few-shot, v4-hybrid, D-01, D-04]
dependency_graph:
  requires:
    - somnio-v4-turn-ledger (SHIPPED)
    - somnio-v4-crm-subloop (SHIPPED)
  provides:
    - secondary_confidence field en MessageAnalysis
    - secondary_query field en MessageAnalysis
    - Few-shot anchors con coberturas opuestas (anti-swap)
  affects:
    - src/lib/agents/somnio-v4/comprehension-schema.ts (extended)
    - src/lib/agents/somnio-v4/comprehension-prompt.ts (extended)
    - src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts (extended)
tech_stack:
  added: []
  patterns:
    - "nullable() sobre optional() para shape stability en Gemini structured output (T-5)"
    - "few-shot anclas multi-intent con coberturas OPUESTAS para evitar swap primary/secondary"
key_files:
  created: []
  modified:
    - src/lib/agents/somnio-v4/comprehension-schema.ts
    - src/lib/agents/somnio-v4/comprehension-prompt.ts
    - src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts
    - src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts
    - src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts
decisions:
  - "T-5: .nullable() NOT .optional() — Gemini structured output mas robusto con campos siempre-presentes nullable que con opcionales"
  - "Condicionality (null cuando secondary=ninguno) va en el PROMPT, no en el schema — mantiene shape fijo"
  - "Fixture updates en somnio-v4-agent.test.ts y v4-production-runner-restart.test.ts son obligatorias para compilar (Rule 2)"
metrics:
  duration: "16 min"
  completed: "2026-05-30T15:08:00Z"
  tasks_completed: 3
  files_changed: 5
---

# Phase v4-hybrid-template-rag-turn Plan 01 Summary

**One-liner:** Extiende el schema de comprehension v4 con 3 campos `.nullable()` (secondary_confidence, secondary_confidence_reasoning, secondary_query) + 4 anclas few-shot anti-swap para medir cobertura per-intent del intent secundario en un solo call Gemini.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add secondary_confidence + secondary_query to MessageAnalysisSchema | `9a151540` | comprehension-schema.ts, somnio-v4-agent.test.ts, v4-production-runner-restart.test.ts |
| 2 | Add comprehension-schema.test.ts cases for the new fields | `889b662b` | comprehension-schema.test.ts |
| 3 | Add prompt instructions + opposite-coverage few-shot anchors | `e7a8deb6` | comprehension-prompt.ts |

## Acceptance Criteria Status

| Criterion | Status |
|-----------|--------|
| `secondary_confidence: z.number().min(0).max(1).nullable()` count = 1 | PASS |
| `secondary_query: z.string().nullable()` count = 1 | PASS |
| `secondary_confidence_reasoning: z.string().nullable()` count = 1 | PASS |
| `.optional()` count unchanged (= 2) | PASS |
| `describe('secondary intent coverage fields')` count = 1 | PASS |
| 3 new `it(` assertions referencing `secondary_confidence` | PASS |
| `npx vitest run comprehension-schema.test.ts` — 10/10 pass | PASS |
| `SECONDARY INTENT — COBERTURA Y SUB-QUERY` in prompt = 1 | PASS |
| `anti-swap` in prompt = 1 | PASS |
| `puedo tomar el producto si tengo apnea` in prompt >= 1 | PASS |
| `secondary_confidence=0.25` in prompt >= 2 (opuestos) | PASS (= 2) |
| `npx tsc --noEmit` — 0 nuevos errores en scope | PASS |

## Regla 6 — v4-ONLY Verification

Todos los checks de no-regresion PASS (diffs contra baseline `9fd422f0`):

| Check | Result |
|-------|--------|
| 5 siblings (somnio-v3, godentist, godentist-fb-ig, somnio-recompra, somnio-pw-confirmation) | 0 archivos tocados |
| v3-production-runner.ts | 0 archivos tocados |
| interruption-system-v2/ | 0 archivos tocados |
| engine-adapters/production/messaging.ts | 0 archivos tocados |
| handoff-handler.ts | 0 archivos tocados |
| Comprehension de siblings (non-somnio-v4) | 0 archivos tocados |
| CheckpointId values | 8/8 (gate intacto) |
| Cambios confinados a somnio-v4/ | SOLO archivos somnio-v4/* |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical fields] Actualizar fixtures en v4-production-runner-restart.test.ts y somnio-v4-agent.test.ts**
- **Found during:** Task 1 (post-implementacion, al correr `npx tsc --noEmit`)
- **Issue:** Los campos `.nullable()` nuevos en `MessageAnalysis` type hacen que los objetos `cannedAnalysis` y `makeAnalysis()` existentes no compilen (TypeScript exige presencia de todos los campos no-optional en un type).
- **Fix:** Añadir `secondary_confidence: null, secondary_confidence_reasoning: null, secondary_query: null` a `cannedAnalysis` en v4-production-runner-restart.test.ts y a `makeAnalysis()` + 2 overrides inline en somnio-v4-agent.test.ts.
- **Files modified:** `src/lib/agents/engine/__tests__/v4-production-runner-restart.test.ts`, `src/lib/agents/somnio-v4/__tests__/somnio-v4-agent.test.ts`
- **Commit:** `9a151540` (incluido en Task 1)

**2. Pre-existing TypeScript errors (fuera de scope)**

`npx tsc --noEmit` devuelve errores en `.next/dev/types/validator.ts` y `src/lib/domain/__tests__/conversations.test.ts`. Estos errores son PRE-EXISTENTES (no introducidos por este plan). El scope boundary de la tarea los excluye. 0 errores nuevos en archivos tocados por este plan.

## Known Stubs

Ninguno. Los 3 campos nuevos son infraestructura de datos (schema + prompt). Su consumo downstream es tarea de Plan 03 (slot resolver).

## Threat Flags

Ninguno. Los cambios son puramente additivos a un schema interno de comprehension. No hay nuevos endpoints de red, auth paths, ni file access patterns.

## Self-Check

### Files exist
- `src/lib/agents/somnio-v4/comprehension-schema.ts` — FOUND
- `src/lib/agents/somnio-v4/comprehension-prompt.ts` — FOUND
- `src/lib/agents/somnio-v4/__tests__/comprehension-schema.test.ts` — FOUND

### Commits exist
- `9a151540` — FOUND (feat: schema change)
- `889b662b` — FOUND (test: new test cases)
- `e7a8deb6` — FOUND (feat: prompt anchors)

## Self-Check: PASSED
