/**
 * Tests for varixcenter/response-track.ts template selection logic.
 *
 * Standalone agent-varixcenter — Plan 06 Wave 3 Task 1 (TDD RED).
 *
 * CRITICAL — Anti-Pitfall 1 (regresion cdc06d9 revertida en somnio-recompra).
 * El agente DEBE invocar `getTemplatesForIntents` con agent_id='varixcenter'
 * (NUNCA 'godentist'). Si esa constante se filtra por clonado, el agente lee
 * templates del catalogo godentist. Este test atrapa la regresion en CI.
 *
 * Cubre:
 *   - Anti-Pitfall 1 (positive + negative assertions)
 *   - English short-circuit (idioma=en -> english_response template)
 *   - Triage por tipo_venas (null -> triage; vasitos/grandes/ambas -> info_*)
 *   - es_foraneo -> fuera_de_ciudad como COMP (D-15)
 *   - pedir_datos_parcial extraContext con campos_faltantes (sin sede)
 *   - Sales action -> templates mapping
 *
 * Mock pattern clonado de godentist-fb-ig/__tests__/response-track.test.ts
 * (vi.hoisted + vi.mock para TemplateManager).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted para que las mock functions sean visibles a vi.mock factories
const {
  getTemplatesForIntentsMock,
  processTemplatesMock,
} = vi.hoisted(() => ({
  getTemplatesForIntentsMock: vi.fn(),
  processTemplatesMock: vi.fn(),
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
    getCollector: () => ({ recordEvent: vi.fn(), setRespondingAgentId: vi.fn() }),
  }
})

// Mock composeBlock para shortcut sin afectar este test
vi.mock('@/lib/agents/somnio/block-composer', () => ({
  composeBlock: (byIntent: Map<string, unknown[]>) => {
    const block: unknown[] = []
    for (const [, templates] of byIntent) {
      block.push(...templates)
    }
    return { block }
  },
}))

// Imports AFTER mocks
import { resolveResponseTrack } from '../response-track'
import { createInitialState } from '../state'
import type { AgentState } from '../types'

// ============================================================================
// Fixtures
// ============================================================================

type StateOverrides = Omit<Partial<AgentState>, 'datos'> & {
  datos?: Partial<AgentState['datos']>
}

function makeState(overrides: StateOverrides = {}): AgentState {
  const base = createInitialState()
  const { datos, ...rest } = overrides
  return {
    ...base,
    ...rest,
    datos: { ...base.datos, ...(datos ?? {}) },
  }
}

function fakeTemplate(content: string, intent: string, opts: { id?: string; orden?: number; priority?: 'CORE' | 'COMPLEMENTARIA' | 'OPCIONAL' } = {}) {
  return {
    id: opts.id ?? `tpl-${intent}-1`,
    content,
    contentType: 'texto' as const,
    delaySeconds: 0,
    orden: opts.orden ?? 0,
    priority: opts.priority ?? ('CORE' as const),
  }
}

beforeEach(() => {
  getTemplatesForIntentsMock.mockReset()
  processTemplatesMock.mockReset()
  // Default: empty selection
  getTemplatesForIntentsMock.mockResolvedValue(new Map())
  processTemplatesMock.mockResolvedValue([])
})

// ============================================================================
// CRITICAL — Anti-Pitfall 1 (cdc06d9)
// ============================================================================

describe('resolveResponseTrack — Anti-Pitfall 1 TEMPLATE_LOOKUP_AGENT_ID', () => {
  it('calls getTemplatesForIntents with agent_id="varixcenter" (NOT "godentist")', async () => {
    const state = makeState({ turnCount: 1 })
    await resolveResponseTrack({
      salesAction: 'pedir_datos',
      state,
      intent: 'quiero_agendar',
      workspaceId: 'test-workspace-uuid',
    })

    expect(getTemplatesForIntentsMock).toHaveBeenCalled()
    const callArgs = getTemplatesForIntentsMock.mock.calls[0]
    expect(callArgs[0]).toBe('varixcenter')
    expect(callArgs[0]).not.toBe('godentist')
  })

  it('NEVER calls getTemplatesForIntents with agent_id="godentist"', async () => {
    const state = makeState({ turnCount: 1, datos: { nombre: 'Juan' } })
    await resolveResponseTrack({
      salesAction: 'pedir_datos_parcial',
      state,
      intent: 'datos',
      workspaceId: 'test-workspace-uuid',
    })

    const allCalls = getTemplatesForIntentsMock.mock.calls
    expect(allCalls.length).toBeGreaterThan(0)
    for (const call of allCalls) {
      expect(call[0]).not.toBe('godentist')
      expect(call[0]).toBe('varixcenter')
    }
  })

  it('English short-circuit uses agent_id="varixcenter" + english_response', async () => {
    const state = makeState({ turnCount: 1 })
    await resolveResponseTrack({
      state,
      workspaceId: 'test-workspace-uuid',
      idioma: 'en',
    })

    expect(getTemplatesForIntentsMock).toHaveBeenCalled()
    const callArgs = getTemplatesForIntentsMock.mock.calls[0]
    expect(callArgs[0]).toBe('varixcenter')
    expect(callArgs[0]).not.toBe('godentist')
    expect(callArgs[1]).toEqual(['english_response'])
  })
})

// ============================================================================
// Triage por tipo_venas (diseño §9)
// ============================================================================

describe('resolveResponseTrack — triage por tipo_venas', () => {
  it('precio_tratamiento sin tipo_venas -> precio_valoracion (triage eliminado, distill 2026-06-13)', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'] })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'precio_tratamiento',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('precio_valoracion')
    expect(capturedIntents).not.toContain('triage')
  })

  it('precio_tratamiento + tipo_venas=vasitos -> info_vasitos', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'], datos: { tipo_venas: 'vasitos' } })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'precio_tratamiento',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('info_vasitos')
    expect(capturedIntents).not.toContain('triage')
  })

  it('info_tratamiento + tipo_venas=grandes -> info_grandes', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'], datos: { tipo_venas: 'grandes' } })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'info_tratamiento',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('info_grandes')
  })

  it('precio_tratamiento + tipo_venas=ambas -> info_ambas', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'], datos: { tipo_venas: 'ambas' } })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'precio_tratamiento',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('info_ambas')
  })
})

// ============================================================================
// es_foraneo -> fuera_de_ciudad COMP (D-15)
// ============================================================================

describe('resolveResponseTrack — es_foraneo fuera_de_ciudad', () => {
  it('ciudad foranea (Cucuta) -> fuera_de_ciudad agregado', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'], datos: { ciudad: 'Cucuta', tipo_venas: 'vasitos' } })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'precio_tratamiento',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('fuera_de_ciudad')
  })

  it('ciudad del area metro (Bucaramanga) -> NO fuera_de_ciudad', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'], datos: { ciudad: 'Bucaramanga', tipo_venas: 'vasitos' } })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'precio_tratamiento',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).not.toContain('fuera_de_ciudad')
  })
})

// ============================================================================
// pedir_datos_parcial extraContext (sin sede)
// ============================================================================

describe('resolveResponseTrack — pedir_datos_parcial extraContext', () => {
  it('builds campos_faltantes from camposFaltantes(state), sin mencion de sede', async () => {
    const state = makeState({ turnCount: 1, datos: { nombre: 'Juan' } })

    getTemplatesForIntentsMock.mockResolvedValueOnce(
      new Map([
        ['pedir_datos_parcial', {
          templates: [{ id: 'tpl-pdp-1', content: '{{campos_faltantes}}', priority: 'CORE', orden: 0, content_type: 'texto', delay_s: 0 }],
          visitType: 'primera_vez',
          alreadySent: [],
          isRepeatedVisit: false,
        }],
      ]),
    )
    processTemplatesMock.mockImplementation(async (_templates: unknown[], context: Record<string, string>) => {
      return [fakeTemplate(context.campos_faltantes ?? '', 'pedir_datos_parcial')]
    })

    await resolveResponseTrack({
      salesAction: 'pedir_datos_parcial',
      state,
      intent: 'datos',
      workspaceId: 'test-workspace-uuid',
    })

    const callsWithFaltantes = processTemplatesMock.mock.calls.filter(
      (c) => (c[1] as Record<string, string>)?.campos_faltantes !== undefined,
    )
    expect(callsWithFaltantes.length).toBeGreaterThan(0)
    const ctx = callsWithFaltantes[0][1] as Record<string, string>
    expect(ctx.campos_faltantes).toMatch(/cédula|telefono|teléfono/i)
    expect(ctx.campos_faltantes).not.toMatch(/[Ss]ede/)
  })
})

// ============================================================================
// Sales action -> templates mapping smoke
// ============================================================================

describe('resolveResponseTrack — sales action mapping', () => {
  it('salesAction=pedir_fecha -> includes pedir_fecha intent', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'] })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'pedir_fecha',
      state,
      intent: 'datos',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('pedir_fecha')
  })

  it('salesAction=mostrar_confirmacion -> includes confirmar_cita intent', async () => {
    const state = makeState({
      turnCount: 4,
      intentsVistos: ['saludo'],
      datos: { nombre: 'Juan', telefono: '573001234567', cedula: '109', fecha_preferida: '2026-06-15' },
    })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'mostrar_confirmacion',
      state,
      intent: 'seleccion_horario',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('confirmar_cita')
  })

  it('salesAction=mostrar_disponibilidad with slots -> mostrar_disponibilidad + slots context', async () => {
    const state = makeState({
      turnCount: 3,
      intentsVistos: ['saludo'],
      datos: { nombre: 'Juan', telefono: '573001234567', cedula: '109', fecha_preferida: '2026-06-15' },
    })
    let capturedIntents: string[] | undefined
    let capturedCtx: Record<string, string> | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      const map = new Map()
      map.set('mostrar_disponibilidad', { templates: [fakeTemplate('{{slots_manana}} / {{slots_tarde}}', 'mostrar_disponibilidad')] })
      return map
    })
    processTemplatesMock.mockImplementation(async (_t: unknown, vars: Record<string, string>) => {
      capturedCtx = vars
      return []
    })

    await resolveResponseTrack({
      salesAction: 'mostrar_disponibilidad',
      state,
      intent: 'datos',
      workspaceId: 'test-workspace-uuid',
      availabilitySlots: { manana: ['8:00 AM - 8:20 AM'], tarde: ['2:30 PM - 2:50 PM'] },
    })

    expect(capturedIntents).toContain('mostrar_disponibilidad')
    expect(capturedCtx?.slots_manana).toContain('8:00 AM')
    expect(capturedCtx?.slots_tarde).toContain('2:30 PM')
  })

  it('salesAction=agendar_cita -> includes cita_agendada intent', async () => {
    const state = makeState({
      turnCount: 5,
      intentsVistos: ['saludo'],
      datos: { nombre: 'Juan', telefono: '573001234567', cedula: '109', fecha_preferida: '2026-06-15', horario_seleccionado: '8:00 AM' },
    })
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'agendar_cita',
      state,
      intent: 'confirmar',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('cita_agendada')
  })
})
