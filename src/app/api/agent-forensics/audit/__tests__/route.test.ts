import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted pattern — mocks defined here are accessible from vi.mock
// factories (which vitest hoists to top of the file before imports).
// Same pattern used in Plan 03 (load-agent-spec.test.ts, load-session-snapshot.test.ts).
const mocks = vi.hoisted(() => ({
  mockAssertSuperUser: vi.fn(),
  mockGetTurnDetail: vi.fn(),
  mockLoadAgentSpec: vi.fn(),
  mockLoadSessionSnapshot: vi.fn(),
  mockCondenseTimeline: vi.fn(),
  mockBuildAuditorPrompt: vi.fn(),
  mockStreamText: vi.fn(),
  mockCreateAnthropic: vi.fn(),
  mockToUIMessageStreamResponse: vi.fn(),
}))

vi.mock('@/lib/auth/super-user', () => ({
  assertSuperUser: mocks.mockAssertSuperUser,
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
}))
vi.mock('ai', () => ({
  streamText: mocks.mockStreamText,
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

describe('POST /api/agent-forensics/audit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockCreateAnthropic.mockImplementation(
      () => (id: string) => ({ _model: id }),
    )
    mocks.mockToUIMessageStreamResponse.mockReturnValue(
      new Response('stream', { status: 200 }),
    )
    mocks.mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: mocks.mockToUIMessageStreamResponse,
    })
    mocks.mockGetTurnDetail.mockResolvedValue({
      turn: {
        id: 't1',
        agentId: 'somnio-v3',
        respondingAgentId: 'somnio-recompra-v1',
      },
      events: [],
      queries: [],
      aiCalls: [],
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
  })

  it('returns 403 when not super-user', async () => {
    mocks.mockAssertSuperUser.mockRejectedValue(new Error('FORBIDDEN'))
    const res = await POST(
      makeRequest({
        turnId: 't1',
        startedAt: '2026-04-24T10:00:00Z',
        respondingAgentId: 'somnio-recompra-v1',
        conversationId: 'c1',
      }),
    )
    expect(res.status).toBe(403)
  })

  it('returns 200 stream when authorized', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    const res = await POST(
      makeRequest({
        turnId: 't1',
        startedAt: '2026-04-24T10:00:00Z',
        respondingAgentId: 'somnio-recompra-v1',
        conversationId: 'c1',
      }),
    )
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
    await POST(
      makeRequest({
        turnId: 't1',
        startedAt: '2026-04-24T10:00:00Z',
        respondingAgentId: 'somnio-recompra-v1',
        conversationId: 'c1',
      }),
    )
    expect(capturedModelCalls).toContain('claude-sonnet-4-6')
    expect(mocks.mockStreamText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        maxOutputTokens: 4096,
      }),
    )
  })

  it('assembles context in parallel (all 3 loads called with correct args)', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(
      makeRequest({
        turnId: 't1',
        startedAt: '2026-04-24T10:00:00Z',
        respondingAgentId: 'somnio-recompra-v1',
        conversationId: 'c1',
      }),
    )
    expect(mocks.mockGetTurnDetail).toHaveBeenCalledWith('t1', '2026-04-24T10:00:00Z')
    expect(mocks.mockLoadAgentSpec).toHaveBeenCalledWith('somnio-recompra-v1')
    expect(mocks.mockLoadSessionSnapshot).toHaveBeenCalledWith('c1')
    expect(mocks.mockCondenseTimeline).toHaveBeenCalled()
    expect(mocks.mockBuildAuditorPrompt).toHaveBeenCalled()
  })

  it('returns 500 JSON when context assembly throws', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    mocks.mockLoadAgentSpec.mockRejectedValue(new Error('Unknown agent spec: foo'))
    const res = await POST(
      makeRequest({
        turnId: 't1',
        startedAt: '2026-04-24T10:00:00Z',
        respondingAgentId: 'foo',
        conversationId: 'c1',
      }),
    )
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toContain('Unknown agent spec')
  })

  it('falls back to turn.agentId when respondingAgentId is null', async () => {
    mocks.mockAssertSuperUser.mockResolvedValue(undefined)
    await POST(
      makeRequest({
        turnId: 't1',
        startedAt: '2026-04-24T10:00:00Z',
        respondingAgentId: null,
        conversationId: 'c1',
      }),
    )
    expect(mocks.mockLoadAgentSpec).toHaveBeenCalledWith('somnio-v3') // turn.agentId
  })
})
