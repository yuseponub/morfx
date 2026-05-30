/**
 * somnio-v4 response-track — coverage-gated informational template selection (Plan 04 — T-8).
 *
 * Verifies that resolveResponseTrack does NOT emit informational templates for intents
 * whose slot coverage is 'low' (they escalate to RAG instead — D-03).
 *
 * Test structure mirrors somnio-recompra/__tests__/response-track.test.ts:
 *   mock TemplateManager before importing the module-under-test (vi.mock hoists).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// Mock TemplateManager BEFORE importing response-track (vi.mock hoists)
// ============================================================================

const getTemplatesForIntentsMock = vi.fn()
const processTemplatesMock = vi.fn()

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))

// Mock delivery-zones so tiempo_entrega does not make real lookups
vi.mock('../delivery-zones', () => ({
  lookupDeliveryZone: async (_ciudad: string) => ({ zone: 'standard', estimatedDays: '2-4' }),
  formatDeliveryTime: () => 'en 2-4 dias habiles',
}))

// Mock observability (collector)
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: () => {} }),
}))

// Import AFTER mocks
import { resolveResponseTrack } from '../response-track'
import { createInitialState } from '../state'
import type { AgentState } from '../types'

// ============================================================================
// Fixtures
// ============================================================================

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    ...createInitialState(),
    ...overrides,
  }
}

/** Return a minimal TemplateManager mock that resolves one intent with one template. */
function mockSingleTemplate(intent: string, templateId: string) {
  getTemplatesForIntentsMock.mockResolvedValueOnce(
    new Map([
      [
        intent,
        {
          templates: [{ id: templateId, content: 'texto test', content_type: 'texto', priority: 'CORE', orden: 0, delay_s: 0 }],
          visitType: 'primera_vez',
          alreadySent: [],
          isRepeatedVisit: false,
        },
      ],
    ])
  )
  processTemplatesMock.mockResolvedValueOnce([
    { id: templateId, content: 'texto test', contentType: 'texto', priority: 'CORE', orden: 0, delaySeconds: 0 },
  ])
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// T-8: coverage-gated informational template selection
// ============================================================================

describe('resolveResponseTrack — coverage-gated informational templates (T-8)', () => {
  it('emits template for a primary intent when intentCoverage is "covered" (default behavior preserved)', async () => {
    mockSingleTemplate('precio', 'tpl-precio-001')

    const result = await resolveResponseTrack({
      intent: 'precio',
      intentCoverage: 'covered',
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.infoTemplateIntents).toContain('precio')
    expect(result.messages).toHaveLength(1)
  })

  it('emits template for a primary intent when intentCoverage is undefined (back-compat — treated as covered)', async () => {
    mockSingleTemplate('precio', 'tpl-precio-001')

    const result = await resolveResponseTrack({
      intent: 'precio',
      // intentCoverage: undefined — omitted
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.infoTemplateIntents).toContain('precio')
    expect(result.messages).toHaveLength(1)
  })

  it('does NOT emit the primary intent template when intentCoverage is "low"', async () => {
    // TemplateManager should NOT be called for a low-coverage primary intent.
    // No mock needed because the intent is gated before calling TemplateManager.

    const result = await resolveResponseTrack({
      intent: 'precio',
      intentCoverage: 'low',
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.infoTemplateIntents).not.toContain('precio')
    expect(result.messages).toHaveLength(0)
    expect(getTemplatesForIntentsMock).not.toHaveBeenCalled()
  })

  it('emits template for a secondary intent when secondaryCoverage is "covered"', async () => {
    mockSingleTemplate('contraindicaciones', 'tpl-contra-001')

    const result = await resolveResponseTrack({
      intent: 'precio',
      intentCoverage: 'low',        // primary is low → no primary template
      secondaryIntent: 'contraindicaciones',
      secondaryCoverage: 'covered', // secondary is covered → template emitted
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.infoTemplateIntents).not.toContain('precio')
    expect(result.infoTemplateIntents).toContain('contraindicaciones')
    expect(result.messages).toHaveLength(1)
  })

  it('does NOT emit the secondary intent template when secondaryCoverage is "low" (the L90-96 bug fix)', async () => {
    // The bug: response-track.ts:90-96 stacked the secondary template WITHOUT measuring coverage.
    // Fix: guard with input.secondaryCoverage !== 'low'.
    // primary is covered → set up mock for precio; secondary is LOW → its template must NOT be emitted.
    mockSingleTemplate('precio', 'tpl-precio-001')

    const result = await resolveResponseTrack({
      intent: 'precio',
      intentCoverage: 'covered',     // primary is covered → template emitted
      secondaryIntent: 'contraindicaciones',
      secondaryCoverage: 'low',      // secondary is low → template must NOT be emitted
      state: makeState(),
      workspaceId: 'test-ws',
    })

    // The infoTemplateIntents list should NOT include 'contraindicaciones' (it was gated).
    expect(result.infoTemplateIntents).not.toContain('contraindicaciones')
    // Primary template IS emitted
    expect(result.infoTemplateIntents).toContain('precio')
  })

  it('does NOT emit secondary template when secondaryCoverage is "low" — full covered+low scenario', async () => {
    // Set up for covered primary only (no secondary template)
    mockSingleTemplate('precio', 'tpl-precio-001')

    const result = await resolveResponseTrack({
      intent: 'precio',
      intentCoverage: 'covered',
      secondaryIntent: 'contraindicaciones',
      secondaryCoverage: 'low',
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.infoTemplateIntents).toContain('precio')
    expect(result.infoTemplateIntents).not.toContain('contraindicaciones')
    // Only the covered primary template should be emitted
    expect(result.messages).toHaveLength(1)
  })

  it('emits template when secondaryCoverage is undefined (back-compat — treated as covered)', async () => {
    mockSingleTemplate('precio', 'tpl-precio-001')
    mockSingleTemplate('contraindicaciones', 'tpl-contra-001')

    const result = await resolveResponseTrack({
      intent: 'precio',
      // intentCoverage: undefined
      secondaryIntent: 'contraindicaciones',
      // secondaryCoverage: undefined
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.infoTemplateIntents).toContain('precio')
    expect(result.infoTemplateIntents).toContain('contraindicaciones')
  })

  it('sales-action templates are NOT affected by intentCoverage=low (coverage gates only informational intents)', async () => {
    // Sales actions bypass coverage entirely — they are deterministic and not KB-answered.
    // When coverage is low but a salesAction is set, the sales template still fires.
    // pedir_datos is a sales action (in ACTION_TEMPLATE_MAP), NOT in INFORMATIONAL_INTENTS.
    // The mock covers the sales action template; precio (informational) is gated by intentCoverage=low.
    getTemplatesForIntentsMock.mockResolvedValueOnce(
      new Map([
        [
          'pedir_datos',
          {
            templates: [{ id: 'tpl-pedir-datos-001', content: 'falta: {{campos_faltantes}}', content_type: 'texto', priority: 'CORE', orden: 0, delay_s: 0 }],
            visitType: 'primera_vez',
            alreadySent: [],
            isRepeatedVisit: false,
          },
        ],
      ])
    )
    processTemplatesMock.mockResolvedValueOnce([
      { id: 'tpl-pedir-datos-001', content: 'falta: nombre', contentType: 'texto', priority: 'CORE', orden: 0, delaySeconds: 0 },
    ])

    const result = await resolveResponseTrack({
      salesAction: 'pedir_datos',
      intent: 'precio',
      intentCoverage: 'low', // LOW — the informational intent template must NOT be emitted
      state: makeState(),
      workspaceId: 'test-ws',
    })

    expect(result.salesTemplateIntents).toContain('pedir_datos')
    // The informational template for 'precio' is gated
    expect(result.infoTemplateIntents).not.toContain('precio')
  })
})
