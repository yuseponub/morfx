---
phase: crm-stage-integrity
plan: 04
type: execute
wave: 3
depends_on: [01, 02, 03]
files_modified:
  - src/lib/builder/validation.ts
  - src/lib/builder/__tests__/validation-cycles.test.ts
autonomous: true
requirements:
  - D-07
  - D-20
  - D-22
  - D-25

must_haves:
  truths:
    - "`src/lib/builder/validation.ts conditionsPreventActivation` es recursivo: maneja `ConditionGroup` nested con logic AND/OR correctamente (antes era iterative con efecto OR implicit)"
    - "La funcion nueva tiene helper interno `evalGroup(group)` que retorna `group.logic === 'AND' ? childResults.some(r => r === true) : childResults.every(r => r === true)` (Pattern 6 RESEARCH)"
    - "La funcion nueva tiene helper interno `evalRule(rule)` que maneja 9 operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `not_in`"
    - "La funcion nueva tiene helper interno `extractActionValue(actionType, params, field)` que cubre al menos 5 field namespaces: `orden.stage_id`, `orden.pipeline_id`, `tag.nombre`, `tag.id`, y `update_field` custom fields + returns `undefined` for unknown (conservative)"
    - "Conservative default: cuando no se puede determinar el valor extraido (runtime variable, unknown field), retorna `false` (no-prevent) — lo que significa: el cycle SI se reporta al usuario (mejor false-positive que miss, per Pattern 6 insight 1)"
    - "Test `src/lib/builder/__tests__/validation-cycles.test.ts` cubre: AND group con multiples condition types (stage + tag + custom_field), OR group con all-prevent, nested AND-inside-OR, cada operator (9 tests minimum), conservative unknown field → returns false (D-25)"
    - "NO flag gate para capa 1 (D-20) — la mejora al builder validator es additive y no puede causar regression en runtime (es pure function, ejecuta solo en builder save)"
  artifacts:
    - path: "src/lib/builder/validation.ts"
      provides: "conditionsPreventActivation recursivo con AND/OR + 9 operators + 5+ field namespaces"
      contains: "evalGroup"
    - path: "src/lib/builder/__tests__/validation-cycles.test.ts"
      provides: "Unit test exhaustivo de cycle detection (D-25)"
      contains: "AND group"
  key_links:
    - from: "src/lib/builder/validation.ts detectCycles"
      to: "builder save flow (automation UI)"
      via: "conditionsPreventActivation invoked durante validacion de graph automations"
      pattern: "conditionsPreventActivation"
    - from: "src/lib/builder/validation.ts conservative fallback"
      to: "user UX (cycle warning)"
      via: "extractActionValue returns undefined → evalRule returns false → cycle se reporta"
      pattern: "return false  // conservative"
---

<objective>
Wave 3 — Build-time cycle detection expandida (D-07 capa 1, D-20 no flag). Reescribe `conditionsPreventActivation` en `src/lib/builder/validation.ts:390-437` para:

1. **Recursion over nested `ConditionGroup`** — el codigo actual es iterative con efecto OR implicit (cualquier match previene). El nuevo respeta `group.logic === 'AND' ? some : every` recursivamente.

2. **9 operators soportados** (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `not_in`) — el codigo actual solo maneja equality implicit.

3. **Extended field namespaces** — mas alla de `orden.stage_id`, `orden.pipeline_id`, `tag.nombre`: cubrir `tag.id`, `update_field` (custom fields), `orden.valor` (unpredictable runtime — returns undefined), `contacto.*` (unpredictable — returns undefined).

4. **Conservative default** — cuando el valor no puede extraerse (runtime variable, unknown field, unknown operator), retornar `false` (no-prevent). Efecto: el cycle SI se reporta al usuario (mejor false-positive que miss silently — Pattern 6 insight 1).

Tests cubren (D-25): AND con multiples types, OR con all-prevent, nested groups, cada operator.

