/**
 * Tests for godentist-fb-ig/response-track.ts template selection logic.
 *
 * Standalone agent-godentist-fb-ig — Plan 06 Wave 4 Task 3.
 *
 * CRITICAL — Anti-regression D-08 (Pitfall 1, regresion cdc06d9 revertida en
 * somnio-recompra). El sibling DEBE invocar `getTemplatesForIntents` con
 * agent_id='godentist-fb-ig' (NUNCA 'godentist'). Si esa constante se filtra
 * por refactor, el sibling lee templates del catalogo godentist y el saludo
 * D-05 lead-capture nunca renderiza. Este test atrapa la regresion en CI
 * antes de merge.
 *
 * Cubre:
 *   - D-08 anti-regresion (positive + negative assertions)
 *   - English short-circuit (idioma=en -> english_response template)
 *   - pedir_datos_parcial extraContext con campos_faltantes
 *   - First turn auto-saludo injection (turnCount === 0)
 *   - Empty selection fallback (no matching intents)
 *   - Sales action -> templates mapping (pedir_datos, pedir_fecha,
 *     mostrar_disponibilidad, mostrar_confirmacion, etc.)
 *
 * Mock pattern clonado de somnio-pw-confirmation/__tests__/response-track.test.ts
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
// CRITICAL — Anti-regression D-08 (Pitfall 1)
// ============================================================================

describe('resolveResponseTrack — Anti-regression D-08 TEMPLATE_LOOKUP_AGENT_ID', () => {
  it('calls TemplateManager.getTemplatesForIntents with agent_id="godentist-fb-ig" (NOT "godentist")', async () => {
    const state = makeState({ turnCount: 1 })
    await resolveResponseTrack({
      salesAction: 'pedir_datos',
      state,
      intent: 'quiero_agendar',
      workspaceId: 'test-workspace-uuid',
    })

    expect(getTemplatesForIntentsMock).toHaveBeenCalled()
    const callArgs = getTemplatesForIntentsMock.mock.calls[0]
    // Anti-regresion D-08 hard assert (positive)
    expect(callArgs[0]).toBe('godentist-fb-ig')
    // Anti-regresion D-08 hard assert (negative — Pitfall 1)
    expect(callArgs[0]).not.toBe('godentist')
  })

  it('NEVER calls getTemplatesForIntents with agent_id="godentist" (sibling MUST use own catalog)', async () => {
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
      expect(call[0]).toBe('godentist-fb-ig')
    }
  })

  it('English short-circuit also uses agent_id="godentist-fb-ig" (loadSingleTemplate path)', async () => {
    const state = makeState({ turnCount: 1 })
    await resolveResponseTrack({
      state,
      workspaceId: 'test-workspace-uuid',
      idioma: 'en',
    })

    expect(getTemplatesForIntentsMock).toHaveBeenCalled()
    const callArgs = getTemplatesForIntentsMock.mock.calls[0]
    expect(callArgs[0]).toBe('godentist-fb-ig')
    expect(callArgs[0]).not.toBe('godentist')
    // Single template lookup for english_response
    expect(callArgs[1]).toEqual(['english_response'])
  })
})

// ============================================================================
// pedir_datos_parcial extraContext — campos_faltantes calculado
// ============================================================================

describe('resolveResponseTrack — pedir_datos_parcial extraContext', () => {
  it('builds campos_faltantes from camposFaltantes(state) when datos parciales (only nombre)', async () => {
    const state = makeState({
      turnCount: 1,
      datos: { nombre: 'Juan' },  // missing telefono + sede + cedula
    })

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

    expect(processTemplatesMock).toHaveBeenCalled()
    // Buscar la llamada que contiene campos_faltantes en el context
    const callsWithFaltantes = processTemplatesMock.mock.calls.filter(
      (c) => (c[1] as Record<string, string>)?.campos_faltantes !== undefined,
    )
    expect(callsWithFaltantes.length).toBeGreaterThan(0)
    const ctx = callsWithFaltantes[0][1] as Record<string, string>
    // Should include labels for missing fields (Celular = telefono label, sede mention)
    expect(ctx.campos_faltantes).toMatch(/Celular|Telefono/i)
    expect(ctx.campos_faltantes).toMatch(/[Ss]ede/)
  })
})

// ============================================================================
// First-turn auto-saludo injection (turnCount === 0)
// ============================================================================

describe('resolveResponseTrack — first-turn saludo injection', () => {
  it('turnCount=0 + intent=quiero_agendar -> saludo gets prepended in info intents', async () => {
    const state = makeState({ turnCount: 0 })

    // Set up a captured-args inspector
    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'pedir_datos',
      state,
      intent: 'quiero_agendar',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toBeDefined()
    // pedir_datos (sales) + saludo (auto-injected) since turnCount<=1 and not greeted yet.
    expect(capturedIntents).toContain('saludo')
    expect(capturedIntents).toContain('pedir_datos')
  })

  it('turnCount=2 + intent=quiero_agendar -> NO saludo injection', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'] })

    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'pedir_datos',
      state,
      intent: 'quiero_agendar',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toBeDefined()
    expect(capturedIntents).not.toContain('saludo')
  })
})

// ============================================================================
// Empty selection -> emptyResult
// ============================================================================

describe('resolveResponseTrack — empty selection fallback', () => {
  it('no salesAction + non-informational intent + turnCount > 1 -> empty result', async () => {
    const state = makeState({ turnCount: 3, intentsVistos: ['saludo'] })
    const result = await resolveResponseTrack({
      state,
      intent: 'datos',  // 'datos' is NOT in INFORMATIONAL_INTENTS
      workspaceId: 'test-workspace-uuid',
    })

    expect(result.messages).toEqual([])
    expect(result.templateIdsSent).toEqual([])
    expect(result.salesTemplateIntents).toEqual([])
    expect(result.infoTemplateIntents).toEqual([])
  })
})

// ============================================================================
// Informational intents (precio_servicio with servicioDetectado mapping)
// ============================================================================

describe('resolveResponseTrack — informational intents', () => {
  it('intent=precio_servicio + servicioDetectado=brackets_zafiro -> requests precio_brackets_zafiro template', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'] })

    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'precio_servicio',
      workspaceId: 'test-workspace-uuid',
      servicioDetectado: 'brackets_zafiro',
    })

    expect(capturedIntents).toContain('precio_brackets_zafiro')
  })

  it('intent=ubicacion (informational direct mapping)', async () => {
    const state = makeState({ turnCount: 2, intentsVistos: ['saludo'] })

    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      state,
      intent: 'ubicacion',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('ubicacion')
  })
})

// ============================================================================
// Sales action -> templates mapping smoke
// ============================================================================

describe('resolveResponseTrack — sales action mapping', () => {
  it('salesAction=pedir_fecha -> includes pedir_fecha intent in lookup', async () => {
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

  it('salesAction=mostrar_confirmacion -> includes confirmar_cita intent (mapped via switch)', async () => {
    const state = makeState({
      turnCount: 4,
      intentsVistos: ['saludo'],
      datos: {
        nombre: 'Juan',
        telefono: '573001234567',
        sede_preferida: 'cabecera',
        fecha_preferida: '2026-05-10',
      },
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

  it('salesAction=invitar_agendar -> includes invitar_agendar intent', async () => {
    const state = makeState({ turnCount: 3, intentsVistos: ['saludo'] })

    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'invitar_agendar',
      state,
      intent: 'precio_servicio',
      workspaceId: 'test-workspace-uuid',
    })

    expect(capturedIntents).toContain('invitar_agendar')
  })

  it('salesAction=mostrar_disponibilidad with availabilityFallback=true -> uses general schedules', async () => {
    const state = makeState({
      turnCount: 3,
      intentsVistos: ['saludo'],
      datos: {
        nombre: 'Juan',
        telefono: '573001234567',
        sede_preferida: 'cabecera',
        fecha_preferida: '2026-05-10',
      },
    })

    let capturedIntents: string[] | undefined
    getTemplatesForIntentsMock.mockImplementation(async (_agentId: string, intents: string[]) => {
      capturedIntents = intents
      return new Map()
    })

    await resolveResponseTrack({
      salesAction: 'mostrar_disponibilidad',
      state,
      intent: 'datos',
      workspaceId: 'test-workspace-uuid',
      availabilityFallback: true,
    })

    expect(capturedIntents).toContain('mostrar_disponibilidad')
  })
})

// ============================================================================
// Punto B — bloqueo miércoles mañana en branch fallback (Standalone
// godentist-block-wednesday-morning, Plan 01)
// ============================================================================

describe('resolveResponseTrack — bloqueo miércoles mañana (Punto B fallback)', () => {
  function setupCaptureManana(): { getManana: () => string | undefined } {
    let capturedManana: string | undefined
    getTemplatesForIntentsMock.mockImplementation(async () => {
      const map = new Map()
      map.set('mostrar_disponibilidad', {
        templates: [fakeTemplate('{{slots_manana}} / {{slots_tarde}}', 'mostrar_disponibilidad')],
      })
      return map
    })
    processTemplatesMock.mockImplementation(async (_t: unknown, vars: Record<string, string>) => {
      capturedManana = vars.slots_manana
      return []
    })
    return { getManana: () => capturedManana }
  }

  it('miércoles (2026-06-10) + fallback → slots_manana = "No hay disponibilidad"', async () => {
    const cap = setupCaptureManana()
    const state = makeState({
      turnCount: 3,
      intentsVistos: ['saludo'],
      datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera', fecha_preferida: '2026-06-10' },
    })
    await resolveResponseTrack({
      salesAction: 'mostrar_disponibilidad', state, intent: 'datos',
      workspaceId: 'test-workspace-uuid', availabilityFallback: true,
    })
    expect(cap.getManana()).toBe('No hay disponibilidad')
  })

  it('martes (2026-06-09) + fallback → slots_manana NO bloqueada (anti-regresión)', async () => {
    const cap = setupCaptureManana()
    const state = makeState({
      turnCount: 3,
      intentsVistos: ['saludo'],
      datos: { nombre: 'Juan', telefono: '573001234567', sede_preferida: 'cabecera', fecha_preferida: '2026-06-09' },
    })
    await resolveResponseTrack({
      salesAction: 'mostrar_disponibilidad', state, intent: 'datos',
      workspaceId: 'test-workspace-uuid', availabilityFallback: true,
    })
    expect(cap.getManana()).not.toBe('No hay disponibilidad')
  })
})
