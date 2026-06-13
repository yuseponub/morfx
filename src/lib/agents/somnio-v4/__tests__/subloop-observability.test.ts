/**
 * Tests de observabilidad del RAG sub-loop
 * (standalone v4-observability-completeness, Plan 03 Task 2).
 *
 * Cubre los <behavior> del plan:
 *  - Test 1: tras tooling exitoso -> subloop_tooling_completed { topicSelected, kbHits[{topic,similarity}], finishReason, restart_iteration }.
 *  - Test 2: tras generation -> subloop_generation_completed { responseConfidence, threshold:0.70, restart_iteration }.
 *  - Test 3: cuando un paso tira -> emitRagError emite subloop_error { errorType, restart_iteration } ANTES de relanzar.
 *  - Test 4: con ctx.restartIteration=5 los 3 eventos llevan restart_iteration:5.
 *  - Test 5: los subloop_completed existentes siguen emitiendose (no regresion).
 *
 * Se mockean las CALLs tooling/generation/compliance + el checkpoint gate para
 * controlar el output sin tocar los LLMs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Spy del collector ─────────────────────────────────────────────────────────
const recordEvent = vi.fn()
vi.mock('@/lib/observability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/observability')>()
  return {
    ...actual,
    getCollector: () => ({ recordEvent }),
  }
})

// ── Mocks de las CALLs del sub-loop ─────────────────────────────────────────────
const runToolingCall = vi.fn()
vi.mock('../sub-loop/tooling-call', () => ({
  runToolingCall: (...a: unknown[]) => runToolingCall(...a),
}))

const runGenerationCall = vi.fn()
vi.mock('../sub-loop/generation-call', () => ({
  runGenerationCall: (...a: unknown[]) => runGenerationCall(...a),
}))

const checkCompliance = vi.fn()
vi.mock('../sub-loop/compliance-check', () => ({
  checkCompliance: (...a: unknown[]) => checkCompliance(...a),
}))

// runCheckpointGate -> 'proceed' (sin lock = no checkpoints) para no interrumpir.
vi.mock('../core/checkpoint-gate', () => ({
  runCheckpointGate: vi.fn().mockResolvedValue('proceed'),
}))

// Prompts: stubs livianos (no son el SUT).
vi.mock('../sub-loop/prompt', () => ({
  buildToolingPrompt: () => 'tooling-prompt',
  buildGenerationPrompt: () => 'generation-prompt',
}))

import { runSubLoop } from '../sub-loop'
import type { SubLoopContext } from '../sub-loop'

const BASE_CTX: SubLoopContext = {
  workspaceId: 'ws-1',
  conversationId: 'conv-1',
  sessionId: 'sess-1',
  userMessage: 'cómo se toma?',
  recentMessages: [],
  lockHandle: null,
  lockChannel: null,
  lockIdentifier: null,
}

// rawResult con un kb_search tool-result -> extractStepData deriva kbHits.
function rawWithKbHits() {
  return {
    finishReason: 'stop',
    steps: [
      {
        toolCalls: [{ toolName: 'kb_search', input: { query: 'como se toma' } }],
        toolResults: [
          {
            toolName: 'kb_search',
            input: { query: 'como se toma' },
            output: [
              {
                topic: 'como_se_toma',
                similarity: 0.91,
                canonicalResponse: null,
                hechosDelProducto: 'Se toma 1 cápsula antes de dormir.',
                posicionDelNegocio: null,
                nuncaDecirRules: [],
              },
            ],
          },
        ],
      },
    ],
  }
}

function toolingOk() {
  return {
    output: {
      should_handoff: false,
      topic_seleccionado: 'como_se_toma',
      material_del_topic: {
        hechos: 'Se toma 1 cápsula antes de dormir.',
        posicion: 'Recomendamos uso nocturno.',
        debe_contener_aplicables: [],
        nunca_decir: [],
        cuando_escalar: [],
      },
      handoff_reason: null,
    },
    rawResult: rawWithKbHits(),
    latencyMs: 120,
    attempts: 1,
    attemptLatencies: [120],
  }
}

function generationOk(confidence = 0.88) {
  return {
    output: {
      responseText: 'Se toma una cápsula antes de dormir.',
      responseConfidence: confidence,
      confidenceRationale: 'KB explícito.',
      binary: 'RESPONDE_BIEN',
    },
    rawResult: { finishReason: 'stop', steps: [] },
    latencyMs: 200,
  }
}

beforeEach(() => {
  recordEvent.mockClear()
  runToolingCall.mockReset()
  runGenerationCall.mockReset()
  checkCompliance.mockReset()
})

describe('runSubLoop RAG — observabilidad por paso (D-02/D-03)', () => {
  it('Test 1: tras tooling exitoso emite subloop_tooling_completed con kbHits[{topic,similarity}]', async () => {
    runToolingCall.mockResolvedValue(toolingOk())
    runGenerationCall.mockResolvedValue(generationOk())
    checkCompliance.mockResolvedValue({ ok: true, nuncaDecirViolation: null, escalationTrigger: null, raw: {}, latencyMs: 50 })

    await runSubLoop({ reason: 'low_confidence', ctx: BASE_CTX })

    const call = recordEvent.mock.calls.find((c) => c[1] === 'subloop_tooling_completed')
    expect(call).toBeDefined()
    expect(call?.[2]).toEqual(
      expect.objectContaining({
        topicSelected: 'como_se_toma',
        finishReason: 'stop',
        restart_iteration: 0,
      }),
    )
    expect(call?.[2].kbHits).toEqual([{ topic: 'como_se_toma', similarity: 0.91 }])
  })

  it('Test 2: tras generation emite subloop_generation_completed con responseConfidence + threshold 0.70', async () => {
    runToolingCall.mockResolvedValue(toolingOk())
    runGenerationCall.mockResolvedValue(generationOk(0.88))
    checkCompliance.mockResolvedValue({ ok: true, nuncaDecirViolation: null, escalationTrigger: null, raw: {}, latencyMs: 50 })

    await runSubLoop({ reason: 'low_confidence', ctx: BASE_CTX })

    const call = recordEvent.mock.calls.find((c) => c[1] === 'subloop_generation_completed')
    expect(call).toBeDefined()
    expect(call?.[2]).toEqual(
      expect.objectContaining({
        responseConfidence: 0.88,
        threshold: 0.7,
        restart_iteration: 0,
      }),
    )
  })

  it('Test 3: cuando tooling tira, emitRagError emite subloop_error con errorType ANTES de relanzar', async () => {
    runToolingCall.mockRejectedValue(new Error('boom tooling'))

    await expect(runSubLoop({ reason: 'low_confidence', ctx: BASE_CTX })).rejects.toThrow()

    const call = recordEvent.mock.calls.find((c) => c[1] === 'subloop_error')
    expect(call).toBeDefined()
    expect(call?.[2]).toEqual(
      expect.objectContaining({
        errorType: 'tooling_call_error',
        restart_iteration: 0,
      }),
    )
  })

  it('Test 4: con ctx.restartIteration=5 los 3 eventos llevan restart_iteration:5', async () => {
    const ctx5: SubLoopContext = { ...BASE_CTX, restartIteration: 5 }

    // success path -> tooling + generation completed.
    runToolingCall.mockResolvedValue(toolingOk())
    runGenerationCall.mockResolvedValue(generationOk())
    checkCompliance.mockResolvedValue({ ok: true, nuncaDecirViolation: null, escalationTrigger: null, raw: {}, latencyMs: 50 })

    await runSubLoop({ reason: 'low_confidence', ctx: ctx5 })

    const tooling = recordEvent.mock.calls.find((c) => c[1] === 'subloop_tooling_completed')
    const gen = recordEvent.mock.calls.find((c) => c[1] === 'subloop_generation_completed')
    expect(tooling?.[2].restart_iteration).toBe(5)
    expect(gen?.[2].restart_iteration).toBe(5)

    // error path -> subloop_error con la misma iteración.
    recordEvent.mockClear()
    runToolingCall.mockRejectedValue(new Error('boom'))
    await expect(runSubLoop({ reason: 'low_confidence', ctx: ctx5 })).rejects.toThrow()
    const err = recordEvent.mock.calls.find((c) => c[1] === 'subloop_error')
    expect(err?.[2].restart_iteration).toBe(5)
  })

  it('Test 5: los subloop_completed existentes siguen emitiendose (no regresion)', async () => {
    runToolingCall.mockResolvedValue(toolingOk())
    runGenerationCall.mockResolvedValue(generationOk())
    checkCompliance.mockResolvedValue({ ok: true, nuncaDecirViolation: null, escalationTrigger: null, raw: {}, latencyMs: 50 })

    await runSubLoop({ reason: 'low_confidence', ctx: BASE_CTX })

    const completed = recordEvent.mock.calls.find((c) => c[1] === 'subloop_completed')
    expect(completed).toBeDefined()
  })
})
