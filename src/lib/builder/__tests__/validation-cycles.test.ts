/**
 * Unit test — conditionsPreventActivation para AND/OR + 9 operators + 5+ field types.
 *
 * D-07 capa 1 (build-time cycle detection) + D-25 RESEARCH §Validation Architecture.
 * Pure-function test (no I/O, no mocks). Plan 04 crm-stage-integrity standalone.
 */

import { describe, expect, it } from 'vitest'
import { conditionsPreventActivation } from '@/lib/builder/validation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Mock AutoNode shape — only .conditions is consumed by conditionsPreventActivation.
function makeNode(conditions: unknown) {
  return {
    name: 'target',
    trigger_type: 'order.stage_changed',
    trigger_config: {},
    conditions,
    actions: [],
  } as any
}

// ---------------------------------------------------------------------------
// No conditions — base cases
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// AND group semantics — any child prevents → group prevents
// ---------------------------------------------------------------------------

describe('AND group semantics', () => {
  it('action satisfies one rule but violates the other → prevents (AND: any prevent → group prevents)', () => {
    const result = conditionsPreventActivation(
      { type: 'change_stage', params: { targetStageId: 'B', targetPipelineId: 'P1' } },
      makeNode({
        logic: 'AND',
        conditions: [
          { field: 'orden.stage_id', operator: 'eq', value: 'B' }, // action satisfies
          { field: 'orden.pipeline_id', operator: 'eq', value: 'WRONG' }, // action violates
        ],
      }),
    )
    expect(result).toBe(true) // prevents → cycle is blocked (target won't fire)
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
    expect(result).toBe(false) // does not prevent → cycle fires
  })
})

// ---------------------------------------------------------------------------
// OR group semantics — all children prevent → group prevents
// ---------------------------------------------------------------------------

describe('OR group semantics', () => {
  it('action satisfies one of multiple OR rules → does NOT prevent', () => {
    const result = conditionsPreventActivation(
      { type: 'change_stage', params: { targetStageId: 'B' } },
      makeNode({
        logic: 'OR',
        conditions: [
          { field: 'orden.stage_id', operator: 'eq', value: 'B' }, // satisfied
          { field: 'orden.stage_id', operator: 'eq', value: 'WRONG' }, // violated
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

// ---------------------------------------------------------------------------
// Nested AND inside OR — recursion
// ---------------------------------------------------------------------------

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
              { field: 'orden.stage_id', operator: 'eq', value: 'B' }, // satisfied
              { field: 'orden.pipeline_id', operator: 'eq', value: 'P1' }, // satisfied
            ],
          },
          {
            logic: 'AND',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'WRONG' }, // violated
              { field: 'orden.pipeline_id', operator: 'eq', value: 'WRONG' }, // violated
            ],
          },
        ],
      }),
    )
    expect(result).toBe(false) // first AND group passes → OR passes → does not prevent
  })

  it('OR of 2 AND-groups, both AND have at least one violation → prevents', () => {
    const result = conditionsPreventActivation(
      { type: 'change_stage', params: { targetStageId: 'X', targetPipelineId: 'Y' } },
      makeNode({
        logic: 'OR',
        conditions: [
          {
            logic: 'AND',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'A' }, // violated
              { field: 'orden.pipeline_id', operator: 'eq', value: 'Y' }, // satisfied
            ],
          },
          {
            logic: 'AND',
            conditions: [
              { field: 'orden.stage_id', operator: 'eq', value: 'X' }, // satisfied
              { field: 'orden.pipeline_id', operator: 'eq', value: 'Z' }, // violated
            ],
          },
        ],
      }),
    )
    // Each AND prevents (any violation), so OR prevents (all prevent).
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 9 operators coverage
// ---------------------------------------------------------------------------

