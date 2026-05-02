// ============================================================================
// Integration test: sub-loop happy path (KB hit → outcome canonical).
//
// Standalone: somnio-sales-v4 / Plan 12 / Task 2.
//
// D-77: tests pre-flip cubren CORRECTNESS (no calibración). Mocks aislan al
// sub-loop de Anthropic / OpenAI / Supabase — corre en CI sin keys.
//
// Coverage:
//   - Test 1: runSubLoop({reason:'low_confidence'}) returns outcome canonical
//             con sourceTopic='precio_comparativo'
//   - Test 2: post-gen NUNCA-decir check con rules vacías → outcome se preserva
//             (no fuerza handoff)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks ANTES de cualquier import. Patrón validado por
// src/lib/agents/somnio-v4/sub-loop/__tests__/kb-search-tool.test.ts.
const { generateTextMock, generateEmbeddingMock, rpcMock, mockSupabase } =
  vi.hoisted(() => {
    const generateTextMock = vi.fn()
    const generateEmbeddingMock = vi.fn(async (_text: string) =>
      Array(1536).fill(0.1)
    )
    const rpcMock = vi.fn()
    const mockSupabase = { rpc: rpcMock }
    return { generateTextMock, generateEmbeddingMock, rpcMock, mockSupabase }
  })

vi.mock('ai', async () => {
  // Output.object preserva el schema y NO valida — el mock retorna el output
  // configurado por generateTextMock as-is. stepCountIs / tool() son no-ops.
  return {
    generateText: generateTextMock,
    Output: { object: ({ schema }: any) => ({ schema }) },
    stepCountIs: () => null,
    tool: (def: any) => def,
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: () => 'mock-haiku-model',
}))

vi.mock('@/lib/observability', () => ({
  runWithPurpose: <T,>(_purpose: string, fn: () => Promise<T>) => fn(),
  getCollector: () => ({
    recordEvent: vi.fn(),
  }),
}))

vi.mock('../../../lib/agents/somnio-v4/knowledge-base/embed', () => ({
  generateEmbedding: generateEmbeddingMock,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

// Imports DESPUÉS de mocks.
import { runSubLoop } from '@/lib/agents/somnio-v4/sub-loop'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sub-loop happy path — KB hit → canonical outcome', () => {
  it('Test 1: returns outcome canonical with sourceTopic=precio_comparativo', async () => {
    // Mock KB RPC: 1 hit con topic precio_comparativo.
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          topic: 'precio_comparativo',
          canonical_response:
            'Nuestro ELIXIR DEL SUEÑO combina melatonina + magnesio.',
          nunca_decir: [],
          escalate_triggers: [],
          related_topics: [],
          category: 'product',
          distance: 0.1,
        },
      ],
      error: null,
    })

    // Mock generateText: el LLM emite outcome canonical (proxy a lo que retornaría).
    generateTextMock.mockResolvedValueOnce({
      output: {
        status: 'canonical',
        canonicalText:
          'Nuestro ELIXIR DEL SUEÑO combina melatonina + magnesio.',
        sourceTopic: 'precio_comparativo',
        nuncaDecirRules: [],
        requiresHuman: false,
        reason: 'kb_match',
      },
    })

    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-test-1',
        sessionId: 'sess-test-1',
        userMessage: 'cuanto cuesta',
        recentMessages: [],
      },
    })

    expect(outcome.status).toBe('canonical')
    if (outcome.status === 'canonical') {
      expect(outcome.sourceTopic).toBe('precio_comparativo')
      expect(outcome.canonicalText).toMatch(/ELIXIR/)
      expect(outcome.requiresHuman).toBe(false)
    }

    // Verifica que generateText fue invocado con Haiku model + tools.
    expect(generateTextMock).toHaveBeenCalledTimes(1)
    const callArg = generateTextMock.mock.calls[0]![0]
    expect(callArg.model).toBe('mock-haiku-model')
    expect(callArg.toolChoice).toBe('auto')
    expect(callArg.tools).toBeDefined()
  })

  it('Test 2: empty nuncaDecirRules preserves canonical outcome (no handoff forced)', async () => {
    // KB returns hit; LLM returns canonical with no rules → checkNuncaDecir
    // early-returns ok=true (rules.length===0) sin invocar segundo generateText.
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          topic: 'precio_comparativo',
          canonical_response: 'Texto verbatim seguro.',
          nunca_decir: null,
          escalate_triggers: null,
          related_topics: null,
          category: 'product',
          distance: 0.1,
        },
      ],
      error: null,
    })

    generateTextMock.mockResolvedValueOnce({
      output: {
        status: 'canonical',
        canonicalText: 'Texto verbatim seguro.',
        sourceTopic: 'precio_comparativo',
        // Sin nuncaDecirRules (undefined → fallback []).
        requiresHuman: false,
        reason: 'kb_match',
      },
    })

    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-test-2',
        sessionId: 'sess-test-2',
        userMessage: 'cuanto vale',
        recentMessages: [],
      },
    })

    expect(outcome.status).toBe('canonical')
    if (outcome.status === 'canonical') {
      expect(outcome.canonicalText).toBe('Texto verbatim seguro.')
      expect(outcome.requiresHuman).toBe(false)
    }

    // generateText invocado UNA sola vez — checkNuncaDecir early-return sin
    // segundo LLM call (no rules).
    expect(generateTextMock).toHaveBeenCalledTimes(1)
  })
})
