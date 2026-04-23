/**
 * Tests for response-track.ts — post somnio-recompra-template-catalog redesign.
 *
 * Covers:
 * - D-03: saludo produces 2 messages (texto CORE orden=0 + imagen COMPLEMENTARIA orden=1)
 * - D-05: saludo alone does NOT include promociones templates (no auto-promos)
 * - D-06: 'registro_sanitario' is in INFORMATIONAL_INTENTS
 * - D-12: resolveSalesActionTemplates('preguntar_direccion', state) includes state.datos.departamento
 *
 * Q#2 scope: only happy-path for preguntar_direccion. Branch !datosCriticos (campos_faltantes)
 * tested only to ensure no orphan ", " trailing commas — full branch coverage is tech debt.
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

// Import AFTER mocks
import { resolveResponseTrack, resolveSalesActionTemplates } from '../response-track'
import { INFORMATIONAL_INTENTS } from '../constants'
import { createPreloadedState } from '../state'

// ============================================================================
// Fixtures
// ============================================================================

function buildPreloadedStateFull() {
  return createPreloadedState({
    nombre: 'Jose',
    apellido: 'Romero',
    telefono: '+573001234567',
    direccion: 'Calle 48A #27-85',
    ciudad: 'Bucaramanga',
    departamento: 'Santander',
  })
}

function buildPreloadedStateSinDepartamento() {
  return createPreloadedState({
    nombre: 'Jose',
    apellido: 'Romero',
    telefono: '+573001234567',
    direccion: 'Calle 48A #27-85',
    ciudad: 'Bucaramanga',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================================
// D-06: INFORMATIONAL_INTENTS includes registro_sanitario
// ============================================================================

describe('INFORMATIONAL_INTENTS — D-06', () => {
  it('includes registro_sanitario', () => {
    expect(INFORMATIONAL_INTENTS.has('registro_sanitario')).toBe(true)
  })

  it('still includes all original intents', () => {
    for (const intent of ['saludo', 'precio', 'promociones', 'pago', 'envio', 'ubicacion', 'contraindicaciones', 'dependencia', 'tiempo_entrega']) {
      expect(INFORMATIONAL_INTENTS.has(intent)).toBe(true)
    }
  })
})

// ============================================================================
// D-12: resolveSalesActionTemplates preguntar_direccion includes departamento
// ============================================================================

describe('resolveSalesActionTemplates — D-12 direccion_completa includes departamento', () => {
  it('concatenates direccion + ciudad + departamento in that order (happy path)', async () => {
    const state = buildPreloadedStateFull()

    const result = await resolveSalesActionTemplates('preguntar_direccion', state)

    expect(result.intents).toEqual(['preguntar_direccion_recompra'])
    expect(result.extraContext?.direccion_completa).toBe('Calle 48A #27-85, Bucaramanga, Santander')
  })

  it('drops null departamento via filter(Boolean) — no orphan trailing comma', async () => {
    const state = buildPreloadedStateSinDepartamento()
    expect(state.datos.departamento).toBeNull()

    const result = await resolveSalesActionTemplates('preguntar_direccion', state)

    // Either happy-path short-circuit (direccion && ciudad) with direccion_completa,
    // or !datosCriticos branch with campos_faltantes. Both must avoid orphan ", ," or trailing comma.
    const dc = result.extraContext?.direccion_completa ?? ''
    expect(dc).not.toMatch(/, ,/)
    expect(dc).not.toMatch(/, $/)
  })

  it('provides nombre_saludo in extraContext (regression)', async () => {
    const state = buildPreloadedStateFull()

    const result = await resolveSalesActionTemplates('preguntar_direccion', state)

    expect(result.extraContext?.nombre_saludo).toBeDefined()
    expect(result.extraContext!.nombre_saludo).toMatch(/Jose/)
  })
})

// ============================================================================
// D-03 + D-05: saludo produces 2 messages (texto + imagen) without promociones
// ============================================================================

describe('resolveResponseTrack — D-03 saludo emits texto + imagen, D-05 no auto-promos', () => {
  it('turn-0 intent=saludo (no salesAction) produces 2 messages (texto CORE + imagen COMPLEMENTARIA) and no promociones', async () => {
    const state = buildPreloadedStateFull()

    // Arrange: TemplateManager returns 2 rows for 'saludo'
    const saludoTemplates = [
      {
        id: 'tpl-saludo-texto',
        content: '{{nombre_saludo}} 😊',
        content_type: 'texto',
        priority: 'CORE',
        orden: 0,
        delay_s: 0,
      },
      {
        id: 'tpl-saludo-imagen',
        content: 'https://example.com/elixir.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?',
        content_type: 'imagen',
        priority: 'COMPLEMENTARIA',
        orden: 1,
        delay_s: 3,
      },
    ]

    getTemplatesForIntentsMock.mockResolvedValueOnce(new Map([
      ['saludo', {
        templates: saludoTemplates,
        visitType: 'primera_vez',
        alreadySent: [],
        isRepeatedVisit: false,
      }],
    ]))

    processTemplatesMock.mockResolvedValueOnce([
      { id: 'tpl-saludo-texto', content: 'Buenos dias Jose 😊', contentType: 'texto', priority: 'CORE', orden: 0, delaySeconds: 0 },
      { id: 'tpl-saludo-imagen', content: 'https://example.com/elixir.jpg|Deseas adquirir tu ELIXIR DEL SUEÑO?', contentType: 'imagen', priority: 'COMPLEMENTARIA', orden: 1, delaySeconds: 3 },
    ])

    // Act: no salesAction (resolveTransition returned null per D-05)
    const result = await resolveResponseTrack({
      intent: 'saludo',
      state,
      workspaceId: 'test-ws',
    })

    // Assert: 2 messages — texto + imagen
    expect(result.messages).toHaveLength(2)

    const textoMsg = result.messages.find(m => m.contentType === 'texto')
    const imagenMsg = result.messages.find(m => m.contentType === 'imagen')

    expect(textoMsg).toBeDefined()
    expect(textoMsg!.content).toContain('Jose')

    expect(imagenMsg).toBeDefined()
    expect(imagenMsg!.content).toContain('ELIXIR DEL SUEÑO')

    // D-05: no promociones templates requested
    expect(result.infoTemplateIntents).toEqual(['saludo'])
    expect(result.salesTemplateIntents).toEqual([])
    expect(result.infoTemplateIntents).not.toContain('promociones')
  })
})
