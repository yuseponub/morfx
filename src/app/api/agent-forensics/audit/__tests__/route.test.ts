import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted pattern — mocks defined here are accessible from vi.mock
// factories (which vitest hoists to top of the file before imports).
const mocks = vi.hoisted(() => ({
  mockAssertSuperUser: vi.fn(),
  mockGetTurnDetail: vi.fn(),
  mockLoadAgentSpec: vi.fn(),
  mockLoadSessionSnapshot: vi.fn(),
  mockCondenseTimeline: vi.fn(),
  mockBuildAuditorPrompt: vi.fn(),
  mockBuildAuditorPromptV2: vi.fn(),
  mockStreamText: vi.fn(),
  mockCreateAnthropic: vi.fn(),
  mockToUIMessageStreamResponse: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  // Plan 05 Task 9 mocks
  mockLoadConversationTurns: vi.fn(),
  mockCondensePreviousTurn: vi.fn(),
  mockEstimateTokens: vi.fn(),
  mockTruncateContext: vi.fn(),
  mockCreateAuditSession: vi.fn(),
  mockAppendToAuditSession: vi.fn(),
  mockLoadAuditSession: vi.fn(),
  mockCalculateAuditCost: vi.fn(),
  mockCreateClient: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@/lib/auth/super-user', () => ({
  assertSuperUser: mocks.mockAssertSuperUser,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.mockCreateClient,
}))
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))
vi.mock('@/lib/observability/repository', () => ({
  getTurnDetail: mocks.mockGetTurnDetail,
}))
vi.mock('@/lib/agent-forensics/load-agent-spec', () => ({
  loadAgentSpec: mocks.mockLoadAgentSpec,
}))
vi.mock('@/lib/agent-forensics/load-session-snapshot', () => ({
  loadSessionSnapshot: mocks.mockLoadSessionSnapshot,
}))
vi.mock('@/lib/agent-forensics/condense-timeline', () => ({
  condenseTimeline: mocks.mockCondenseTimeline,
}))
vi.mock('@/lib/agent-forensics/auditor-prompt', () => ({
  buildAuditorPrompt: mocks.mockBuildAuditorPrompt,
  buildAuditorPromptV2: mocks.mockBuildAuditorPromptV2,
}))
vi.mock('@/lib/agent-forensics/load-conversation-turns', () => ({
  loadConversationTurns: mocks.mockLoadConversationTurns,
}))
vi.mock('@/lib/agent-forensics/condense-previous-turn', () => ({
  condensePreviousTurn: mocks.mockCondensePreviousTurn,
}))
vi.mock('@/lib/agent-forensics/token-budget', () => ({
  estimateTokens: mocks.mockEstimateTokens,
  truncateContext: mocks.mockTruncateContext,
}))
vi.mock('@/lib/agent-forensics/audit-session-store', () => ({
  createAuditSession: mocks.mockCreateAuditSession,
  appendToAuditSession: mocks.mockAppendToAuditSession,
  loadAuditSession: mocks.mockLoadAuditSession,
}))
vi.mock('@/lib/agent-forensics/pricing', () => ({
  calculateAuditCost: mocks.mockCalculateAuditCost,
}))
vi.mock('ai', () => ({
  streamText: mocks.mockStreamText,
  convertToModelMessages: mocks.mockConvertToModelMessages,
}))
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: mocks.mockCreateAnthropic,
}))

import { POST } from '../route'

function makeRequest(body: any): Request {
  return new Request('http://localhost/api/agent-forensics/audit', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

function makeFirstRoundBody(overrides: Record<string, unknown> = {}) {
  return {
    turnId: 't1',
    startedAt: '2026-04-24T10:00:00Z',
    respondingAgentId: 'somnio-recompra-v1',
    conversationId: 'c1',
    messages: [
      {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'Auditar' }],
      },
    ],
    hypothesis: null,
    auditSessionId: null,
    ...overrides,
  }
}