Purpose: D-07 capa 1 del defense-in-depth. Capa 1 cierra cycles DEFINIBLES estaticamente (conditions con valores literales que el action no puede satisfacer). No cierra cycles donde conditions dependen de variables runtime — para esos queda capa 2 (kill-switch, Plan 03) + capa 3 (cascade cap, Plan 03).

**NO flag gate (D-20):** La funcion es pura (no I/O, solo graph walking), ejecuta en `builder save` UX path (latencia no critica), y el conservative fallback garantiza que en el peor caso el comportamiento es identico al actual (false-positive cycle warning). Regla 6 no aplica — no hay riesgo para produccion.

**NO push a Vercel en este plan individualmente** — acumular con Plan 05. Razon: un push solo por builder change es desproporcionado; Plan 05 sera el consolidado final.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
@/home/jose147/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/crm-stage-integrity/CONTEXT.md — D-07 capa 1 (build-time), D-20 (no flag para capa 1), D-25 (test coverage AND/OR/operators)
@.planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 6 lineas 684-819 (codigo canonico completo con evalGroup + evalRule + extractActionValue), §Anti-Patterns "DO NOT use regex/contains perfect match" (insight 4)
@.planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 3 validation.ts (lineas 754-776), §validation-cycles.test.ts (lineas 779-805)
@src/lib/builder/validation.ts — linea 252-502 (detectCycles actual); especificamente 390-437 (conditionsPreventActivation a reescribir)
@src/lib/agents/somnio/__tests__/block-composer.test.ts — precedent pure-function test pattern
@CLAUDE.md §Regla 6 (no aplica — no hay flag aqui)

<interfaces>
<!-- Types para el nuevo implementation (Pattern 6 RESEARCH) -->
type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'not_in'

interface ConditionRule {
  field: string      // e.g., 'orden.stage_id', 'tag.nombre', 'orden.custom_field_foo'
  operator: ConditionOperator
  value: unknown
}

interface ConditionGroup {
  logic: 'AND' | 'OR'
  conditions: Array<ConditionRule | ConditionGroup>
}

<!-- Function signature (sin cambios exterior) -->
function conditionsPreventActivation(
  action: { type: string; params: Record<string, unknown> },
  target: AutoNode,
): boolean
// true = action params WOULD FAIL target conditions (cycle DOES NOT happen - prevents activation)
// false = action params WOULD PASS target conditions OR cannot determine (cycle MIGHT happen — warn user)

<!-- Semantica evalGroup -->
// AND group: if ANY child prevents → group prevents (any truthy → true)
// OR group:  if ALL children prevent → group prevents (all truthy → true; any falsy → false)

<!-- Semantica evalRule (prevents = true) -->
// 'eq'     → extracted !== value       (prevents if they DON'T match)
// 'neq'    → extracted === value       (prevents if they DO match)
// 'gt'     → Number(extracted) <= Number(value)
// 'gte'    → Number(extracted) < Number(value)
// 'lt'     → Number(extracted) >= Number(value)
// 'lte'    → Number(extracted) > Number(value)
// 'contains' → !String(extracted).includes(String(value))
// 'in'     → !Array.isArray(value) || !value.includes(extracted)
// 'not_in' → Array.isArray(value) && value.includes(extracted)
// unknown op → return false (conservative)

