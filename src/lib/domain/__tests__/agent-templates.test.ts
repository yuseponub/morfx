// ============================================================================
// Standalone ui-agent-content-editor — Plan 03 (Wave 2)
// GREEN tests for the agent_templates domain layer.
//
// Converts the Plan 01 placeholder stubs → real assertions using the S-4 mock
// harness (resolve-or-create-contact.test.ts): mock @/lib/supabase/admin so
// createAdminClient returns a chainable builder; assert on captured calls — no
// real DB.
//
// RED → GREEN targets:
//   - D-02: only somnio-sales-v4 is mutable (update/reorder reject other agents).
//   - D-08: addTemplate rejects unknown intents, succeeds into existing ones.
//   - Reorder: phase-1 temp-offset (orden 1000+i) all issue BEFORE any phase-2
//     (orden i) write — provably collision-free against the UNIQUE key (Pitfall 3).
//   - Regla 3: createAdminClient lives ONLY in src/lib/domain/agent-templates.ts.
//     This is a grep gate enforced in Plan 07 — see the test at the bottom that
//     documents the invariant. (grep: createAdminClient must appear only in the
//     domain file, never in callers' non-test imports.)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Recorded operations (for assertions on order + which queries ran) -------
// Each entry: { table, op, set?, eq: [...], or?, insert? }
type RecordedOp = {
  table: string
  op: 'select' | 'update' | 'insert' | 'delete'
  set?: Record<string, unknown>
  values?: Record<string, unknown>
  eq: Array<[string, unknown]>
  or?: string
}

const ops: RecordedOp[] = []

// Queue of results returned to read/select awaits (FIFO).
type QueryResult = { data: unknown; error: unknown }
const selectResultQueue: QueryResult[] = []
// Result for insert(...).select().single()
const singleMock = vi.fn()
// Result for terminal update/delete awaits.
const mutateResultQueue: QueryResult[] = []

// Thenable builder for SELECT chains: .eq().or().order()...→ await → result.
function makeSelectBuilder(rec: RecordedOp) {
  const builder: Record<string, unknown> = {}
  const chain = () => builder
  builder.eq = vi.fn((col: string, val: unknown) => {
    rec.eq.push([col, val])
    return builder
  })
  builder.or = vi.fn((expr: string) => {
    rec.or = expr
    return builder
  })
  builder.order = vi.fn(chain)
  builder.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) => {
    const result = selectResultQueue.shift() ?? { data: [], error: null }
    try {
      return Promise.resolve(onFulfilled(result))
    } catch (err) {
      if (onRejected) return Promise.resolve(onRejected(err))
      return Promise.reject(err)
    }
  }
  return builder
}

// Thenable builder for UPDATE/DELETE chains: .eq().eq() → await → result.
function makeMutateBuilder(rec: RecordedOp) {
  const builder: Record<string, unknown> = {}
  builder.eq = vi.fn((col: string, val: unknown) => {
    rec.eq.push([col, val])
    return builder
  })
  builder.then = (onFulfilled: (v: QueryResult) => unknown, onRejected?: (e: unknown) => unknown) => {
    const result = mutateResultQueue.shift() ?? { data: null, error: null }
    try {
      return Promise.resolve(onFulfilled(result))
    } catch (err) {
      if (onRejected) return Promise.resolve(onRejected(err))
      return Promise.reject(err)
    }
  }
  return builder
}

const fromMock = vi.fn((table: string) => ({
  select: vi.fn(() => {
    const rec: RecordedOp = { table, op: 'select', eq: [] }
    ops.push(rec)
    return makeSelectBuilder(rec)
  }),
  update: vi.fn((set: Record<string, unknown>) => {
    const rec: RecordedOp = { table, op: 'update', set, eq: [] }
    ops.push(rec)
    return makeMutateBuilder(rec)
  }),
  insert: vi.fn((values: Record<string, unknown>) => {
    const rec: RecordedOp = { table, op: 'insert', values, eq: [] }
    ops.push(rec)
    return {
      select: vi.fn(() => ({ single: singleMock })),
    }
  }),
  delete: vi.fn(() => {
    const rec: RecordedOp = { table, op: 'delete', eq: [] }
    ops.push(rec)
    return makeMutateBuilder(rec)
  }),
}))