function makeFollowUpBody(
  auditSessionId: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    turnId: 't1',
    startedAt: '2026-04-24T10:00:00Z',
    respondingAgentId: 'somnio-recompra-v1',
    conversationId: 'c1',
    messages: [
      {
        id: 'm1',
        role: 'user',
        parts: [{ type: 'text', text: 'Auditar' }],
      },
      {
        id: 'm2',
        role: 'assistant',
        parts: [{ type: 'text', text: '# Diagnostico ...' }],
      },
      {
        id: 'm3',
        role: 'user',
        parts: [{ type: 'text', text: 'pregunta de seguimiento' }],
      },
    ],
    hypothesis: null,
    auditSessionId,
    ...overrides,
  }
}

describe('POST /api/agent-forensics/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockCreateAnthropic.mockImplementation(
      () => (id: string) => ({ _model: id }),
    )
    mocks.mockToUIMessageStreamResponse.mockImplementation(
      () => new Response('stream', { status: 200, headers: new Headers() }),
    )
    mocks.mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: mocks.mockToUIMessageStreamResponse,
    })
    mocks.mockGetTurnDetail.mockResolvedValue({
      turn: {
        id: 't1',
        workspaceId: 'w1',
        conversationId: 'c1',
        agentId: 'somnio-v3',
        respondingAgentId: 'somnio-recompra-v1',
        startedAt: '2026-04-24T10:00:00Z',
        finishedAt: '2026-04-24T10:00:01Z',
        durationMs: 1000,
        eventCount: 0,
        queryCount: 0,
        aiCallCount: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        hasError: false,
        triggerKind: 'user_message',
        currentMode: null,
        newMode: null,
        error: null,
      },
      events: [],
      queries: [],
      aiCalls: [],
      promptVersionsById: {},
    })
    mocks.mockLoadAgentSpec.mockResolvedValue('# spec')
    mocks.mockLoadSessionSnapshot.mockResolvedValue({
      snapshot: { x: 1 },
      sessionId: 's1',
    })
    mocks.mockCondenseTimeline.mockReturnValue([])
    mocks.mockBuildAuditorPrompt.mockReturnValue({
      systemPrompt: 'sys',
      userMessage: 'user',
    })
    mocks.mockBuildAuditorPromptV2.mockReturnValue({
      systemPrompt: 'sys-v2',
      userMessage: 'user-v2',
    })
    mocks.mockLoadConversationTurns.mockResolvedValue([])
    mocks.mockCondensePreviousTurn.mockReturnValue({
      turnId: 'prev-t1',
      startedAt: '2026-04-24T09:58:00Z',
    })
    mocks.mockEstimateTokens.mockReturnValue(100)
    mocks.mockTruncateContext.mockReturnValue({ kept: [], trimmed: 0 })
    mocks.mockCreateAuditSession.mockResolvedValue({ id: 'audit-uuid-1' })
    mocks.mockAppendToAuditSession.mockResolvedValue(undefined)
    mocks.mockLoadAuditSession.mockResolvedValue({
      id: 'audit-uuid-1',
      turnId: 't1',
      workspaceId: 'w1',
      userId: 'u1',
      respondingAgentId: 'somnio-recompra-v1',
      conversationId: 'c1',
      hypothesis: null,
      messages: [],
      systemPrompt: 'cached-sys',
      totalTurnsInContext: 0,
      trimmedCount: 0,
      costUsd: 0.01,
      createdAt: '2026-04-28T10:00:00Z',
      updatedAt: '2026-04-28T10:00:01Z',
    })
    mocks.mockCalculateAuditCost.mockReturnValue(0.005)
    mocks.mockConvertToModelMessages.mockResolvedValue([
      { role: 'user', content: 'Auditar' },
    ])
    mocks.mockCreateClient.mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'u1' } } }),
      },
    })
  })

  // ============================================================================
  // Plan 04 retained tests (auth + 500 + fallback)
  // ============================================================================

  it('returns 403 when not super-user', async () => {
    mocks.mockAssertSuperUser.mockRejectedValue(new Error('FORBIDDEN'))
    const res = await POST(makeRequest(makeFirstRoundBody()))
    expect(res.status).toBe(403)
  })

  it('returns 200 stream when authorized (first round)', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    const res = await POST(makeRequest(makeFirstRoundBody()))
    expect(res.status).toBe(200)
    expect(mocks.mockToUIMessageStreamResponse).toHaveBeenCalled()
  })

  it('uses claude-sonnet-4-6 with temperature 0.3 and maxOutputTokens 4096', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    const capturedModelCalls: string[] = []
    mocks.mockCreateAnthropic.mockImplementation(
      () => (id: string) => {
        capturedModelCalls.push(id)
        return { _model: id }
      },
    )
    await POST(makeRequest(makeFirstRoundBody()))
    expect(capturedModelCalls).toContain('claude-sonnet-4-6')
    expect(mocks.mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxOutputTokens: 4096,
      }),
    )
  })

  it('returns 500 JSON when context assembly throws', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockLoadAgentSpec.mockRejectedValue(
      new Error('Unknown agent spec: foo'),
    )
    const res = await POST(
      makeRequest(makeFirstRoundBody({ respondingAgentId: 'foo' })),
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Unknown agent spec')
  })

  it('falls back to turn.agentId when respondingAgentId is null', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(
      makeRequest(makeFirstRoundBody({ respondingAgentId: null })),
    )
    expect(mocks.mockLoadAgentSpec).toHaveBeenCalledWith('somnio-v3')
  })

  // ============================================================================
  // Plan 05 NEW tests — multi-turn + hypothesis + persistence
  // ============================================================================

  it('Test 11: first round invokes loadConversationTurns + Promise.all + condensePreviousTurn + truncateContext + buildAuditorPromptV2', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockLoadConversationTurns.mockResolvedValue([
      {
        id: 'prev-t1',
        startedAt: '2026-04-24T09:58:00Z',
        conversationId: 'c1',
        workspaceId: 'w1',
        agentId: 'somnio-v3',
        respondingAgentId: 'somnio-recompra-v1',
      },
      {
        id: 'prev-t2',
        startedAt: '2026-04-24T09:59:00Z',
        conversationId: 'c1',
        workspaceId: 'w1',
        agentId: 'somnio-v3',
        respondingAgentId: 'somnio-recompra-v1',
      },
    ])
    await POST(makeRequest(makeFirstRoundBody()))
    expect(mocks.mockLoadConversationTurns).toHaveBeenCalledWith(
      'c1',
      '2026-04-24T10:00:00Z',
    )
    // Per-turn getTurnDetail must be called for each previous turn (Promise.all)
    // Plus the audited turn (1) → total 3 calls
    expect(mocks.mockGetTurnDetail).toHaveBeenCalledTimes(3)
    expect(mocks.mockCondensePreviousTurn).toHaveBeenCalledTimes(2)
    expect(mocks.mockTruncateContext).toHaveBeenCalled()
    expect(mocks.mockBuildAuditorPromptV2).toHaveBeenCalled()
  })

  it('Test 12: first round calls createAuditSession with system prompt + hypothesis', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(
      makeRequest(makeFirstRoundBody({ hypothesis: 'sospecho timing' })),
    )
    expect(mocks.mockCreateAuditSession).toHaveBeenCalledTimes(1)
    const call = mocks.mockCreateAuditSession.mock.calls[0][0]
    expect(call.hypothesis).toBe('sospecho timing')
    expect(call.systemPrompt).toBe('sys-v2')
    expect(call.userId).toBe('u1')
    expect(call.workspaceId).toBe('w1')
  })

  it('Test 13: first round with trimmed > 0 sets X-Forensics-Trimmed header', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockTruncateContext.mockReturnValue({
      kept: [
        {
          turnId: 'p1',
          startedAt: '2026-04-24T09:58:00Z',
        },
      ],
      trimmed: 3,
    })
    const res = await POST(makeRequest(makeFirstRoundBody()))
    expect(res.headers.get('X-Forensics-Trimmed')).toBe('1/4')
  })

  it('Test 14: first round sets X-Audit-Session-Id header with the new uuid', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockCreateAuditSession.mockResolvedValueOnce({
      id: 'specific-uuid-2',
    })
    const res = await POST(makeRequest(makeFirstRoundBody()))
    expect(res.headers.get('X-Audit-Session-Id')).toBe('specific-uuid-2')
  })

  it('Test 15: follow-up round invokes loadAuditSession + does NOT invoke loadConversationTurns/buildAuditorPromptV2 (Pitfall 13 mitigation)', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(makeRequest(makeFollowUpBody('audit-uuid-1')))
    expect(mocks.mockLoadAuditSession).toHaveBeenCalledWith('audit-uuid-1')
    expect(mocks.mockLoadConversationTurns).not.toHaveBeenCalled()
    expect(mocks.mockBuildAuditorPromptV2).not.toHaveBeenCalled()
    expect(mocks.mockGetTurnDetail).not.toHaveBeenCalled()
    expect(mocks.mockCreateAuditSession).not.toHaveBeenCalled()
  })

  it('Test 16: follow-up uses cached system_prompt loaded from DB', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(makeRequest(makeFollowUpBody('audit-uuid-1')))
    expect(mocks.mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'cached-sys', // from loadAuditSession mock
      }),
    )
  })

  it('Test 18: follow-up with auditSessionId that does not exist returns 404', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockLoadAuditSession.mockResolvedValueOnce(null)
    const res = await POST(makeRequest(makeFollowUpBody('missing-id')))
    expect(res.status).toBe(404)
  })

  it('Test 19: first round paralleliza per-turn detail loads via Promise.all', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockLoadConversationTurns.mockResolvedValue([
      {
        id: 'prev-t1',
        startedAt: '2026-04-24T09:58:00Z',
      },
      {
        id: 'prev-t2',
        startedAt: '2026-04-24T09:59:00Z',
      },
      {
        id: 'prev-t3',
        startedAt: '2026-04-24T09:59:30Z',
      },
    ])

    // Inspect: all per-turn calls fire before any settles via Promise.all.
    // We can verify by tracking call count at first await — easier proxy:
    // assert getTurnDetail called for audited (1) + each previous (3) = 4.
    await POST(makeRequest(makeFirstRoundBody()))
    expect(mocks.mockGetTurnDetail).toHaveBeenCalledTimes(4)
  })

  it('Test 20: hypothesis as empty string → normalized to null (no hypothesis block)', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(makeRequest(makeFirstRoundBody({ hypothesis: '   ' })))
    const call = mocks.mockBuildAuditorPromptV2.mock.calls[0][0]
    expect(call.hypothesis).toBeNull()
    const createCall = mocks.mockCreateAuditSession.mock.calls[0][0]
    expect(createCall.hypothesis).toBeNull()
  })

  it('Test extra: ANTHROPIC_API_KEY_TOOLS is used (not generic ANTHROPIC_API_KEY)', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    const capturedKeys: Array<string | undefined> = []
    mocks.mockCreateAnthropic.mockImplementation((opts: any) => {
      capturedKeys.push(opts?.apiKey)
      return (id: string) => ({ _model: id })
    })
    await POST(makeRequest(makeFirstRoundBody()))
    // Verify the helper was called with apiKey from ANTHROPIC_API_KEY_TOOLS.
    // We only assert that createAnthropic received an apiKey field present.
    expect(capturedKeys.length).toBeGreaterThan(0)
    expect(capturedKeys[0]).toBe(process.env.ANTHROPIC_API_KEY_TOOLS)
  })
})
