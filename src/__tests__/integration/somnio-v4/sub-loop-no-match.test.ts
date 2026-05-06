// ============================================================================
// Integration test: sub-loop no_match path (KB sin hits → handoff_humano).
//
// Standalone: somnio-sales-v4 / Plan 12 / Task 2.
//
// D-57: 'no_match' → siempre handoff humano + requiresHuman=true.
// D-58: doble logging (agent_unknown_cases + observability event).
// D-77: tests pre-flip cubren CORRECTNESS (no calibración).
//
// Coverage:
//   - Test 1: outcome.status === 'no_match'
//   - Test 2: outcome.responseTemplate === 'handoff_humano' (D-57 literal)
//   - Test 3: outcome.requiresHuman === true
//   - Test 4: outcome.knowledgeQueried.length >= 1 (D-58 audit trail)
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'

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

vi.mock('ai', async () => ({
  generateText: generateTextMock,
  Output: { object: ({ schema }: any) => ({ schema }) },
  stepCountIs: () => null,
  tool: (def: any) => def,
}))

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

import { runSubLoop } from '@/lib/agents/somnio-v4/sub-loop'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('sub-loop no_match path — KB empty → handoff_humano', () => {
  // Setup compartido: KB RPC retorna 0 hits + LLM emite outcome no_match.
  // Plan 02 D-29: schema flat requiere todos los campos nullable explícitos
  // (canonicalText, sourceTopic, nuncaDecirRules) — pasados como null para que
  // `validateLoopOutcomeInvariants` no escale por invariante rota.
  function setupNoMatch() {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    generateTextMock.mockResolvedValueOnce({
      output: {
        status: 'no_match',
        responseTemplate: 'handoff_humano',
        canonicalText: null,
        sourceTopic: null,
        nuncaDecirRules: null,
        requiresHuman: true,
        reason: 'low_confidence_no_knowledge_match',
        knowledgeQueried: ['precio'],
      },
    })
  }

  it('Test 1: outcome.status === no_match', async () => {
    setupNoMatch()
    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-no-match-1',
        sessionId: 'sess-no-match-1',
        userMessage: 'algo random sin match',
        recentMessages: [],
      },
    })
    expect(outcome.status).toBe('no_match')
  })

  it('Test 2: outcome.responseTemplate === handoff_humano (D-57 literal)', async () => {
    setupNoMatch()
    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-no-match-2',
        sessionId: 'sess-no-match-2',
        userMessage: 'algo random',
        recentMessages: [],
      },
    })
    expect(outcome.status).toBe('no_match')
    if (outcome.status === 'no_match') {
      expect(outcome.responseTemplate).toBe('handoff_humano')
    }
  })

  it('Test 3: outcome.requiresHuman === true', async () => {
    setupNoMatch()
    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-no-match-3',
        sessionId: 'sess-no-match-3',
        userMessage: 'edge case',
        recentMessages: [],
      },
    })
    expect(outcome.requiresHuman).toBe(true)
  })

  it('Test 4: outcome.knowledgeQueried.length >= 1 (D-58 audit trail)', async () => {
    setupNoMatch()
    const outcome = await runSubLoop({
      reason: 'low_confidence',
      ctx: {
        workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
        conversationId: 'conv-no-match-4',
        sessionId: 'sess-no-match-4',
        userMessage: 'unknown intent',
        recentMessages: [],
      },
    })
    expect(outcome.status).toBe('no_match')
    if (outcome.status === 'no_match') {
      // Plan 02 D-29: knowledgeQueried es nullable post-flat schema.
      expect(outcome.knowledgeQueried).not.toBeNull()
      expect(outcome.knowledgeQueried).toBeDefined()
      expect((outcome.knowledgeQueried ?? []).length).toBeGreaterThanOrEqual(1)
    }
  })
})