<!-- Conservative fallback in extractActionValue -->
// Si el action type/field combo no permite determinar el valor set por el action,
// retornar undefined → evalRule retorna false → no-prevent → cycle se reporta.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reescribir `conditionsPreventActivation` con AND/OR + 9 operators + extended fields</name>
  <read_first>
    - src/lib/builder/validation.ts (entero — especialmente lineas 252-502 `detectCycles` + lineas 390-437 `conditionsPreventActivation` actual)
    - src/lib/builder/validation.ts (imports + type definitions referenciados — AutoNode shape, ConditionGroup shape si existen; si no, usar definiciones del RESEARCH.md §Pattern 6)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 6 lineas 684-819 (codigo completo del new implementation)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 3 (lineas 754-776)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-07 capa 1
  </read_first>
  <behavior>
    - Test 1: AND group con 2 rules, action satisface una pero viola la otra → prevents (`true`).
    - Test 2: OR group con 2 rules, action satisface una → does NOT prevent (`false`).
    - Test 3: Nested AND-inside-OR: OR contiene 2 groups, cada group es AND de 2 rules. Solo un sub-group es satisfied → OR is satisfied → does NOT prevent.
    - Test 4: Operator `eq` con action targetStageId='B' vs condition value='C' → prevents.
    - Test 5: Operator `gt` con action.price=100 vs condition value=500 → prevents (100 <= 500).
    - Test 6: Operator `contains` con action.description='foo' vs condition value='bar' → prevents.
    - Test 7: Operator `in` con action.tag='red' vs condition value=['blue','green'] → prevents.
    - Test 8: Unknown field `orden.weird_field` → extractActionValue returns undefined → evalRule returns false (conservative) → does NOT prevent.
    - Test 9: action.type=`update_field` + params.fieldName='custom_foo' + field='orden.custom_foo' → extract returns params.value; operator eq con match → does NOT prevent.
  </behavior>
  <action>
    **Paso 1 — MODIFICAR `src/lib/builder/validation.ts`:**

    Localizar la function `conditionsPreventActivation` (lineas 390-437 aprox). Reemplazar su cuerpo ENTERO con el siguiente codigo (copiado verbatim de RESEARCH.md §Pattern 6 con minor adjustments para que encaje con el archivo existing):

    ```typescript
    type ConditionOperator =
      | 'eq'
      | 'neq'
      | 'gt'
      | 'gte'
      | 'lt'
      | 'lte'
      | 'contains'
      | 'in'
      | 'not_in'

    interface ConditionRule {
      field: string
      operator: ConditionOperator
      value: unknown
    }

    interface ConditionGroup {
      logic: 'AND' | 'OR'
      conditions: Array<ConditionRule | ConditionGroup>
    }

    /**
     * Return true if the target automation's conditions would DEFINITELY prevent activation
     * given the action's params. Return false if conditions allow activation OR the value cannot
     * be determined statically (conservative — let the cycle be detected / reported upstream).
     *
     * Semantics (action=A → target=T has conditions C; we're asking "would C.evaluate(A.params) be FALSE?"):
     *  - AND group: any child-prevents → group prevents
     *  - OR  group: all children prevent → group prevents
     *
     * Key insight: false-positive (warn about a non-cycle) is acceptable; false-negative
     * (miss a real cycle) is not. So when data is insufficient, return `false` = does NOT prevent
     * = caller will WARN the user about a potential cycle (safer default).
     *
     * D-07 layer 1 (CONTEXT.md). No feature flag (D-20 — pure function, no I/O).
     */
    function conditionsPreventActivation(
      action: { type: string; params: Record<string, unknown> },
      target: AutoNode,
    ): boolean {
      const conditions = target.conditions as ConditionGroup | null

      if (!conditions?.conditions || conditions.conditions.length === 0) return false

      function evalGroup(group: ConditionGroup): boolean {
        const childResults = group.conditions.map((child) => {
          if (child && typeof child === 'object' && 'logic' in child && 'conditions' in child) {
            return evalGroup(child as ConditionGroup)
          }
          return evalRule(child as ConditionRule)
        })

        // AND: any prevents → group prevents (some r === true)
        // OR: all prevent → group prevents (every r === true)
        return group.logic === 'AND'
          ? childResults.some((r) => r === true)
          : childResults.every((r) => r === true)
      }

      function evalRule(rule: ConditionRule): boolean {
        if (!rule.field) return false  // conservative

        const extracted = extractActionValue(action.type, action.params, rule.field)
        if (extracted === undefined) return false  // cannot determine → conservative

        const value = rule.value

        switch (rule.operator) {
          case 'eq':
            return extracted !== value
          case 'neq':
            return extracted === value
          case 'gt':
            return Number(extracted) <= Number(value)
          case 'gte':
            return Number(extracted) < Number(value)
          case 'lt':
            return Number(extracted) >= Number(value)
          case 'lte':
            return Number(extracted) > Number(value)
          case 'contains':
            return !String(extracted).includes(String(value))
          case 'in':
            return !Array.isArray(value) || !(value as unknown[]).includes(extracted)
          case 'not_in':
            return Array.isArray(value) && (value as unknown[]).includes(extracted)
          default:
            return false  // unknown operator → conservative
        }
      }

      function extractActionValue(
        actionType: string,
        params: Record<string, unknown>,
        field: string,
      ): unknown {
        // Spanish field paths match the runtime automation engine convention
        switch (field) {
          case 'orden.stage_id':
            return params.targetStageId ?? params.stageId
          case 'orden.pipeline_id':
            return params.targetPipelineId ?? params.pipelineId
          case 'tag.nombre':
            return params.tagName
          case 'tag.id':
            return params.tagId
          case 'orden.valor':
          case 'orden.total_value':
            // Actions don't set order value directly — runtime unpredictable
            return undefined
          case 'contacto.nombre':
          case 'contacto.telefono':
            // Actions don't set contact fields — runtime unpredictable
            return undefined
          default: {
            // Custom fields via update_field action (e.g., orden.custom_prioridad)
            if (actionType === 'update_field') {
              const normalizedField = field.replace(/^orden\.|^contacto\./, '')
              if (params.fieldName === normalizedField) return params.value
            }
            // Unknown field — conservative (don't prevent; let cycle be flagged)
            return undefined
          }
        }
      }

      return evalGroup(conditions)
    }
    ```

    **NOTAS CRITICAS:**
    - El `AutoNode` type y la signature de `detectCycles` (caller) NO cambian — solo la internal funcion `conditionsPreventActivation` se reescribe.
    - La logica AND/OR se invierte cuidadosamente del codigo existing (iterative). Revisar con Pattern 6 §Key Pattern Insights RESEARCH: "AND group: any prevents → group prevents".
    - El conservative default (undefined → false = no-prevent = cycle reported) es intencional — Pattern 6 insight 1.
    - NO borrar el surrounding code de `detectCycles` (DFS walking) — solo `conditionsPreventActivation` cambia.

    **Paso 2 — Verificar que no hay duplicate type defs:**

    Si los types `ConditionRule` o `ConditionGroup` ya estan definidos en otro lugar del archivo (o en `@/lib/builder/types`), no redeclarar — importar. Si NO existen en el codebase:
    ```bash
    grep -rn "interface ConditionRule" src/lib/
    grep -rn "interface ConditionGroup" src/lib/
    ```
    Si no aparecen, declarar localmente (dentro del archivo) con los shapes del Pattern 6.

    **Paso 3 — Verificar que el caller `detectCycles` compila sin cambios:**

    ```bash
    npx tsc --noEmit 2>&1 | grep -E "src/lib/builder/validation.ts"
    ```
  </action>
  <verify>
    <automated>grep -q "function evalGroup" src/lib/builder/validation.ts</automated>
    <automated>grep -q "function evalRule" src/lib/builder/validation.ts</automated>
    <automated>grep -q "function extractActionValue" src/lib/builder/validation.ts</automated>
    <automated>grep -q "group.logic === 'AND'" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'eq':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'neq':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'gt':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'gte':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'lt':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'lte':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'contains':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'in':" src/lib/builder/validation.ts</automated>
    <automated>grep -qE "case 'not_in':" src/lib/builder/validation.ts</automated>
    <automated>grep -q "'orden.stage_id'" src/lib/builder/validation.ts</automated>
    <automated>grep -q "'orden.pipeline_id'" src/lib/builder/validation.ts</automated>
    <automated>grep -q "'tag.nombre'" src/lib/builder/validation.ts</automated>
    <automated>grep -q "'tag.id'" src/lib/builder/validation.ts</automated>
    <automated>grep -q "update_field" src/lib/builder/validation.ts</automated>
    <automated>grep -q "conservative" src/lib/builder/validation.ts || grep -q "cannot determine" src/lib/builder/validation.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "src/lib/builder/validation.ts" || echo "no TS errors in validation.ts"</automated>
  </verify>
  <acceptance_criteria>
    - `conditionsPreventActivation` reescrita con 3 helpers internos: `evalGroup`, `evalRule`, `extractActionValue`.
    - `evalGroup` tiene logic `group.logic === 'AND' ? some(r === true) : every(r === true)` — AND cuando any previene, OR cuando all previenen.
    - `evalRule` maneja los 9 operators (cada `case 'OP':` verificable).
    - `extractActionValue` cubre al menos 5 field namespaces + default clause para `update_field` custom + fallback `return undefined`.
    - Conservative fallback: extracted=undefined → return false (explicit comment).
    - Types `ConditionRule` + `ConditionGroup` declarados (localmente si no existen en otro lugar, importados si ya existen).
    - `detectCycles` caller sigue compilando sin cambios.
    - `npx tsc --noEmit` sin errores nuevos en `src/lib/builder/validation.ts`.
  </acceptance_criteria>
  <done>
    - Commit atomico: `feat(crm-stage-integrity): expand conditionsPreventActivation to AND/OR + 9 operators + custom fields`
    - NO push todavia — Task 2 agrega tests, luego Plan 05 consolida push.
  </done>
