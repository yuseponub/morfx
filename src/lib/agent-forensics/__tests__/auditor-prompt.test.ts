import { describe, it, expect } from 'vitest'
import { buildAuditorPrompt, buildAuditorPromptV2 } from '../auditor-prompt'
import type { CondensedPreviousTurn } from '../condense-previous-turn'

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

const previousTurnsStub: CondensedPreviousTurn[] = [
  {
    turnId: 'prev-t1',
    startedAt: '2026-04-24T09:58:00Z',
    durationMs: 800,
    respondingAgentId: 'somnio-recompra-v1',
    entryAgentId: 'somnio-v3',
    triggerKind: 'user_message',
    intent: 'saludo',
    intentConfidence: 0.92,
    pipelineDecisions: [
      { label: 'recompra_routed', payload: { action: 'route', agent: 'somnio-recompra-v1' } },
    ],
    templatesEnviados: ['saludo'],
    modeTransitions: [],
    toolCalls: [],
    guards: [],
    stateChanges: { modeAtEnd: 'recompra' },
    hasError: false,
    totalTokens: 90,
    totalCostUsd: 0.0001,
  },
  {
    turnId: 'prev-t2',
    startedAt: '2026-04-24T09:59:00Z',
    durationMs: 1200,
    respondingAgentId: 'somnio-recompra-v1',
    entryAgentId: 'somnio-v3',
    triggerKind: 'user_message',
    intent: 'precio',
    intentConfidence: 0.88,
    pipelineDecisions: [],
    templatesEnviados: ['precio'],
    modeTransitions: [],
    toolCalls: [],
    guards: [],
    stateChanges: {},
    hasError: false,
    totalTokens: 120,
    totalCostUsd: 0.00015,
  },
]

describe('buildAuditorPromptV2 — multi-turn + hipotesis + anti-falso-positivo (D-14, D-16, D-19)', () => {
  it('V2-1: system prompt includes the 4 mandatory headers + NO-invent rule', () => {
    const { systemPrompt } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(systemPrompt).toMatch(/Resumen/)
    expect(systemPrompt).toMatch(/Evidencia/i)
    expect(systemPrompt).toMatch(/Discrepancias/i)
    expect(systemPrompt).toMatch(/Próximos pasos|Proximos pasos/i)
    expect(systemPrompt).toMatch(/NUNCA inventes|no inventes/i)
  })

  it('V2-2: system prompt includes CONTEXTO MULTI-TURN block', () => {
    const { systemPrompt } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(systemPrompt).toContain('CONTEXTO MULTI-TURN')
    expect(systemPrompt).toContain('crm-reader')
    expect(systemPrompt).toMatch(/snapshot/i)
  })

  it('V2-3: system prompt includes ANTI-FALSO-POSITIVO directive', () => {
    const { systemPrompt } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(systemPrompt).toContain('ANTI-FALSO-POSITIVO')
    expect(systemPrompt).toMatch(/hipótesis benigna|hipotesis benigna/i)
    expect(systemPrompt).toMatch(/descart/i)
  })

  it('V2-4: when hypothesis === null, system prompt does NOT include HIPOTESIS DEL USUARIO', () => {
    const { systemPrompt } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(systemPrompt).not.toContain('HIPÓTESIS DEL USUARIO')
    expect(systemPrompt).not.toContain('HIPOTESIS DEL USUARIO')
  })

  it('V2-5: when hypothesis !== null, system prompt includes HIPOTESIS DEL USUARIO + text + investigate directive', () => {
    const userHypothesis = 'el bot mando promo cuando solo hubo saludo'
    const { systemPrompt } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: userHypothesis,
    })
    expect(systemPrompt).toMatch(/HIPÓTESIS DEL USUARIO|HIPOTESIS DEL USUARIO/)
    expect(systemPrompt).toContain(userHypothesis)
    expect(systemPrompt).toMatch(/Investiga ESPECÍFICAMENTE|Investiga ESPECIFICAMENTE/i)
  })

  it('V2-6: user message includes spec + previousTurns JSON + condensed JSON + snapshot JSON', () => {
    const { userMessage } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(userMessage).toContain('# Somnio Recompra v1') // spec
    expect(userMessage).toContain('prev-t1')
    expect(userMessage).toContain('prev-t2')
    expect(userMessage).toMatch(/```json[\s\S]*prev-t1[\s\S]*```/)
    expect(userMessage).toMatch(/```json[\s\S]*recompra_routed[\s\S]*```/) // condensed audited
    expect(userMessage).toMatch(/```json[\s\S]*datos_capturados[\s\S]*```/) // snapshot
  })

  it('V2-7: when hypothesis !== null, user message ALSO includes ## Hipótesis del usuario block (dual placement)', () => {
    const userHypothesis = 'sospecho timing de promos'
    const { userMessage } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: userHypothesis,
    })
    expect(userMessage).toMatch(/## Hipótesis del usuario|## Hipotesis del usuario/)
    expect(userMessage).toContain(userHypothesis)
  })

  it('V2-8: when hypothesis === null, user message does NOT include hipotesis block', () => {
    const { userMessage } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(userMessage).not.toMatch(/## Hipótesis del usuario|## Hipotesis del usuario/)
  })

  it('V2-9: user message includes "Afirma o refuta" instruction ONLY when hypothesis !== null', () => {
    const withHyp = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: 'algo',
    })
    expect(withHyp.userMessage).toMatch(/Afirma o refuta/i)

    const noHyp = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: null,
    })
    expect(noHyp.userMessage).not.toMatch(/Afirma o refuta/i)
  })

  it('V2-10: respondingAgentId fallback to agentId preserved', () => {
    const { userMessage } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: { ...turnStub, respondingAgentId: null } as any,
      hypothesis: null,
    })
    const matches = userMessage.match(/somnio-v3/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('V2-11: empty/whitespace hypothesis treated as null (no block in user message)', () => {
    const { userMessage, systemPrompt } = buildAuditorPromptV2({
      spec: specStub,
      previousTurns: previousTurnsStub,
      condensed: condensedStub,
      snapshot: snapshotStub,
      turn: turnStub as any,
      hypothesis: '   ',
    })
    expect(systemPrompt).not.toContain('HIPÓTESIS DEL USUARIO')
    expect(userMessage).not.toMatch(/## Hipótesis del usuario|## Hipotesis del usuario/)
  })
})
