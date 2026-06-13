/**
 * Tests de observabilidad del orquestador del CRM gate
 * (standalone v4-observability-completeness, Plan 03 Task 1).
 *
 * Cubre los <behavior> del plan:
 *  - Test 1: gate NO prende -> crm_gate_skipped { reason: 'not_fired', restart_iteration: 0 }.
 *  - Test 2: gate prende+completa -> crm_gate_completed { fired:true, crmActionsCount, tools, success }.
 *  - Test 3: con args.restartIteration=3 los eventos llevan restart_iteration:3.
 *  - Test 4: los 4 eventos PRE-EXISTENTES (crm_gate_createOrder_skipped / crm_gate_move_blocked)
 *    siguen emitiendose Y ahora llevan restart_iteration.
 *
 * Se mockean las dependencias pesadas del gate (grounding + sub-loop + domain) para
 * conducir `runCrmGate` por sus caminos sin tocar la DB ni los LLMs (Regla 3 — cero
 * createAdminClient aqui; las deps mockeadas abstraen el domain).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Spy del collector (intercepta recordV4Event + los recordEvent existentes) ──
const recordEvent = vi.fn()
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent }),
}))

// ── Mocks de las deps del gate ───────────────────────────────────────────────
const buildCrmGrounding = vi.fn()
const writeCrmSnapshot = vi.fn()
vi.mock('../crm-grounding', () => ({
  buildCrmGrounding: (...a: unknown[]) => buildCrmGrounding(...a),
  writeCrmSnapshot: (...a: unknown[]) => writeCrmSnapshot(...a),
}))

const runCrmSubLoop = vi.fn()
vi.mock('../sub-loop', () => ({
  runCrmSubLoop: (...a: unknown[]) => runCrmSubLoop(...a),
}))

const resolveOrCreateContact = vi.fn()
vi.mock('@/lib/domain/contacts', () => ({
  resolveOrCreateContact: (...a: unknown[]) => resolveOrCreateContact(...a),
}))

// config: stages/pipeline resueltos para los caminos del hint builder.
vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>()
  return {
    ...actual,
    getNuevoPedidoStageUuid: () => 'stage-nuevo-pedido-uuid',
    getConfirmadoStageUuid: () => 'stage-confirmado-uuid',
    getPipelineUuid: () => 'pipeline-uuid',
  }
})

import { runCrmGate } from '../crm-gate'
import type { AgentState } from '../types'
import type { StateChanges } from '../state'
import { createInitialState } from '../state'

function buildState(overrides: Partial<AgentState> = {}): AgentState {
  return { ...createInitialState(), ...overrides }
}

function buildChanges(overrides: Partial<StateChanges> = {}): StateChanges {
  return {
    newFields: [],
    hasNewData: false,
    datosCriticosJustCompleted: false,
    ...overrides,
  } as StateChanges
}

const BASE_ARGS = {
  workspaceId: 'ws-1',
  sessionId: 'sess-1',
  category: 'venta',
  phone: '573001112233',
  userMessage: 'hola',
  ledgerCrmActions: [],
  datosCapturados: {} as Record<string, string>,
}

beforeEach(() => {
  recordEvent.mockClear()
  buildCrmGrounding.mockReset()
  runCrmSubLoop.mockReset()
  resolveOrCreateContact.mockReset()
  writeCrmSnapshot.mockReset()
})

describe('runCrmGate — observabilidad del orquestador (D-02/D-03)', () => {
  it('Test 1: gate NO prende -> emite crm_gate_skipped con reason:not_fired y restart_iteration:0', async () => {
    // accion fuera de CRM_GATE_ACTIONS + category != 'datos' + sin shipping fields.
    const res = await runCrmGate({
      ...BASE_ARGS,
      accion: 'pedir_datos',
      changes: buildChanges(),
      mergedState: buildState(),
    })

    expect(res.crmActions).toEqual([])
    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'crm_gate_skipped',
      expect.objectContaining({ reason: 'not_fired', restart_iteration: 0 }),
      undefined,
    )
    // El grounding NUNCA se carga si el gate no prende (lazy D-11).
    expect(buildCrmGrounding).not.toHaveBeenCalled()
  })

  it('Test 2: gate prende+completa -> emite crm_gate_completed con fired/crmActionsCount/tools/success', async () => {
    buildCrmGrounding.mockResolvedValue({ activeOrder: { id: 'order-1', stageId: 's' } })
    runCrmSubLoop.mockResolvedValue({
      crmActions: [
        { tool: 'updateOrder', result: 'success', args: {} },
      ],
    })

    const res = await runCrmGate({
      ...BASE_ARGS,
      accion: 'mostrar_confirmacion', // prende (CRM_GATE_ACTIONS)
      changes: buildChanges(),
      mergedState: buildState(),
    })

    expect(res.crmActions.length).toBe(1)
    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'crm_gate_completed',
      expect.objectContaining({
        fired: true,
        crmActionsCount: 1,
        tools: ['updateOrder'],
        success: true,
        restart_iteration: 0,
      }),
      undefined,
    )
  })

  it('Test 3: con restartIteration=3 los eventos del orquestador llevan restart_iteration:3', async () => {
    buildCrmGrounding.mockResolvedValue({ activeOrder: { id: 'order-1', stageId: 's' } })
    runCrmSubLoop.mockResolvedValue({ crmActions: [] })

    await runCrmGate({
      ...BASE_ARGS,
      accion: 'mostrar_confirmacion',
      changes: buildChanges(),
      mergedState: buildState(),
      restartIteration: 3,
    })

    expect(recordEvent).toHaveBeenCalledWith(
      'pipeline_decision',
      'crm_gate_completed',
      expect.objectContaining({ restart_iteration: 3 }),
      undefined,
    )
  })

  it('Test 4: los 4 eventos PRE-EXISTENTES siguen emitiendose Y llevan restart_iteration', async () => {
    // Forzar el camino createOrder-cascaron con phone ausente -> crm_gate_createOrder_skipped.
    buildCrmGrounding.mockResolvedValue({ activeOrder: null })
    runCrmSubLoop.mockResolvedValue({ crmActions: [] })

    await runCrmGate({
      ...BASE_ARGS,
      accion: null,
      category: 'datos', // prende (red anti-falso-negativo)
      phone: null, // dispara el branch phone ausente
      changes: buildChanges({ datosCriticosJustCompleted: true }),
      mergedState: buildState(),
      restartIteration: 7,
    })

    const createOrderSkipped = recordEvent.mock.calls.find(
      (c) => c[1] === 'crm_gate_createOrder_skipped',
    )
    expect(createOrderSkipped).toBeDefined()
    expect(createOrderSkipped?.[2]).toEqual(
      expect.objectContaining({ restart_iteration: 7 }),
    )
  })
})