describe('9 operators', () => {
  // For eq/neq the stage_id namespace is convenient (change_stage action).
  const mkStageCond = (op: string, value: unknown) =>
    makeNode({
      logic: 'AND',
      conditions: [{ field: 'orden.stage_id', operator: op, value }],
    })

  // For gt/gte/lt/lte/contains/in/not_in we use a custom field (default
  // branch of extractActionValue), driven by an `update_field` action — the
  // ONLY statically-determinable way to set `params.value` into a custom
  // field namespace.
  const mkCustomCond = (op: string, value: unknown) =>
    makeNode({
      logic: 'AND',
      conditions: [{ field: 'orden.prioridad', operator: op, value }],
    })
  const updateCustom = (val: unknown) => ({
    type: 'update_field',
    params: { fieldName: 'prioridad', value: val },
  })

  it('eq — match → does NOT prevent', () => {
    expect(
      conditionsPreventActivation(
        { type: 'change_stage', params: { targetStageId: 'B' } },
        mkStageCond('eq', 'B'),
      ),
    ).toBe(false)
  })

  it('eq — mismatch → prevents', () => {
    expect(
      conditionsPreventActivation(
        { type: 'change_stage', params: { targetStageId: 'B' } },
        mkStageCond('eq', 'C'),
      ),
    ).toBe(true)
  })

  it('neq — match → prevents (opposite of eq)', () => {
    expect(
      conditionsPreventActivation(
        { type: 'change_stage', params: { targetStageId: 'B' } },
        mkStageCond('neq', 'B'),
      ),
    ).toBe(true)
  })

  it('gt — extracted 100 vs value 500 → prevents (100 <= 500)', () => {
    expect(
      conditionsPreventActivation(updateCustom(100), mkCustomCond('gt', 500)),
    ).toBe(true)
  })

  it('gt — extracted 600 vs value 500 → does NOT prevent (600 > 500)', () => {
    expect(
      conditionsPreventActivation(updateCustom(600), mkCustomCond('gt', 500)),
    ).toBe(false)
  })

  it('gte — extracted 500 vs value 500 → does NOT prevent (500 NOT < 500)', () => {
    expect(
      conditionsPreventActivation(updateCustom(500), mkCustomCond('gte', 500)),
    ).toBe(false)
  })

  it('lt — extracted 500 vs value 100 → prevents (500 >= 100)', () => {
    expect(
      conditionsPreventActivation(updateCustom(500), mkCustomCond('lt', 100)),
    ).toBe(true)
  })

  it('lte — extracted 100 vs value 100 → does NOT prevent', () => {
    expect(
      conditionsPreventActivation(updateCustom(100), mkCustomCond('lte', 100)),
    ).toBe(false)
  })

  it('contains — extracted "foo" vs value "bar" → prevents (does not include)', () => {
    expect(
      conditionsPreventActivation(updateCustom('foo'), mkCustomCond('contains', 'bar')),
    ).toBe(true)
  })

  it('contains — extracted "foobar" vs value "bar" → does NOT prevent (includes)', () => {
    expect(
      conditionsPreventActivation(updateCustom('foobar'), mkCustomCond('contains', 'bar')),
    ).toBe(false)
  })

  it('in — extracted "red" vs value ["blue","green"] → prevents (not in array)', () => {
    expect(
      conditionsPreventActivation(updateCustom('red'), mkCustomCond('in', ['blue', 'green'])),
    ).toBe(true)
  })

  it('in — extracted "red" vs value ["red","green"] → does NOT prevent (in array)', () => {
    expect(
      conditionsPreventActivation(updateCustom('red'), mkCustomCond('in', ['red', 'green'])),
    ).toBe(false)
  })

  it('not_in — extracted "red" vs value ["red","blue"] → prevents (IS in array)', () => {
    expect(
      conditionsPreventActivation(updateCustom('red'), mkCustomCond('not_in', ['red', 'blue'])),
    ).toBe(true)
  })

  it('not_in — extracted "red" vs value ["blue","green"] → does NOT prevent (NOT in array)', () => {
    expect(
      conditionsPreventActivation(updateCustom('red'), mkCustomCond('not_in', ['blue', 'green'])),
    ).toBe(false)
  })

  it('unknown operator → conservative false (does NOT prevent)', () => {
    expect(
      conditionsPreventActivation(
        { type: 'change_stage', params: { targetStageId: 'B' } },
        mkStageCond('weird_op' as any, 'anything'),
      ),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Field extraction + conservative fallback (D-25)
// ---------------------------------------------------------------------------

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
        conditions: [{ field: 'orden.prioridad', operator: 'eq', value: 'alta' }],
      }),
    )
    expect(result).toBe(false) // match → condition passes → cycle exists → don't prevent
  })

  it('update_field action + custom field MISmatch → prevents', () => {
    const result = conditionsPreventActivation(
      {
        type: 'update_field',
        params: { fieldName: 'prioridad', value: 'baja' },
      },
      makeNode({
        logic: 'AND',
        conditions: [{ field: 'orden.prioridad', operator: 'eq', value: 'alta' }],
      }),
    )
    expect(result).toBe(true)
  })

  it('tag.nombre field → uses params.tagName (match → does NOT prevent)', () => {
    expect(
      conditionsPreventActivation(
        { type: 'assign_tag', params: { tagName: 'VIP' } },
        makeNode({
          logic: 'AND',
          conditions: [{ field: 'tag.nombre', operator: 'eq', value: 'VIP' }],
        }),
      ),
    ).toBe(false)
  })

  it('tag.id field → uses params.tagId (match → does NOT prevent)', () => {
    expect(
      conditionsPreventActivation(
        { type: 'assign_tag', params: { tagId: 'tag-abc' } },
        makeNode({
          logic: 'AND',
          conditions: [{ field: 'tag.id', operator: 'eq', value: 'tag-abc' }],
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
    ).toBe(false) // cannot determine → conservative
  })

  it('contacto.nombre runtime unpredictable → extract returns undefined → does NOT prevent', () => {
    expect(
      conditionsPreventActivation(
        { type: 'change_stage', params: { targetStageId: 'B' } },
        makeNode({
          logic: 'AND',
          conditions: [{ field: 'contacto.nombre', operator: 'eq', value: 'Jose' }],
        }),
      ),
    ).toBe(false)
  })

  it('empty field string → conservative false', () => {
    expect(
      conditionsPreventActivation(
        { type: 'change_stage', params: { targetStageId: 'B' } },
        makeNode({
          logic: 'AND',
          conditions: [{ field: '', operator: 'eq', value: 'anything' }],
        }),
      ),
    ).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AND with mixed condition types (stage + tag + custom_field) — D-25
// ---------------------------------------------------------------------------

describe('AND with mixed condition types', () => {
  it('update_field action + custom_field rule satisfied → does NOT prevent', () => {
    const result = conditionsPreventActivation(
      {
        type: 'update_field',
        params: { fieldName: 'prioridad', value: 'alta' },
      },
      makeNode({
        logic: 'AND',
        conditions: [
          // Since AND requires "any prevent" → a conservative-undefined rule does NOT prevent,
          // so the determinant is the satisfied custom_field rule.
          { field: 'orden.prioridad', operator: 'eq', value: 'alta' }, // satisfied
        ],
      }),
    )
    expect(result).toBe(false)
  })

  it('AND with stage (satisfied) + tag (violated) → prevents', () => {
    const result = conditionsPreventActivation(
      {
        type: 'change_stage',
        params: { targetStageId: 'B', tagName: 'VIP' },
      },
      makeNode({
        logic: 'AND',
        conditions: [
          { field: 'orden.stage_id', operator: 'eq', value: 'B' }, // satisfied
          { field: 'tag.nombre', operator: 'eq', value: 'VIP' }, // satisfied (tagName VIP matches)
        ],
      }),
    )
    expect(result).toBe(false)
  })

  it('AND with runtime-unpredictable field + stage (violated) → stage-violation drives AND-prevent', () => {
    const result = conditionsPreventActivation(
      { type: 'change_stage', params: { targetStageId: 'B' } },
      makeNode({
        logic: 'AND',
        conditions: [
          { field: 'orden.valor', operator: 'gt', value: 100 }, // conservative → does not prevent
          { field: 'orden.stage_id', operator: 'eq', value: 'Z' }, // violated → prevents
        ],
      }),
    )
    expect(result).toBe(true) // AND: any prevents → group prevents
  })
})
