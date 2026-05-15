// ============================================================================
// Tests for sub-loop/kb-search-tool.ts — kbSearchTool factory + RPC mapping.
// Standalone: somnio-sales-v4 / Plan 05 / Task 5.
//
// Coverage:
//   - Test 1: tool() retornado tiene description, inputSchema, execute
//   - Test 2: inputSchema NO acepta workspaceId (Pitfall 2)
//   - Test 3: factory invocado con ctx={workspaceId:'foo'} captura ese valor en cierre
//             y se usa como p_workspace_id en la RPC.
//   - Test 4 (W-09): RPC retorna fila con nunca_decir: ['regla 1', 'regla 2'] →
//                    KbHit.nuncaDecirRules === ['regla 1', 'regla 2']
//   - Test 5 (W-09): RPC retorna fila con nunca_decir: null →
//                    KbHit.nuncaDecirRules === [] (fallback)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock generateEmbedding ANTES de importar el módulo bajo test.
// vi.hoisted necesario porque vi.mock se eleva al tope; las variables creadas
// con vi.hoisted están disponibles en el factory.
const { generateEmbeddingMock, rpcMock, mockSupabase } = vi.hoisted(() => {
  const generateEmbeddingMock = vi.fn(async (_text: string) => Array(1536).fill(0.1))
  const rpcMock = vi.fn()
  const mockSupabase = { rpc: rpcMock }
  return { generateEmbeddingMock, rpcMock, mockSupabase }
})

vi.mock('../../knowledge-base/embed', () => ({
  generateEmbedding: generateEmbeddingMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

import { kbSearchTool } from '../kb-search-tool'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('kbSearchTool — factory shape', () => {
  it('Test 1: returns a tool() with description, inputSchema, execute', () => {
    const t = kbSearchTool({ workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490' }) as any
    expect(t).toBeDefined()
    expect(typeof t.description).toBe('string')
    expect(t.description.length).toBeGreaterThan(20)
    expect(t.inputSchema).toBeDefined()
    expect(typeof t.execute).toBe('function')
  })

  it('Test 2: inputSchema NO acepta workspaceId (Pitfall 2) ni category (Iter 7i)', () => {
    const t = kbSearchTool({ workspaceId: 'foo' }) as any
    // Zod object: shape contiene SOLO query. NO workspaceId (Pitfall 2).
    // NO category (Iter 7i Q1 Opción B — el modelo misusaba el enum literal).
    const keys = Object.keys(t.inputSchema.shape ?? t.inputSchema._def?.shape?.() ?? {})
    expect(keys).toContain('query')
    expect(keys).not.toContain('workspaceId')
    expect(keys).not.toContain('category')
  })
})

describe('kbSearchTool — execute() ctx workspaceId capture (Test 3)', () => {
  it('passes ctx.workspaceId as p_workspace_id to the RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    const t = kbSearchTool({ workspaceId: 'foo' }) as any
    await t.execute({ query: 'hola' })

    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('match_knowledge_base', expect.objectContaining({
      p_workspace_id: 'foo',
      p_agent_id: 'somnio-sales-v4',
      p_category: null,
      p_limit: 3,
    }))
    // Embedding generated for the query
    expect(generateEmbeddingMock).toHaveBeenCalledWith('hola')
  })
})

describe('kbSearchTool — W-09 nunca_decir mapping', () => {
  it('Test 4: maps row.nunca_decir array → KbHit.nuncaDecirRules', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          topic: 'producto_ingredientes',
          canonical_response: 'Texto verbatim del KB.',
          nunca_decir: ['regla 1', 'regla 2'],
          escalate_triggers: [],
          related_topics: ['producto_dosis'],
          category: 'product',
          distance: 0.12,
        },
      ],
      error: null,
    })
    const t = kbSearchTool({ workspaceId: 'foo' }) as any
    const hits = await t.execute({ query: '¿qué tiene?' })

    expect(hits).toHaveLength(1)
    expect(hits[0].topic).toBe('producto_ingredientes')
    expect(hits[0].nuncaDecirRules).toEqual(['regla 1', 'regla 2'])
    expect(hits[0].canonicalResponse).toBe('Texto verbatim del KB.')
    expect(hits[0].similarity).toBeCloseTo(1 - 0.12, 5)
  })

  it('Test 5: maps row.nunca_decir=null → KbHit.nuncaDecirRules=[] (fallback)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          topic: 'edge_case_x',
          canonical_response: 'algo',
          nunca_decir: null,
          escalate_triggers: null,
          related_topics: null,
          category: 'edge-cases',
          distance: 0.5,
        },
      ],
      error: null,
    })
    const t = kbSearchTool({ workspaceId: 'foo' }) as any
    const hits = await t.execute({ query: 'whatever' })

    expect(hits).toHaveLength(1)
    expect(hits[0].nuncaDecirRules).toEqual([])
    expect(hits[0].relatedTopics).toEqual([])
  })
})
