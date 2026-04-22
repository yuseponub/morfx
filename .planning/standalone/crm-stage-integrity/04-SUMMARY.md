---
phase: crm-stage-integrity
plan: 04
subsystem: builder-validation
tags: [cycle-detection, d-07-capa1, build-time, pure-function]
dependency_graph:
  requires: [01, 02, 03]
  provides:
    - "conditionsPreventActivation recursivo AND/OR + 9 operators + 5+ field namespaces"
    - "Build-time cycle detection layer 1 (D-07 defense-in-depth)"
  affects:
    - "src/lib/builder/validation.ts (module shape: AutoNode promoted to export)"
tech_stack:
  added: []
  patterns:
    - "Pure-function recursive AND/OR evaluator with conservative-false fallback"
    - "Type-local operators (eq/neq/gt/...) distinct from runtime long-form (equals/not_equals/...)"
    - "Module-scope shared AutoNode type (DRY across DFS + validator)"
key_files:
  created:
    - "src/lib/builder/__tests__/validation-cycles.test.ts (466 LOC, 34 tests)"
  modified:
    - "src/lib/builder/validation.ts (+175 / -60 LOC)"
decisions:
  - "D-07 capa 1 implementada sin flag (D-20 confirmed): pure function, sin I/O, builder-save-only path"
  - "AutoNode promoted to module-scope export (shared between detectCycles DFS + conditionsPreventActivation)"
  - "Local BuildTimeConditionOperator type (eq/neq/gt/...) distinct from runtime ConditionOperator (equals/not_equals/...) — legacy long-form conditions fall through to unknown-operator conservative branch, never silently miss cycles"
  - "Conservative-false fallback (undefined → evalRule false → cycle reported) prioritized over false-negative (Pattern 6 insight 1)"
  - "Tests usan update_field+custom_field para gt/lt/contains/in/not_in (stage_id namespace no tiene params.value mapping)"
metrics:
  duration_min: 10
  completed: 2026-04-22
  tasks_completed: 2
  tests_added: 34
  tests_passing: 34
requirements:
  - D-07
  - D-20
  - D-22
  - D-25
---

# Plan 04 — Build-time cycle detection expandida

One-liner: `conditionsPreventActivation` reescrita recursiva AND/OR + 9 operators + 5+ field namespaces con conservative-false fallback, + 34 unit tests exhaustivos.

## Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Reescribir conditionsPreventActivation | `d117552` | `src/lib/builder/validation.ts` |
| 2 | Tests validation-cycles | `7687d28` | `src/lib/builder/__tests__/validation-cycles.test.ts` |

## Qué cambió

### `src/lib/builder/validation.ts`

1. **`AutoNode` promoted to module-scope export** — antes declarado dentro de `detectCycles`; ahora es type exportado. Sin cambio funcional, mejora DRY.
2. **`conditionsPreventActivation` extraída a module-scope + exportada** — antes inner function de `detectCycles`; ahora es top-level export (unit-testable directa).
3. **Nueva implementación** con 3 helpers:
   - `evalGroup(group)` → `group.logic === 'AND' ? childResults.some(r === true) : childResults.every(r === true)` (AND: any-prevents → group prevents; OR: all-prevent → group prevents)
   - `evalRule(rule)` → switch sobre 9 operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `not_in` + `default: return false` (conservative)
   - `extractActionValue(actionType, params, field)` → 7 field-namespace handlers: `orden.stage_id`, `orden.pipeline_id`, `tag.nombre`, `tag.id`, `orden.valor`/`orden.total_value` (runtime-unpredictable → undefined), `contacto.nombre`/`contacto.telefono` (runtime-unpredictable → undefined), default branch maneja `update_field` custom fields
4. **Conservative-false fallback** en 3 puntos:
   - `!rule.field` → `false`
   - `extracted === undefined` → `false`
   - `default` del operator switch → `false`
   Efecto: cuando no se puede determinar el valor, la función dice "no-prevent" → caller marca cycle → usuario recibe warning (mejor false-positive que miss, Pattern 6 insight 1).
5. **Types locales** `BuildTimeConditionOperator`/`BuildTimeConditionGroup`/`BuildTimeConditionRule` distintos del runtime `ConditionOperator`/`ConditionGroup` de `@/lib/automations/types`. Esto fue intencional: el runtime usa `equals`/`not_equals` (long-form), el build-time usa `eq`/`neq` (short-form per Pattern 6). Legacy long-form conditions caen al `default` conservative del operator switch — never silently miss cycles.
6. **Sin feature flag** (D-20 confirmed): pure function, sin I/O, ejecuta solo durante `builder save`. Conservative fallback garantiza que en el peor caso el comportamiento es idéntico al actual (false-positive cycle warning, nunca miss).
7. **Callers `detectCycles`** (líneas 592, 605 en archivo final) siguen llamando `conditionsPreventActivation(action, target)` sin cambios — la signature se mantuvo estable.

### `src/lib/builder/__tests__/validation-cycles.test.ts` (new)

34 tests en 6 describe blocks:

| Block | Tests | Cobertura |
|-------|-------|-----------|
| no conditions | 2 | null / empty array |
| AND group semantics | 2 | any-prevents / all-satisfy |
| OR group semantics | 2 | one-satisfies / all-violate |
| Nested AND inside OR | 2 | recursion (true/false outcomes) |
| 9 operators | 14 | eq×2, neq, gt×2, gte, lt, lte, contains×2, in×2, not_in×2, unknown |
| Field extraction + conservative fallback | 8 | unknown field, update_field match/mismatch, tag.nombre, tag.id, orden.valor, contacto.nombre, empty field |
| AND with mixed condition types | 3 | update_field + stage-satisfied + runtime-unpredictable |