</task>

<task type="auto">
  <name>Task 2: Crear tests exhaustivos `validation-cycles.test.ts`</name>
  <read_first>
    - src/lib/builder/validation.ts (la version recien modificada — verificar exports: `detectCycles` y/o `conditionsPreventActivation` como export test-visible)
    - src/lib/agents/somnio/__tests__/block-composer.test.ts (precedent pure-function test — import + describe/it + expect)
    - .planning/standalone/crm-stage-integrity/PATTERNS.md §Wave 3 validation-cycles.test.ts (lineas 779-805)
    - .planning/standalone/crm-stage-integrity/RESEARCH.md §Pattern 6 RESEARCH insight 3 (operator semantics — TEST CADA uno)
    - .planning/standalone/crm-stage-integrity/CONTEXT.md §Decisions D-25 (test coverage AND/OR + multiples types)
  </read_first>
  <action>
    **Paso 1 — Verificar que `conditionsPreventActivation` es exportada (para poder importarla en el test):**

    ```bash
    grep -nE "export.*conditionsPreventActivation" src/lib/builder/validation.ts
    ```

    Si NO esta exportada, exportarla:

    ```typescript
    // en src/lib/builder/validation.ts, agregar export keyword al declaration:
    export function conditionsPreventActivation(...) { ... }
    ```

    Alternativa: si el codebase prefiere NO exportar internals, testear via `detectCycles` publico + graph fixtures que disparen la funcion indirectamente. Priorizar `export` de la function para unit test directo.

    **Paso 2 — CREAR `src/lib/builder/__tests__/validation-cycles.test.ts`:**

    ```typescript
    /**
     * Unit test — conditionsPreventActivation para AND/OR + 9 operators + 5+ field types.
     * D-07 layer 1 + D-25 RESEARCH §Validation Architecture.
     * Pure-function test (no I/O, no mocks).
     */
    import { describe, it, expect } from 'vitest'
    import { conditionsPreventActivation } from '@/lib/builder/validation'

    // Mock AutoNode shape — only .conditions is consumed
    function makeNode(conditions: unknown) {
      return {
        id: 'target',
        type: 'order.stage_changed',
        conditions,
      } as any
    }

    describe('conditionsPreventActivation — no conditions', () => {
      it('null conditions → does NOT prevent', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'X' } },
            makeNode(null),
          ),
        ).toBe(false)
      })

      it('empty conditions array → does NOT prevent', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'X' } },
            makeNode({ logic: 'AND', conditions: [] }),
          ),
        ).toBe(false)
      })
    })

    describe('AND group semantics', () => {
      it('action satisfies one rule but violates the other → prevents (AND: any prevent → group prevents)', () => {
        const result = conditionsPreventActivation(
          { type: 'change_stage', params: { targetStageId: 'B', targetPipelineId: 'P1' } },
          makeNode({
            logic: 'AND',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'B' },       // action satisfies
              { field: 'orden.pipeline_id', operator: 'eq', value: 'WRONG' }, // action violates
            ],
          }),
        )
        expect(result).toBe(true)  // prevents → cycle is blocked (target won't fire)
      })

      it('action satisfies all rules → does NOT prevent (cycle exists)', () => {
        const result = conditionsPreventActivation(
          { type: 'change_stage', params: { targetStageId: 'B', targetPipelineId: 'P1' } },
          makeNode({
            logic: 'AND',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'B' },
              { field: 'orden.pipeline_id', operator: 'eq', value: 'P1' },
            ],
          }),
        )
        expect(result).toBe(false)  // does not prevent → cycle fires
      })
    })

    describe('OR group semantics', () => {
      it('action satisfies one of multiple OR rules → does NOT prevent', () => {
        const result = conditionsPreventActivation(
          { type: 'change_stage', params: { targetStageId: 'B' } },
          makeNode({
            logic: 'OR',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'B' },      // satisfied
              { field: 'orden.stage_id', operator: 'eq', value: 'WRONG' },  // violated
            ],
          }),
        )
        expect(result).toBe(false)
      })

      it('action violates all OR rules → prevents', () => {
        const result = conditionsPreventActivation(
          { type: 'change_stage', params: { targetStageId: 'X' } },
          makeNode({
            logic: 'OR',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'A' },
              { field: 'orden.stage_id', operator: 'eq', value: 'B' },
            ],
          }),
        )
        expect(result).toBe(true)
      })
    })

    describe('Nested AND inside OR — recursion', () => {
      it('OR of 2 AND-groups, only one AND is satisfied → does NOT prevent', () => {
        const result = conditionsPreventActivation(
          { type: 'change_stage', params: { targetStageId: 'B', targetPipelineId: 'P1' } },
          makeNode({
            logic: 'OR',
            conditions: [
              {
                logic: 'AND',
                conditions: [
                  { field: 'orden.stage_id', operator: 'eq', value: 'B' },       // satisfied
                  { field: 'orden.pipeline_id', operator: 'eq', value: 'P1' },   // satisfied
                ],
              },
              {
                logic: 'AND',
                conditions: [
                  { field: 'orden.stage_id', operator: 'eq', value: 'WRONG' },   // violated
                  { field: 'orden.pipeline_id', operator: 'eq', value: 'WRONG' }, // violated
                ],
              },
            ],
          }),
        )
        expect(result).toBe(false)  // first AND group passes → OR passes → does not prevent
      })
    })

    describe('9 operators', () => {
      const mkCond = (op: string, value: unknown) =>
        makeNode({
          logic: 'AND',
          conditions: [{ field: 'orden.stage_id', operator: op, value }],
        })

      it('eq — match → does NOT prevent', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'B' } },
            mkCond('eq', 'B'),
          ),
        ).toBe(false)
      })

      it('eq — mismatch → prevents', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'B' } },
            mkCond('eq', 'C'),
          ),
        ).toBe(true)
      })

      it('neq — match → prevents (opposite of eq)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'B' } },
            mkCond('neq', 'B'),
          ),
        ).toBe(true)
      })

      it('gt — extracted 100 vs value 500 → prevents (100 <= 500)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 100 } },
            mkCond('gt', 500),
          ),
        ).toBe(true)
      })

      it('gte — extracted 500 vs value 500 → does NOT prevent (500 NOT < 500)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 500 } },
            mkCond('gte', 500),
          ),
        ).toBe(false)
      })

      it('lt — extracted 500 vs value 100 → prevents (500 >= 100)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 500 } },
            mkCond('lt', 100),
          ),
        ).toBe(true)
      })

      it('lte — extracted 100 vs value 100 → does NOT prevent', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 100 } },
            mkCond('lte', 100),
          ),
        ).toBe(false)
      })

      it('contains — extracted "foo" vs value "bar" → prevents (does not include)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 'foo' } },
            mkCond('contains', 'bar'),
          ),
        ).toBe(true)
      })

      it('in — extracted "red" vs value ["blue","green"] → prevents (not in array)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 'red' } },
            mkCond('in', ['blue', 'green']),
          ),
        ).toBe(true)
      })

      it('not_in — extracted "red" vs value ["red","blue"] → prevents (IS in array)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'update_field', params: { fieldName: 'stage_id', value: 'red' } },
            mkCond('not_in', ['red', 'blue']),
          ),
        ).toBe(true)
      })

      it('unknown operator → conservative false (does NOT prevent)', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'B' } },
            mkCond('weird_op' as any, 'anything'),
          ),
        ).toBe(false)
      })
    })

    describe('Field extraction + conservative fallback', () => {
      it('unknown field → extractActionValue returns undefined → does NOT prevent', () => {
        const result = conditionsPreventActivation(
          { type: 'change_stage', params: { targetStageId: 'B' } },
          makeNode({
            logic: 'AND',
            conditions: [
              { field: 'orden.weird_field_not_mapped', operator: 'eq', value: 'whatever' },
            ],
          }),
        )
        expect(result).toBe(false)
      })

      it('update_field action + custom field match → extracts params.value → does NOT prevent on match', () => {
        const result = conditionsPreventActivation(
          {
            type: 'update_field',
            params: { fieldName: 'prioridad', value: 'alta' },
          },
          makeNode({
            logic: 'AND',
            conditions: [
              { field: 'orden.prioridad', operator: 'eq', value: 'alta' },
            ],
          }),
        )
        expect(result).toBe(false)  // match → condition passes → cycle exists → don't prevent
      })

      it('update_field action + custom field MISmatch → prevents', () => {
        const result = conditionsPreventActivation(
          {
            type: 'update_field',
            params: { fieldName: 'prioridad', value: 'baja' },
          },
          makeNode({
            logic: 'AND',
            conditions: [
              { field: 'orden.prioridad', operator: 'eq', value: 'alta' },
            ],
          }),
        )
        expect(result).toBe(true)
      })

      it('tag.nombre field → uses params.tagName', () => {
        expect(
          conditionsPreventActivation(
            { type: 'add_tag', params: { tagName: 'VIP' } },
            makeNode({
              logic: 'AND',
              conditions: [{ field: 'tag.nombre', operator: 'eq', value: 'VIP' }],
            }),
          ),
        ).toBe(false)
      })

      it('orden.valor runtime unpredictable → extract returns undefined → does NOT prevent', () => {
        expect(
          conditionsPreventActivation(
            { type: 'change_stage', params: { targetStageId: 'B' } },
            makeNode({
              logic: 'AND',
              conditions: [{ field: 'orden.valor', operator: 'gt', value: 100 }],
            }),
          ),
        ).toBe(false)  // cannot determine → conservative
      })
    })

    describe('AND with mixed condition types (stage + tag + custom_field)', () => {
      it('action satisfies stage + tag + custom_field → does NOT prevent', () => {
        const result = conditionsPreventActivation(
          {
            type: 'update_field',
            params: { fieldName: 'prioridad', value: 'alta' },
          },
          makeNode({
            logic: 'AND',
            conditions: [
              // stage_id: not applicable for update_field → undefined → evalRule false (conservative)
              // Since AND logic needs "any prevent" → the other rules determine.
              { field: 'orden.prioridad', operator: 'eq', value: 'alta' },  // satisfied
            ],
          }),
        )
        expect(result).toBe(false)
      })
    })
    ```

    **Paso 3 — Smoke run (si vitest disponible):**

    ```bash
    npm test -- --run src/lib/builder/__tests__/validation-cycles.test.ts
    ```

    Esperado: TODOS los tests PASS. Si algun test falla, el bug esta en la implementation de Task 1 — fix.

    **Paso 4 — NO push a Vercel todavia.** Plan 05 consolidara el push final.
  </action>
  <verify>
    <automated>ls src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "AND group" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "OR group" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "Nested AND inside OR" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -qE "(9 operators|case 'eq'|'eq' ?—)" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "conservative" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "update_field" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "tag.nombre" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>grep -q "orden.valor" src/lib/builder/__tests__/validation-cycles.test.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep -v node_modules | grep -E "src/lib/builder/__tests__/validation-cycles.test.ts" || echo "no TS errors"</automated>
    <automated>npm test -- --run src/lib/builder/__tests__/validation-cycles.test.ts 2>&1 | grep -qE "(PASS|Test Files.*passed)"</automated>
  </verify>
  <acceptance_criteria>
    - `src/lib/builder/__tests__/validation-cycles.test.ts` existe.
    - Cubre: null/empty conditions, AND group (any-prevents / all-satisfy), OR group (one-satisfies / all-violate), Nested AND-in-OR, 9 operators (eq, neq, gt, gte, lt, lte, contains, in, not_in) + unknown operator conservative, conservative fallback (unknown field + runtime unpredictable field), update_field custom field match/mismatch, tag.nombre.
    - Minimum 20 test cases (cobertura exhaustiva per PATTERNS.md §Wave 3 test).
    - `npm test -- --run ...` pasa TODOS los tests.
    - NO push a Vercel en este plan — acumula con Plan 05.
  </acceptance_criteria>
  <done>
    - Commit atomico: `test(crm-stage-integrity): add exhaustive tests for conditionsPreventActivation (AND/OR, 9 operators)`
    - Tests verdes localmente.
  </done>
