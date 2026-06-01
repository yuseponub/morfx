/**
 * engine-v4-vision.test.ts — Sandbox parity for the dedicated vision branch (Plan 04).
 *
 * Verifica que SomnioV4Engine.processMessage() (engine-v4.ts) PASA visionContext
 * hacia processMessage (somnio-v4-agent.ts) cuando la V4EngineInput lo incluye.
 * Esto es la prueba de PARIDAD sandbox ↔ producción (D-05 / INTERRUPTION-PARITY.md).
 *
 * Estrategia:
 *  - Mock processMessage del agente (controla el output).
 *  - Pasar visionContext en V4EngineInput.
 *  - Afirmar que processMessage fue llamado con visionContext correcto.
 *  - Afirmar que el output del engine incluye el responseText (camino feliz).
 *  - Caso sin visionContext → processMessage llamado sin visionContext.
 *
 * standalone v4-media-audio-image Plan 04.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { V4AgentInput, V4AgentOutput } from '../types'
import type { SandboxState } from '@/lib/sandbox/types'

// ---------------------------------------------------------------------------
// vi.mock hoisting block — ALL mocks must be declared before SUT import.
// ---------------------------------------------------------------------------

// Mock redis-client so interruption-system-v2 doesn't try to connect
vi.mock('@/lib/agents/interruption-system-v2/redis-client', async () => {
  const { createMockRedis } = await import(
    '@/lib/agents/interruption-system-v2/__tests__/_helpers/mock-redis'
  )
  const instance = createMockRedis()
  return {
    __mock: instance,
    redis: instance,
    getRedisClient: () => instance,
  }
})

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({
    recordEvent: vi.fn(),
    setRespondingAgentId: vi.fn(),
  }),
  runWithCollector: (_c: unknown, fn: () => unknown) => fn(),
  runWithPurpose: (_p: unknown, fn: () => unknown) => fn(),
}))

vi.mock('@/lib/audit/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('@/lib/agents/interruption-system-v2/checkpoints', () => ({
  checkpoint: vi.fn(async () => ({ proceed: true, lostLock: false, interrupted: false })),
}))

vi.mock('@/lib/agents/interruption-system-v2/pending', () => ({
  pushToPending: vi.fn(async () => {}),
  removeOwnEntry: vi.fn(async () => {}),
  readAndClearPending: vi.fn(async () => []),
  clearInterrupt: vi.fn(async () => {}),
}))

vi.mock('@/lib/agents/interruption-system-v2/observability', () => ({
  emitLockEvent: vi.fn(),
}))

// Track what processMessage was called with
const agentMockFn = vi.fn<[V4AgentInput], Promise<V4AgentOutput>>()
vi.mock('@/lib/agents/somnio-v4/somnio-v4-agent', () => ({
  processMessage: (input: V4AgentInput) => agentMockFn(input),
}))

// ---------------------------------------------------------------------------
// SUT import (post-mock)
// ---------------------------------------------------------------------------

import { SomnioV4Engine } from '../engine-v4'

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeSandboxState(): SandboxState {
  return {
    currentMode: 'nuevo',
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
  }
}

function makeAgentOutput(overrides: Partial<V4AgentOutput> = {}): V4AgentOutput {
  return {
    success: true,
    messages: ['El ELIXIR DEL SUEÑO contiene melatonina...'],
    templates: [
      {
        templateId: 'rag:product-contenido',
        content: 'El ELIXIR DEL SUEÑO contiene melatonina...',
        contentType: 'texto',
        delayMs: 0,
        priority: 'CORE',
      },
    ],
    intentsVistos: [],
    templatesEnviados: [],
    datosCapturados: {},
    packSeleccionado: null,
    accionesEjecutadas: [],
    turnLedgerDims: { atendido: [], crmActions: [] },
    totalTokens: 0,
    shouldCreateOrder: false,
    timerSignals: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('engine-v4 sandbox parity — visionContext threading (Plan 04)', () => {
  const engine = new SomnioV4Engine()

  beforeEach(() => {
    agentMockFn.mockReset()
  })

  it('P1: visionContext threaded to processMessage + responseText in engine output', async () => {
    agentMockFn.mockResolvedValue(makeAgentOutput())

    const result = await engine.processMessage({
      message: '',
      state: makeSandboxState(),
      history: [],
      turnNumber: 1,
      workspaceId: 'ws-test',
      visionContext: { descripcion: 'foto del frasco ELIXIR DEL SUEÑO', categoria: 'producto' },
    })

    // 1. Verify processMessage was called with visionContext
    expect(agentMockFn).toHaveBeenCalledOnce()
    const calledInput = agentMockFn.mock.calls[0][0]
    expect(calledInput.visionContext).toBeDefined()
    expect(calledInput.visionContext?.descripcion).toBe('foto del frasco ELIXIR DEL SUEÑO')
    expect(calledInput.visionContext?.categoria).toBe('producto')

    // 2. Engine output contains the responseText from the rag: branch
    expect(result.success).toBe(true)
    expect(result.messages).toContain('El ELIXIR DEL SUEÑO contiene melatonina...')
  })

  it('P2: visionContext absent → processMessage called without visionContext (regression guard)', async () => {
    agentMockFn.mockResolvedValue(
      makeAgentOutput({ messages: ['respuesta normal'], templates: [] }),
    )

    await engine.processMessage({
      message: 'cuanto cuesta',
      state: makeSandboxState(),
      history: [],
      turnNumber: 1,
      workspaceId: 'ws-test',
      // no visionContext
    })

    expect(agentMockFn).toHaveBeenCalledOnce()
    const calledInput = agentMockFn.mock.calls[0][0]
    expect(calledInput.visionContext).toBeUndefined()
  })
})
