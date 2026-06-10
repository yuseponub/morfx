/**
 * Tests para la regla "miércoles sin mañana" en el branch fallback de
 * response-track.ts (Punto B) — agente godentist / WhatsApp.
 * Standalone godentist-block-wednesday-morning — Plan 01.
 *
 * Primera suite del agente WhatsApp (godentist no tenía __tests__ previo).
 * Harness de mocks clonado de godentist-fb-ig/__tests__/response-track.test.ts
 * (vi.hoisted + vi.mock de TemplateManager + observability + block-composer).
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
  getTemplatesForIntentsMock.mockResolvedValue(new Map())
  processTemplatesMock.mockResolvedValue([])
})

describe('resolveResponseTrack (godentist) — bloqueo miércoles mañana (Punto B fallback)', () => {
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