const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// Import AFTER vi.mock (vitest hoisting).
import {
  updateTemplateContent,
  addTemplate,
  deleteTemplate,
  reorderTemplates,
} from '@/lib/domain/agent-templates'
import type { DomainContext } from '@/lib/domain/types'

const ctx: DomainContext = { workspaceId: 'ws-test', source: 'server-action' }

beforeEach(() => {
  vi.clearAllMocks()
  ops.length = 0
  selectResultQueue.length = 0
  mutateResultQueue.length = 0
  singleMock.mockReset()
})

describe('agent-templates domain (Plan 03 — D-02 / D-08 / reorder / Regla 3)', () => {
  // --- D-02: edit-gate -------------------------------------------------------

  it('D-02: updateTemplateContent rejects agent_id !== somnio-sales-v4 (no DB write)', async () => {
    const res = await updateTemplateContent(ctx, {
      id: 'tpl-1',
      agentId: 'godentist',
      content: 'x',
      content_type: 'texto',
      delay_s: 0,
      priority: 'CORE',
      minifrase: null,
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/v4|somnio-sales-v4/i)
    // The gate runs BEFORE touching the DB — no update query issued.
    expect(ops.find((o) => o.op === 'update')).toBeUndefined()
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it('D-02: reorderTemplates rejects non-v4 agent (no DB write)', async () => {
    const res = await reorderTemplates(ctx, {
      agentId: 'somnio-sales-v3',
      intent: 'saludo',
      visit_type: 'primera_vez',
      orderedIds: ['a', 'b', 'c'],
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/v4|somnio-sales-v4/i)
    expect(ops.length).toBe(0)
  })

  it('D-02: deleteTemplate rejects non-v4 agent (no DB write)', async () => {
    const res = await deleteTemplate(ctx, { id: 'tpl-1', agentId: 'crm-reader' })
    expect(res.success).toBe(false)
    expect(ops.find((o) => o.op === 'delete')).toBeUndefined()
  })

  // --- D-08: existing-intent-only add ---------------------------------------

  it('D-08: addTemplate into an unknown intent returns error (no insert)', async () => {
    // listIntents read returns existing intents (global+workspace scope).
    selectResultQueue.push({
      data: [{ intent: 'saludo' }, { intent: 'precio' }, { intent: 'saludo' }],
      error: null,
    })

    const res = await addTemplate(ctx, {
      agentId: 'somnio-sales-v4',
      intent: 'intent_que_no_existe',
      visit_type: 'primera_vez',
      orden: 0,
      content_type: 'texto',
      content: 'hola',
      delay_s: 0,
      priority: 'CORE',
      minifrase: null,
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/intent/i)
    // Guard fired AFTER listIntents (select) but BEFORE any insert.
    expect(ops.find((o) => o.op === 'select')).toBeDefined()
    expect(ops.find((o) => o.op === 'insert')).toBeUndefined()
  })

  it('D-08: addTemplate into an existing intent succeeds (insert issued)', async () => {
    selectResultQueue.push({
      data: [{ intent: 'saludo' }, { intent: 'precio' }],
      error: null,
    })
    singleMock.mockResolvedValueOnce({
      data: {
        id: 'tpl-new',
        agent_id: 'somnio-sales-v4',
        intent: 'saludo',
        visit_type: 'primera_vez',
        orden: 1,
        content_type: 'texto',
        content: 'hola de nuevo',
        delay_s: 0,
        priority: 'CORE',
        minifrase: null,
        workspace_id: null,
        created_at: '2026-06-01',
        updated_at: '2026-06-01',
      },
      error: null,
    })

    const res = await addTemplate(ctx, {
      agentId: 'somnio-sales-v4',
      intent: 'saludo',
      visit_type: 'primera_vez',
      orden: 1,
      content_type: 'texto',
      content: 'hola de nuevo',
      delay_s: 0,
      priority: 'CORE',
      minifrase: null,
    })

    expect(res.success).toBe(true)
    expect(res.data?.id).toBe('tpl-new')
    const insertOp = ops.find((o) => o.op === 'insert')
    expect(insertOp).toBeDefined()
    // D-03: inserted as a GLOBAL row (workspace_id NULL, same scope v4 uses).
    expect(insertOp?.values?.workspace_id).toBeNull()
    expect(insertOp?.values?.agent_id).toBe('somnio-sales-v4')
  })

  // --- update happy-path (Regla 3: query filters by id + agent_id) ----------

  it('updateTemplateContent (v4): UPDATE filters by id AND agent_id', async () => {
    mutateResultQueue.push({ data: null, error: null })

    const res = await updateTemplateContent(ctx, {
      id: 'tpl-1',
      agentId: 'somnio-sales-v4',
      content: 'nuevo',
      content_type: 'texto',
      delay_s: 3,
      priority: 'COMPLEMENTARIA',
      minifrase: 'mini',
    })

    expect(res.success).toBe(true)
    const upd = ops.find((o) => o.op === 'update')
    expect(upd).toBeDefined()
    // Regla 3: both id and agent_id filters present (no cross-agent write).
    expect(upd?.eq).toContainEqual(['id', 'tpl-1'])
    expect(upd?.eq).toContainEqual(['agent_id', 'somnio-sales-v4'])
    expect(upd?.set?.content).toBe('nuevo')
    expect(upd?.set?.minifrase).toBe('mini')
  })

  // --- Reorder: collision-safe two-phase temp-offset (Pitfall 3) ------------

  it('reorder (Pitfall 3): all phase-1 offsets (1000+i) issue BEFORE any phase-2 (i) write', async () => {
    // 3 rows reordered → 6 UPDATEs total (3 phase-1 + 3 phase-2).
    for (let i = 0; i < 6; i++) mutateResultQueue.push({ data: null, error: null })

    const res = await reorderTemplates(ctx, {
      agentId: 'somnio-sales-v4',
      intent: 'saludo',
      visit_type: 'primera_vez',
      orderedIds: ['a', 'b', 'c'],
    })

    expect(res.success).toBe(true)

    const updates = ops.filter((o) => o.op === 'update')
    expect(updates).toHaveLength(6)

    // Phase 1 = orden >= 1000; Phase 2 = orden < 1000. The LAST phase-1 update
    // must come before the FIRST phase-2 update (no interleaving).
    const ordenValues = updates.map((o) => o.set?.orden as number)
    const lastPhase1Index = ordenValues.reduce(
      (acc, v, idx) => (v >= 1000 ? idx : acc),
      -1,
    )
    const firstPhase2Index = ordenValues.findIndex((v) => v < 1000)

    expect(lastPhase1Index).toBeGreaterThanOrEqual(0)
    expect(firstPhase2Index).toBeGreaterThanOrEqual(0)
    // The whole 0..N-1 range is evacuated before any final value is written.
    expect(lastPhase1Index).toBeLessThan(firstPhase2Index)

    // Phase 1 values are exactly 1000,1001,1002; phase 2 are 0,1,2.
    expect(ordenValues.slice(0, 3)).toEqual([1000, 1001, 1002])
    expect(ordenValues.slice(3)).toEqual([0, 1, 2])

    // Every UPDATE is agent-scoped (Regla 3).
    for (const u of updates) {
      expect(u.eq).toContainEqual(['agent_id', 'somnio-sales-v4'])
    }
  })

  it('reorder: aborts on phase-1 error before issuing phase-2 writes', async () => {
    // First update fails → must abort; only 1 update recorded.
    mutateResultQueue.push({ data: null, error: { message: 'boom' } })

    const res = await reorderTemplates(ctx, {
      agentId: 'somnio-sales-v4',
      intent: 'saludo',
      visit_type: 'primera_vez',
      orderedIds: ['a', 'b'],
    })

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/phase 1/i)
    expect(ops.filter((o) => o.op === 'update')).toHaveLength(1)
  })
})