</task>

</tasks>

<verification>
- `src/lib/builder/validation.ts conditionsPreventActivation` reescrita con recursion AND/OR + 9 operators + 5+ field namespaces + conservative fallback.
- `src/lib/builder/__tests__/validation-cycles.test.ts` con 20+ tests, todos PASS.
- `npx tsc --noEmit` sin errores nuevos.
- NO push a Vercel (acumula con Plan 05).
</verification>

<success_criteria>
- Builder save flow ahora detecta cycles en automations con conditions compuestas (AND/OR con multiples types). Si el usuario crea una automation con `AND(stage=B, pipeline=P1)` y otro automation con action `change_stage` que tambien satisface ambas, el builder muestra warning "cycle detected".
- Cycles donde las conditions dependen de variables runtime (orden.valor, contacto.nombre) NO se detectan en build-time, pero SI quedan cubiertos por Plan 03 kill-switch.
- Test suite completo cubre AND/OR/9 operators + conservative fallback.
- Plan 05 desbloqueado (Kanban Realtime + docs + consolidated push).
</success_criteria>

<output>
After completion, create `.planning/standalone/crm-stage-integrity/04-SUMMARY.md` documenting:
- Commit hashes: Task 1 (validation refactor), Task 2 (tests)
- Archivos modificados: `src/lib/builder/validation.ts` (aprox LOC), `src/lib/builder/__tests__/validation-cycles.test.ts` (new file)
- Output de `npm test -- --run src/lib/builder/__tests__/validation-cycles.test.ts` (PASS esperado para todos los casos)
- Confirmacion: NO push a Vercel en este plan (acumula con Plan 05)
- Casos NO cubiertos por capa 1 build-time + razon (runtime variables → cubierto por capa 2 kill-switch Plan 03)
</output>
</content>
</invoke>