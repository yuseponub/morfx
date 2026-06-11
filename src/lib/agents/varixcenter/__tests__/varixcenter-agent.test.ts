/**
 * Tests E2E pipeline para varixcenter-agent.processMessage.
 *
 * Standalone agent-varixcenter — Plan 06 Wave 3 Task 2 (TDD RED).
 *
 * Mocks: comprehension (Haiku) + TemplateManager + composeBlock + observability
 * + domain varix-clinic (availability + booking). Tests verifican el write-path
 * NUEVO sin DB / sin red:
 *   - mostrar_disponibilidad -> getVarixAvailability (slots en context)
 *   - mostrar_disponibilidad con throw -> fail-open (no crashea, sin_disponibilidad)
 *   - agendar_cita -> bookVarixAppointment con parseSlotToISO (offset -05:00)
 *   - agendar_cita slot_taken -> re-availability + sin_disponibilidad
 *   - agendar_cita error -> fail-open a handoff
 *   - Anti-Pitfall 1: lookup con agent_id='varixcenter'
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================================
// vi.hoisted mocks
// ============================================================================

const {
  comprehendMock,
  getTemplatesForIntentsMock,
  processTemplatesMock,
  getVarixAvailabilityMock,
  bookVarixAppointmentMock,
} = vi.hoisted(() => ({
  comprehendMock: vi.fn(),
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
  getVarixAvailabilityMock: vi.fn(),
  bookVarixAppointmentMock: vi.fn(),
}))

vi.mock('../comprehension', () => ({
  comprehend: comprehendMock,
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

vi.mock('@/lib/domain/varix-clinic/availability', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    getVarixAvailability: getVarixAvailabilityMock,
  }
})

vi.mock('@/lib/domain/varix-clinic/booking', () => ({
  bookVarixAppointment: bookVarixAppointmentMock,
}))

// Imports AFTER mocks
import { processMessage } from '../varixcenter-agent'
import type { V3AgentInput } from '../types'
import type { MessageAnalysis } from '../comprehension-schema'

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
    workspaceId: 'ws-test',
    ...overrides,
  }
}

function buildAnalysis(overrides: Partial<MessageAnalysis> = {}): MessageAnalysis {
  return {
    intent: { primary: 'quiero_agendar', secondary: 'ninguno', confidence: 95, reasoning: 'test' },
    extracted_fields: {
      nombre: null, telefono: null, cedula: null, ciudad: null, tipo_venas: null,
      fecha_preferida: null, fecha_vaga: null, preferencia_jornada: null, horario_seleccionado: null,
    },
    classification: { category: 'pregunta', sentiment: 'neutro', idioma: 'es' },
    ...overrides,
  } as MessageAnalysis
}

beforeEach(() => {
  comprehendMock.mockReset()
  getTemplatesForIntentsMock.mockReset()
  processTemplatesMock.mockReset()
  getVarixAvailabilityMock.mockReset()
  bookVarixAppointmentMock.mockReset()

  getTemplatesForIntentsMock.mockResolvedValue(new Map())
  processTemplatesMock.mockResolvedValue([])
  getVarixAvailabilityMock.mockResolvedValue({ manana: ['8:00 AM - 8:20 AM'], tarde: [] })
  bookVarixAppointmentMock.mockResolvedValue({ ok: true, appointmentId: 'a1', patientId: 'p1' })
})

// ============================================================================
// mostrar_disponibilidad -> getVarixAvailability
// ============================================================================

describe('processMessage — availability lookup', () => {
  it('mostrar_disponibilidad llama getVarixAvailability con la fecha', async () => {
    comprehendMock.mockResolvedValue({
      analysis: buildAnalysis({
        intent: { primary: 'quiero_agendar', secondary: 'ninguno', confidence: 95, reasoning: 't' },
      }),
      tokensUsed: 10,
    })

    const input = buildInput({
      message: 'el de las 8',
      datosCapturados: {
        nombre: 'Juan Perez', telefono: '573001234567', cedula: '109',
        fecha_preferida: '2026-06-16',
      },
    })

    await processMessage(input)

    expect(getVarixAvailabilityMock).toHaveBeenCalledWith('2026-06-16')
  })

  it('availability throw -> fail-open (no crashea, success true)', async () => {
    getVarixAvailabilityMock.mockRejectedValueOnce(new Error('env vars not set'))
    comprehendMock.mockResolvedValue({
      analysis: buildAnalysis(),
      tokensUsed: 10,
    })

    const input = buildInput({
      datosCapturados: {
        nombre: 'Juan', telefono: '573001234567', cedula: '109', fecha_preferida: '2026-06-16',
      },
    })

    const out = await processMessage(input)
    expect(out.success).toBe(true)
  })
})

// ============================================================================
// agendar_cita write-path (parseSlotToISO + bookVarixAppointment)
// ============================================================================

describe('processMessage — agendar_cita write-path', () => {
  function setupConfirming() {
    // Estado en `confirming` con horario elegido -> intent confirmar dispara agendar_cita
    comprehendMock.mockResolvedValue({
      analysis: buildAnalysis({
        intent: { primary: 'confirmar', secondary: 'ninguno', confidence: 95, reasoning: 't' },
        classification: { category: 'pregunta', sentiment: 'positivo', idioma: 'es' },
      }),
      tokensUsed: 10,
    })
    return buildInput({
      message: 'si confirmo',
      datosCapturados: {
        nombre: 'Juan Perez', telefono: '573001234567', cedula: '109876',
        fecha_preferida: '2026-06-16', horario_seleccionado: '8:00 AM - 8:20 AM',
      },
      accionesEjecutadas: [
        { tipo: 'mostrar_confirmacion', turno: 3, origen: 'bot' },
      ],
    })
  }

  it('agendar_cita llama bookVarixAppointment con fechaHoraInicio/Fin con offset -05:00', async () => {
    const input = setupConfirming()
    await processMessage(input)

    expect(bookVarixAppointmentMock).toHaveBeenCalledTimes(1)
    const args = bookVarixAppointmentMock.mock.calls[0][0]
    expect(args.nombre).toBe('Juan Perez')
    expect(args.cedula).toBe('109876')
    expect(args.fechaHoraInicio).toBe('2026-06-16T08:00:00-05:00')
    expect(args.fechaHoraFin).toBe('2026-06-16T08:20:00-05:00')
  })

  it('agendar_cita ok -> success true', async () => {
    bookVarixAppointmentMock.mockResolvedValueOnce({ ok: true, appointmentId: 'a1', patientId: 'p1' })
    const input = setupConfirming()
    const out = await processMessage(input)
    expect(out.success).toBe(true)
  })

  it('agendar_cita slot_taken -> re-consulta availability', async () => {
    bookVarixAppointmentMock.mockResolvedValueOnce({ ok: false, reason: 'slot_taken' })
    getVarixAvailabilityMock.mockResolvedValueOnce({ manana: ['9:00 AM - 9:20 AM'], tarde: [] })
    const input = setupConfirming()
    const out = await processMessage(input)

    expect(bookVarixAppointmentMock).toHaveBeenCalled()
    // Tras slot_taken se re-consulta availability para mostrar nuevos slots
    expect(getVarixAvailabilityMock).toHaveBeenCalled()
    expect(out.success).toBe(true)
  })

  it('agendar_cita error -> fail-open (success true, no crash)', async () => {
    bookVarixAppointmentMock.mockResolvedValueOnce({ ok: false, reason: 'error', detail: 'boom' })
    const input = setupConfirming()
    const out = await processMessage(input)
    expect(out.success).toBe(true)
  })

  it('booking throw -> fail-open (success true)', async () => {
    bookVarixAppointmentMock.mockRejectedValueOnce(new Error('db down'))
    const input = setupConfirming()
    const out = await processMessage(input)
    expect(out.success).toBe(true)
  })
})

// ============================================================================
// Anti-Pitfall 1
// ============================================================================

describe('processMessage — anti-Pitfall 1', () => {
  it('lookup de templates usa agent_id="varixcenter"', async () => {
    comprehendMock.mockResolvedValue({
      analysis: buildAnalysis({
        intent: { primary: 'saludo', secondary: 'ninguno', confidence: 95, reasoning: 't' },
      }),
      tokensUsed: 10,
    })
    let agentIdSeen: string | undefined
    getTemplatesForIntentsMock.mockImplementation(async (agentId: string) => {
      agentIdSeen = agentId
      return new Map()
    })

    await processMessage(buildInput({ message: 'hola' }))

    expect(agentIdSeen).toBe('varixcenter')
    expect(agentIdSeen).not.toBe('godentist')
  })
})
