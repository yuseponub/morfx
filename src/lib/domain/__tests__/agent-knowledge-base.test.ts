// ============================================================================
// Standalone ui-agent-content-editor — Plan 04 (Wave 2)
// GREEN tests for the agent_knowledge_base domain layer.
//
// Proves:
//   - D-09: createKbTopic embeds (buildContentToEmbed) then inserts row with
//     embedding + body_hash + synthetic source_md_path "ui://somnio-v4/...".
//   - D-06: synchronous re-embed — generateEmbedding throw → NO DB write
//     (insert/update builder never called; returns success:false).
//   - D-01b: each updateKbTopic snapshots the prior state into
//     agent_knowledge_base_versions with incrementing version_num; restore
//     snapshots current then copies the version's fields back + re-embeds.
//   - D-10: changing scope_summary shifts body_hash → re-embed runs; unchanged
//     content → hash-skip (no OpenAI call).
//   - D-02: mutations reject agent_id !== 'somnio-sales-v4'.
//   - Pitfall 2: every query carries .eq('workspace_id') AND .eq('agent_id').
//
// Mock harness (S-4 style): a recording chainable builder over createAdminClient
// + a mocked generateEmbedding. No DB / no OpenAI hit.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- generateEmbedding mock -------------------------------------------------
const generateEmbeddingMock = vi.fn()
vi.mock('@/lib/agents/somnio-v4/knowledge-base/embed', () => ({
  generateEmbedding: (text: string) => generateEmbeddingMock(text),
}))

// --- Supabase admin recording builder ---------------------------------------
// Each call records { table, method, args } into `recorded`. The builder is
// thenable so an `await` on the chain resolves the next queued result. Terminal
// methods (maybeSingle/single) resolve from their own queues. insert() without a
// following select() is awaited directly (resolves a queued result).

type QResult = { data: unknown; error: unknown }

interface Recorded {
  table: string
  method: string
  arg: unknown
  args: unknown[]
}

const recorded: Recorded[] = []

// Queues, consumed FIFO by terminal awaits.
const awaitQueue: QResult[] = [] // for chains ending in a bare await (select…order, insert)
const maybeSingleQueue: QResult[] = [] // for .maybeSingle()
const singleQueue: QResult[] = [] // for .single()

function makeBuilder(table: string) {
  const builder: Record<string, unknown> = {}
  const rec = (method: string) =>
    vi.fn((...args: unknown[]) => {
      recorded.push({ table, method, arg: args[0], args })
      return builder
    })

  builder.select = rec('select')
  builder.insert = rec('insert')
  builder.update = rec('update')
  builder.delete = rec('delete')
  builder.eq = rec('eq')
  builder.or = rec('or')
  builder.ilike = rec('ilike')
  builder.order = rec('order')
  builder.limit = rec('limit')

  builder.maybeSingle = vi.fn(() => {
    recorded.push({ table, method: 'maybeSingle', arg: undefined, args: [] })
    return Promise.resolve(maybeSingleQueue.shift() ?? { data: null, error: null })
  })
  builder.single = vi.fn(() => {
    recorded.push({ table, method: 'single', arg: undefined, args: [] })
    return Promise.resolve(singleQueue.shift() ?? { data: null, error: null })
  })

  // Thenable — `await builder` (chains without single/maybeSingle terminal).
  builder.then = (
    onFulfilled: (v: QResult) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    const result = awaitQueue.shift() ?? { data: [], error: null }
    try {
      return Promise.resolve(onFulfilled(result))
    } catch (err) {
      if (onRejected) return Promise.resolve(onRejected(err))
      return Promise.reject(err)
    }
  }

  return builder
}

const fromMock = vi.fn((table: string) => makeBuilder(table))
const createAdminClientMock = vi.fn(() => ({ from: fromMock }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => createAdminClientMock(),
}))

// Import AFTER mocks (vitest hoists vi.mock).
import {
  listKbByAgent,
  createKbTopic,
  updateKbTopic,
  restoreKbVersion,
} from '@/lib/domain/agent-knowledge-base'
import type { DomainContext } from '@/lib/domain/types'

const ctx: DomainContext = { workspaceId: 'ws-test', source: 'server-action' }
const V4 = 'somnio-sales-v4'

const EDITABLE = {
  topic: 'precio',
  category: 'product',
  keywords: ['precio', 'costo'],
  scope_summary: 'Resumen de precio',
  hechos_del_producto: 'Cuesta X',
  posicion_del_negocio: 'Vale la pena',
  debe_contener: ['precio exacto'],
  nunca_decir: ['gratis'],
  cuando_escalar: ['quiere descuento'],
  tone_override: null,
  escalate_triggers: [],
  related_topics: [],
}

