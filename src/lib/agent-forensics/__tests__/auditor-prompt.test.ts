import { describe, it, expect } from 'vitest'
import { buildAuditorPrompt } from '../auditor-prompt'

const specStub = '# Somnio Recompra v1\n\n## Scope\n- PUEDE responder promos.\n- NO PUEDE mutar tags.\n'
const condensedStub = [
  {
    kind: 'event' as const,
    sequence: 1,
    recordedAt: '2026-04-24T10:00:00Z',
    category: 'pipeline_decision',
    label: 'recompra_routed',
    summary: 'recompra_routed · {"contactId":"x"}',
    raw: {
      id: 'e1',
      sequence: 1,
      recordedAt: '2026-04-24T10:00:00Z',
      category: 'pipeline_decision',
      label: 'recompra_routed',
      payload: { contactId: 'x' },
      durationMs: null,
    },
  },
]
const snapshotStub = {
  session_id: 'sess-1',
  datos_capturados: { nombre: 'Jose', phone: '+57...', intent_previo: 'saludo' },
}
const turnStub = {
  id: 't1',
  conversationId: 'c1',
  workspaceId: 'w1',
  agentId: 'somnio-v3',
  respondingAgentId: 'somnio-recompra-v1',
  startedAt: '2026-04-24T10:00:00Z',
  finishedAt: '2026-04-24T10:00:01Z',
  durationMs: 1000,
  eventCount: 1,
  queryCount: 0,
  aiCallCount: 0,
  totalTokens: 100,
  totalCostUsd: 0.0001,
  hasError: false,
  triggerKind: 'user_message',
  currentMode: null,
  newMode: null,
}

describe('buildAuditorPrompt — structure + NO-invent rule (D-09, D-13)', () => {
  it('includes the spec body verbatim in user message', () => {
    const { userMessage } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
    })
    expect(userMessage).toContain('# Somnio Recompra v1')
    expect(userMessage).toContain('PUEDE responder promos')
  })

  it('includes condensed timeline as JSON code fence', () => {
    const { userMessage } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
    })
    expect(userMessage).toMatch(/```json[\s\S]*recompra_routed[\s\S]*```/)
  })

  it('includes snapshot JSON', () => {
    const { userMessage } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
    })
    expect(userMessage).toMatch(/```json[\s\S]*datos_capturados[\s\S]*```/)
  })

  it('includes turn metadata (entry + responding agent)', () => {
    const { userMessage } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
    })
    expect(userMessage).toContain('somnio-v3') // entry
    expect(userMessage).toContain('somnio-recompra-v1') // responding
    expect(userMessage).toContain('user_message') // triggerKind
  })

  it('system prompt enforces required markdown structure', () => {
    const { systemPrompt } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
    })
    expect(systemPrompt).toMatch(/Resumen/)
    expect(systemPrompt).toMatch(/Evidencia/i)
    expect(systemPrompt).toMatch(/Discrepancias/i)
    expect(systemPrompt).toMatch(/Próximos pasos|Proximos pasos/i)
  })

  it('system prompt contains NO-invent rule (pointer safety)', () => {
    const { systemPrompt } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
    })
    expect(systemPrompt).toMatch(/NUNCA inventes|no inventes/i)
  })

  it('falls back to agentId when respondingAgentId is null', () => {
    const { userMessage } = buildAuditorPrompt({
      spec: specStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: { ...turnStub, respondingAgentId: null } as any,
    })
    expect(userMessage).toContain('Responding agent')
    const matches = userMessage.match(/somnio-v3/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })
})
