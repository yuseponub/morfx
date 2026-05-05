/**
 * Tests E2E pipeline integration para godentist-fb-ig-agent.processMessage.
 *
 * Standalone agent-godentist-fb-ig — Plan 06 Wave 4 Task 3.
 *
 * Mocks: createInstrumentedAnthropic (Haiku) + TemplateManager + composeBlock
 * + observability collector. Tests verifican flujo end-to-end sin DB / sin
 * red:
 *   - Lead-capture turn 1 happy path: cliente envia datos parciales -> output
 *     incluye pedir_datos_parcial y agent_id="godentist-fb-ig" en lookup.
 *   - Saludo turn 0: input "hola" -> output incluye saludo template.
 *   - English idioma -> englishresponse short-circuit.
 *   - Escape intent (asesor) -> guards.ts R1 -> handoff (sin templates).
 *   - System event timer_expired:0 path (NO comprehension call).
 *
 * Anti-regresion D-08: cada test verifica que getTemplatesForIntents recibe
 * "godentist-fb-ig" como primer argumento.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// vi.hoisted mocks
// ============================================================================

const messagesCreateMock = vi.hoisted(() => vi.fn())
const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
}))

vi.mock('@/lib/observability/anthropic-instrumented', () => ({
  createInstrumentedAnthropic: vi.fn(() => ({
    messages: { create: messagesCreateMock },
  })),
}))

vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({
  zodOutputFormat: vi.fn(() => ({})),
}))

vi.mock('@/lib/agents/somnio/template-manager', () => ({
  TemplateManager: vi.fn().mockImplementation(() => ({
    getTemplatesForIntents: getTemplatesForIntentsMock,
    processTemplates: processTemplatesMock,
  })),
}))

vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    runWithPurpose: async (_purpose: string, fn: () => Promise<unknown>) => fn(),
    getCollector: () => ({ recordEvent: vi.fn(), setRespondingAgentId: vi.fn() }),
  }
})

vi.mock('@/lib/agents/somnio/block-composer', () => ({
  composeBlock: (byIntent: Map<string, unknown[]>) => {
    const block: unknown[] = []
    for (const [, templates] of byIntent) {
      block.push(...templates)
    }
    return { block }
  },
}))

// Mock Dentos availability — no robot calls in tests
vi.mock('../dentos-availability', () => ({
  checkDentosAvailability: vi.fn(async () => ({
    success: true,
    slots: { manana: ['9:00 AM', '10:00 AM'], tarde: ['2:00 PM'] },
  })),
}))

// Imports AFTER mocks
import { processMessage } from '../godentist-fb-ig-agent'
import type { V3AgentInput } from '../types'

// ============================================================================
// Helpers
// ============================================================================

function buildInput(overrides: Partial<V3AgentInput> = {}): V3AgentInput {
  return {
    message: 'test message',
    history: [],
    currentMode: 'nuevo',
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    accionesEjecutadas: [],
    turnNumber: 0,
    workspaceId: 'test-workspace-uuid',
    ...overrides,
  }
}

function buildHaikuResponse(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function fullExtractedFields(overrides: Record<string, unknown> = {}) {
  return {
    nombre: null,
    telefono: null,
    sede_preferida: null,
    servicio_interes: null,
    cedula: null,
    fecha_preferida: null,
    fecha_vaga: null,
    preferencia_jornada: null,
    horario_seleccionado: null,
    ...overrides,
  }
}

function fullClassification(overrides: Record<string, unknown> = {}) {
  return {
    category: 'datos',
    sentiment: 'neutro',
    idioma: 'es',
    ...overrides,
  }
}

beforeEach(() => {
  messagesCreateMock.mockReset()
  getTemplatesForIntentsMock.mockReset()
  processTemplatesMock.mockReset()
  // Default: empty
  getTemplatesForIntentsMock.mockResolvedValue(new Map())
  processTemplatesMock.mockResolvedValue([])
})

// ============================================================================
// E2E Test Cases
// ============================================================================

describe('processMessage — E2E pipeline (godentist-fb-ig)', () => {
  it('happy path turn 1 lead-capture: cliente envia datos parciales -> pedir_datos_parcial via godentist-fb-ig catalog', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildHaikuResponse({
        intent: { primary: 'datos', secondary: 'ninguno', confidence: 95, reasoning: 'lead capture' },
        extracted_fields: fullExtractedFields({ nombre: 'Juan Perez', telefono: '573001234567' }),
        classification: fullClassification({ category: 'datos' }),
      }),
    )

    getTemplatesForIntentsMock.mockResolvedValue(
      new Map([
        ['pedir_datos_parcial', {
          templates: [{
            id: 'tpl-pdp-1',
            content: 'Para completar tu cita necesito:\n{{campos_faltantes}}',
            content_type: 'texto',
            delay_s: 0,
            orden: 0,
            priority: 'CORE',
          }],
          visitType: 'primera_vez',
          alreadySent: [],
          isRepeatedVisit: false,
        }],
      ]),
    )
    processTemplatesMock.mockImplementation(async (templates: Array<{ id: string; content: string; content_type: string; delay_s: number; orden: number; priority: 'CORE' }>, ctx: Record<string, string>) => {
      return templates.map((t) => ({
        id: t.id,
        content: t.content.replace('{{campos_faltantes}}', ctx?.campos_faltantes ?? ''),
        contentType: t.content_type,
        delaySeconds: t.delay_s,
        orden: t.orden,
        priority: t.priority,
      }))
    })

    const result = await processMessage(buildInput({
      message: 'Juan Perez, 3001234567',
      turnNumber: 0,  // pre-merge — mergeAnalysis bumps to 1
    }))

    // Anti-regresion D-08
    expect(getTemplatesForIntentsMock).toHaveBeenCalled()
    const lookupArgs = getTemplatesForIntentsMock.mock.calls[0]
    expect(lookupArgs[0]).toBe('godentist-fb-ig')
    expect(lookupArgs[0]).not.toBe('godentist')

    // Pipeline outputs
    expect(result.success).toBe(true)
    expect(result.intentInfo?.intent).toBe('datos')
    expect(result.salesTrackInfo?.accion).toBe('pedir_datos_parcial')
    expect(result.responseTrackInfo?.salesTemplateIntents).toContain('pedir_datos_parcial')
    // Datos capturados via mergeAnalysis
    expect(result.datosCapturados.nombre).toBe('Juan Perez')
    expect(result.datosCapturados.telefono).toBe('573001234567')
  })

  it('saludo turn 0: input "hola" -> saludo template via godentist-fb-ig catalog', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildHaikuResponse({
        intent: { primary: 'saludo', secondary: 'ninguno', confidence: 90, reasoning: 'saludo inicial' },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'irrelevante', sentiment: 'positivo' }),
      }),
    )

    getTemplatesForIntentsMock.mockResolvedValue(
      new Map([
        ['saludo', {
          templates: [{
            id: 'tpl-saludo-1',
            content: 'Hola — saludo del sibling FB/IG (lead-capture)',
            content_type: 'texto',
            delay_s: 0,
            orden: 0,
            priority: 'CORE',
          }],
          visitType: 'primera_vez',
          alreadySent: [],
          isRepeatedVisit: false,
        }],
      ]),
    )
    processTemplatesMock.mockImplementation(async (templates: Array<{ id: string; content: string; content_type: string; delay_s: number; orden: number; priority: 'CORE' }>) => {
      return templates.map((t) => ({
        id: t.id,
        content: t.content,
        contentType: t.content_type,
        delaySeconds: t.delay_s,
        orden: t.orden,
        priority: t.priority,
      }))
    })

    const result = await processMessage(buildInput({ message: 'hola' }))

    // Anti-regresion D-08
    const lookupArgs = getTemplatesForIntentsMock.mock.calls[0]
    expect(lookupArgs[0]).toBe('godentist-fb-ig')

    expect(result.success).toBe(true)
    expect(result.intentInfo?.intent).toBe('saludo')
    expect(result.responseTrackInfo?.infoTemplateIntents).toContain('saludo')
  })

  it('English short-circuit: idioma=en -> english_response via godentist-fb-ig catalog', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildHaikuResponse({
        // High confidence so guards.ts R0 (low_confidence + otro) does NOT block.
        // English short-circuit fires AFTER guards in the pipeline.
        intent: { primary: 'saludo', secondary: 'ninguno', confidence: 90, reasoning: 'english greeting' },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'irrelevante', idioma: 'en' }),
      }),
    )

    getTemplatesForIntentsMock.mockResolvedValue(
      new Map([
        ['english_response', {
          templates: [{
            id: 'tpl-eng-1',
            content: 'Sorry, we only support Spanish.',
            content_type: 'texto',
            delay_s: 0,
            orden: 0,
            priority: 'CORE',
          }],
          visitType: 'primera_vez',
          alreadySent: [],
          isRepeatedVisit: false,
        }],
      ]),
    )
    processTemplatesMock.mockImplementation(async (templates: Array<{ id: string; content: string; content_type: string; delay_s: number; orden: number; priority: 'CORE' }>) => {
      return templates.map((t) => ({
        id: t.id,
        content: t.content,
        contentType: t.content_type,
        delaySeconds: t.delay_s,
        orden: t.orden,
        priority: t.priority,
      }))
    })

    const result = await processMessage(buildInput({ message: 'hello, do you speak english?' }))

    expect(result.success).toBe(true)
    // English short-circuit fires after guards. Lookup happens with godentist-fb-ig
    // for english_response template.
    const lookupArgs = getTemplatesForIntentsMock.mock.calls[0]
    expect(lookupArgs[0]).toBe('godentist-fb-ig')
    expect(lookupArgs[1]).toEqual(['english_response'])
    expect(result.timerSignals).toEqual([{ type: 'cancel', reason: 'english message — no followup' }])
  })

  it('Escape intent (asesor) -> guards.ts R1 handoff (no templates rendered)', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      buildHaikuResponse({
        intent: { primary: 'asesor', secondary: 'ninguno', confidence: 95, reasoning: 'pide hablar con asesor' },
        extracted_fields: fullExtractedFields(),
        classification: fullClassification({ category: 'pregunta' }),
      }),
    )

    const result = await processMessage(buildInput({ message: 'quiero hablar con un asesor humano' }))

    expect(result.success).toBe(true)
    expect(result.newMode).toBe('handoff')
    expect(result.messages).toEqual([])
    // No template lookup invoked when guard blocks
    expect(getTemplatesForIntentsMock).not.toHaveBeenCalled()
    expect(result.decisionInfo?.action).toBe('handoff')
  })

  it('System event timer_expired:0 -> retoma_inicial path (NO comprehension call)', async () => {
    // Pre-existing capturing_data state via accionesEjecutadas
    const result = await processMessage(buildInput({
      message: '',
      systemEvent: { type: 'timer_expired', level: 0 },
      accionesEjecutadas: [{ tipo: 'pedir_datos', turno: 1, origen: 'bot' }],
      datosCapturados: {},
      intentsVistos: ['quiero_agendar'],
      turnNumber: 1,
    }))

    // Comprehension NOT called for system events
    expect(messagesCreateMock).not.toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.salesTrackInfo?.accion).toBe('retoma_inicial')
    // Anti-regresion D-08: even system event path uses sibling agent_id
    if (getTemplatesForIntentsMock.mock.calls.length > 0) {
      expect(getTemplatesForIntentsMock.mock.calls[0][0]).toBe('godentist-fb-ig')
    }
  })

  it('Comprehension error path -> success=false + safe state propagation', async () => {
    messagesCreateMock.mockRejectedValueOnce(new Error('Anthropic API timeout'))

    const result = await processMessage(buildInput({ message: 'cualquier cosa' }))

    expect(result.success).toBe(false)
    expect(result.messages).toEqual([])
    // State preserved from input (no mergeAnalysis ran)
    expect(result.intentsVistos).toEqual([])
  })
})