**Output de `npx vitest run`:**

```
 ✓ src/lib/builder/__tests__/validation-cycles.test.ts  (34 tests) 11ms

 Test Files  1 passed (1)
      Tests  34 passed (34)
```

## Deviations from Plan

**1. [Rule 1 — Bug en plan literal] Operators gt/lt/contains/in/not_in tests usaban field `orden.stage_id` incompatible**

- **Found during:** Task 2 primera corrida de vitest (5 tests fallaron)
- **Issue:** El helper `mkCond` del plan (línea 494 del 04-PLAN.md) estaba hard-coded a `field: 'orden.stage_id'`, pero los tests de `gt`/`lt`/`contains`/`in`/`not_in` disparan actions `update_field` con `fieldName: 'stage_id'` + `value: X`. Como `extractActionValue` matchea primero el case `'orden.stage_id'` (que retorna `params.targetStageId ?? params.stageId`, NO `params.value`), extrae `undefined` → conservative `false` → tests fallaron con "expected true, got false".
- **Fix:** Separé el helper en dos: `mkStageCond(op, value)` para operators que usan stage_id + change_stage action (eq/neq/unknown), y `mkCustomCond(op, value)` + `updateCustom(val)` para operators numéricos/string que necesitan custom field (`orden.prioridad`) + update_field action. Esta es la semántica correcta: `extractActionValue` con field custom entra al default branch donde sí lee `params.value`.
- **Files modified:** `src/lib/builder/__tests__/validation-cycles.test.ts` (sólo, el `validation.ts` ya estaba correcto)
- **Commit:** `7687d28` (incorporado antes del commit de Task 2 — no requirió commit separado)
- **Agregado extra:** Mientras arreglaba agregué 4 tests adicionales de "does NOT prevent" para gt/in/not_in (completando symmetric coverage: mismatch+match por operator). Total tests pasó de 30 (plan) a 34.

No se requirieron Rule 2 (missing-critical) ni Rule 3 (blocking) ni Rule 4 (architectural). El plan se ejecutó fielmente salvo el fix del helper de tests.

## TypeScript

- `npx tsc --noEmit` sin errores en `src/lib/builder/validation.ts` ni `src/lib/builder/__tests__/validation-cycles.test.ts` (verificado antes de cada commit).

## NO push

Confirmado: **no** `git push origin main` en este plan. Plan 05 consolida el push final (razón: un push solo por builder change sería desproporcionado — el standalone acumula Kanban Realtime + docs + wrap-up en Plan 05).

## Casos NO cubiertos por capa 1 build-time

Per Pattern 6 RESEARCH + CONTEXT.md §D-07:

- **Conditions con variables runtime** (ej. `orden.valor > {{previousValue}}`, `contacto.ciudad == 'Bogota'`): `extractActionValue` retorna `undefined` → conservative false → el cycle **se reporta como warning** al usuario, pero **no se puede garantizar** que el cycle realmente ocurra en runtime. Estos casos quedan cubiertos por:
  - **Capa 2 — Runtime kill-switch** (Plan 03 shipped): query history últimos 60s, si >5 cambios automáticos al mismo orden → bloquea.
  - **Capa 3 — Cascade cap** (Plan 03 shipped): `cascade_depth <= 3`, emite `source='cascade_capped'` cuando se alcanza.

- **Conditions con operators fuera del subset short-form** (ej. `'equals'` legacy en vez de `'eq'`): caen al `default` del operator switch → conservative false → el cycle se reporta como warning (no silently miss). Un followup opcional sería normalizar long↔short form en el builder save flow.

## Verify local (pre-commit)

```bash
npx vitest run src/lib/builder/__tests__/validation-cycles.test.ts
# ✓ 34 tests passed

npx tsc --noEmit 2>&1 | grep -E "src/lib/builder"
# (empty — no errors)
```

## Self-Check: PASSED

- [x] `src/lib/builder/validation.ts` modificado y commiteado (`d117552`).
- [x] `src/lib/builder/__tests__/validation-cycles.test.ts` creado y commiteado (`7687d28`).
- [x] `conditionsPreventActivation` exportada (verified: `grep -nE "export.*conditionsPreventActivation"` → línea 84).
- [x] 3 helpers `evalGroup` / `evalRule` / `extractActionValue` presentes (grep verified).
- [x] 9 operators presentes (cada `case 'OP':` verificado individualmente).
- [x] 5+ field namespaces: `orden.stage_id`, `orden.pipeline_id`, `tag.nombre`, `tag.id`, `orden.valor`, `orden.total_value`, `contacto.nombre`, `contacto.telefono`, update_field default branch.
- [x] Commits verificados en `git log`:
  - `d117552 feat(crm-stage-integrity-04): expand conditionsPreventActivation to AND/OR + 9 operators + custom fields`
  - `7687d28 test(crm-stage-integrity-04): add exhaustive tests for conditionsPreventActivation (AND/OR, 9 operators)`
- [x] `npx vitest run` → 34/34 pass.
- [x] `npx tsc --noEmit` → clean.
- [x] NO push a origin.
- [x] NO tocados STATE.md / ROADMAP.md / docs/analysis/ (diferidos a Plan 05 wrap-up per Regla 4).