// Returns the VALUE (2nd positional) of every .eq(column, value) call.
function eqArgs(table?: string) {
  return recorded
    .filter((r) => r.method === 'eq' && (table ? r.table === table : true))
    .map((r) => r.args[1])
}
function called(method: string, table?: string) {
  return recorded.some((r) => r.method === method && (table ? r.table === table : true))
}

beforeEach(() => {
  vi.clearAllMocks()
  recorded.length = 0
  awaitQueue.length = 0
  maybeSingleQueue.length = 0
  singleQueue.length = 0
  generateEmbeddingMock.mockReset()
})

describe('agent-knowledge-base domain (Plan 04)', () => {
  it('D-09: createKbTopic calls generateEmbedding then inserts row with embedding + body_hash + ui:// source_md_path', async () => {
    generateEmbeddingMock.mockResolvedValueOnce([0.1, 0.2, 0.3])
    // 1) dup check maybeSingle → none. 2) insert .select().single() → row. 3) version max maybeSingle → none.
    maybeSingleQueue.push({ data: null, error: null }) // dup check
    singleQueue.push({ data: { id: 'kb-1', topic: 'precio' }, error: null }) // insert returning
    maybeSingleQueue.push({ data: null, error: null }) // version max → version_num 1

    const res = await createKbTopic(ctx, { ...EDITABLE, agentId: V4, reviewedBy: 'user:abc' })

    expect(res.success).toBe(true)
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1)

    const insert = recorded.find((r) => r.method === 'insert' && r.table === 'agent_knowledge_base')
    expect(insert).toBeTruthy()
    const payload = insert!.arg as Record<string, unknown>
    expect(payload.embedding).toEqual([0.1, 0.2, 0.3])
    expect(typeof payload.body_hash).toBe('string')
    expect(payload.source_md_path).toBe('ui://somnio-v4/precio')

    // version baseline snapshot inserted
    expect(called('insert', 'agent_knowledge_base_versions')).toBe(true)
  })

  it('D-06: createKbTopic — generateEmbedding throw → NO insert (no partial write), success:false', async () => {
    generateEmbeddingMock.mockRejectedValueOnce(new Error('OpenAI down'))
    maybeSingleQueue.push({ data: null, error: null }) // dup check (none)

    const res = await createKbTopic(ctx, { ...EDITABLE, agentId: V4, reviewedBy: 'user:abc' })

    expect(res.success).toBe(false)
    // No insert into the KB table happened.
    expect(called('insert', 'agent_knowledge_base')).toBe(false)
  })

  it('D-06: updateKbTopic — generateEmbedding throw → NO update (live row untouched), success:false', async () => {
    generateEmbeddingMock.mockRejectedValueOnce(new Error('OpenAI down'))
    // getKbTopic (current) → existing row with a DIFFERENT body_hash so re-embed runs.
    maybeSingleQueue.push({
      data: { id: 'kb-1', ...EDITABLE, body_hash: 'OLD_HASH' },
      error: null,
    })
    maybeSingleQueue.push({ data: { version_num: 1 }, error: null }) // version max

    const res = await updateKbTopic(ctx, {
      ...EDITABLE,
      scope_summary: 'TEXTO CAMBIADO',
      kbId: 'kb-1',
      agentId: V4,
      reviewedBy: 'user:abc',
    })

    expect(res.success).toBe(false)
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1)
    // The version snapshot is allowed; but the KB row UPDATE must NOT have run.
    expect(called('update', 'agent_knowledge_base')).toBe(false)
  })

  it('D-01b + D-10: updateKbTopic with changed scope_summary snapshots a version (incrementing) and re-embeds', async () => {
    generateEmbeddingMock.mockResolvedValueOnce([0.9, 0.8])
    maybeSingleQueue.push({
      data: { id: 'kb-1', ...EDITABLE, body_hash: 'OLD_HASH' },
      error: null,
    }) // getKbTopic current
    maybeSingleQueue.push({ data: { version_num: 2 }, error: null }) // version max → next is 3
    singleQueue.push({ data: { id: 'kb-1', topic: 'precio' }, error: null }) // update returning

    const res = await updateKbTopic(ctx, {
      ...EDITABLE,
      scope_summary: 'NUEVO RESUMEN DISTINTO',
      kbId: 'kb-1',
      agentId: V4,
      reviewedBy: 'user:abc',
    })

    expect(res.success).toBe(true)
    // D-10: changed scope_summary → body_hash differs → re-embed ran.
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1)
    // D-01b: a version row was inserted with version_num 3.
    const vInsert = recorded.find(
      (r) => r.method === 'insert' && r.table === 'agent_knowledge_base_versions',
    )
    expect(vInsert).toBeTruthy()
    expect((vInsert!.arg as Record<string, unknown>).version_num).toBe(3)
    // The live row was updated.
    expect(called('update', 'agent_knowledge_base')).toBe(true)
  })

  it('D-10: updateKbTopic with UNCHANGED content skips OpenAI (hash-skip) but still updates', async () => {
    // Compute the body_hash the domain will compute for EDITABLE, so it matches
    // current.body_hash and the re-embed is skipped.
    const { createHash } = await import('node:crypto')
    const { buildContentToEmbed } = await import(
      '@/lib/agents/somnio-v4/knowledge-base/serialize'
    )
    const sameHash = createHash('sha256')
      .update(
        buildContentToEmbed({
          scope_summary: EDITABLE.scope_summary,
          hechos_del_producto: EDITABLE.hechos_del_producto,
          posicion_del_negocio: EDITABLE.posicion_del_negocio,
          debe_contener: EDITABLE.debe_contener,
          nunca_decir: EDITABLE.nunca_decir,
          cuando_escalar: EDITABLE.cuando_escalar,
        }),
      )
      .digest('hex')

    maybeSingleQueue.push({
      data: { id: 'kb-1', ...EDITABLE, body_hash: sameHash },
      error: null,
    }) // getKbTopic current (same hash)
    maybeSingleQueue.push({ data: { version_num: 1 }, error: null }) // version max
    singleQueue.push({ data: { id: 'kb-1', topic: 'precio' }, error: null }) // update returning

    const res = await updateKbTopic(ctx, {
      ...EDITABLE, // identical content
      kbId: 'kb-1',
      agentId: V4,
      reviewedBy: 'user:abc',
    })

    expect(res.success).toBe(true)
    expect(generateEmbeddingMock).not.toHaveBeenCalled() // hash-skip
    expect(called('update', 'agent_knowledge_base')).toBe(true)
  })

  it('D-01b restore: restoreKbVersion snapshots current then copies version fields then re-embeds', async () => {
    generateEmbeddingMock.mockResolvedValueOnce([0.5, 0.5])
    // 1) load version row. 2) getKbTopic current. 3) version max for snapshot.
    maybeSingleQueue.push({
      data: { id: 'ver-1', topic: 'precio', ...EDITABLE, body_hash: 'VHASH' },
      error: null,
    }) // version
    maybeSingleQueue.push({
      data: { id: 'kb-1', ...EDITABLE, scope_summary: 'estado actual', body_hash: 'CURHASH' },
      error: null,
    }) // current
    maybeSingleQueue.push({ data: { version_num: 5 }, error: null }) // version max → snapshot v6
    singleQueue.push({ data: { id: 'kb-1', topic: 'precio' }, error: null }) // update returning

    const res = await restoreKbVersion(ctx, {
      kbId: 'kb-1',
      versionId: 'ver-1',
      agentId: V4,
      reviewedBy: 'user:abc',
    })

    expect(res.success).toBe(true)
    // (a) snapshot of current state inserted before overwrite
    const vInsert = recorded.find(
      (r) => r.method === 'insert' && r.table === 'agent_knowledge_base_versions',
    )
    expect(vInsert).toBeTruthy()
    expect((vInsert!.arg as Record<string, unknown>).version_num).toBe(6)
    // (b) generateEmbedding called
    expect(generateEmbeddingMock).toHaveBeenCalledTimes(1)
    // (c) live-row update ran
    expect(called('update', 'agent_knowledge_base')).toBe(true)
  })

  it('D-02: updateKbTopic rejects agent_id !== somnio-sales-v4, no DB write', async () => {
    const res = await updateKbTopic(ctx, {
      ...EDITABLE,
      kbId: 'kb-1',
      agentId: 'godentist',
      reviewedBy: 'user:abc',
    })
    expect(res.success).toBe(false)
    // Gate runs before any DB access.
    expect(createAdminClientMock).not.toHaveBeenCalled()
    expect(called('update', 'agent_knowledge_base')).toBe(false)
  })

  it('D-02: createKbTopic rejects non-v4 agent, no embed, no DB write', async () => {
    const res = await createKbTopic(ctx, { ...EDITABLE, agentId: 'godentist', reviewedBy: 'u' })
    expect(res.success).toBe(false)
    expect(generateEmbeddingMock).not.toHaveBeenCalled()
    expect(createAdminClientMock).not.toHaveBeenCalled()
  })

  it('Pitfall 2: listKbByAgent query filters by .eq(workspace_id) AND .eq(agent_id)', async () => {
    awaitQueue.push({ data: [], error: null }) // select…order…order await

    await listKbByAgent(ctx, V4)

    const args = eqArgs('agent_knowledge_base')
    expect(args).toContain('ws-test') // workspace_id
    expect(args).toContain(V4) // agent_id
    // both filters present on the read.
    expect(args.filter((a) => a === 'ws-test').length).toBeGreaterThanOrEqual(1)
    expect(args.filter((a) => a === V4).length).toBeGreaterThanOrEqual(1)
  })
})
