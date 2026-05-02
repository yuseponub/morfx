/**
 * Tests for executeInvocations — W-04 fix coverage.
 *
 * Standalone: somnio-sales-v4 / Plan 07 Task 7.
 *
 * Verifica que las 4 mutations no-createOrder se disparan inline desde happy path:
 *  - updateOrder (come-back) cuando shipping fields cambian
 *  - moveOrderToStage (come-back) cuando salesAccion='cancelar'
 *  - updateContact (execute fire-and-forget) cuando email cambia + activeContactId presente
 *  - addOrderNote (execute fire-and-forget) cuando extra.handoffReason o mutationFailedNote
 *  - CAS reject detection en moveOrderToStage → outcome.cancelarFailed.cas === true
 *  - Defensive guard: sin activeOrderId → ningún update / move / note se llama
 *
 * Mock pattern: vi.hoisted() para evitar TDZ con vi.mock factory hoisting (Plan 05 lesson).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mocks } = vi.hoisted(() => {
  const updateOrderMock = vi.fn()
  const moveOrderToStageMock = vi.fn()
  const updateContactMock = vi.fn()
  const addOrderNoteMock = vi.fn()
  const createCrmMutationToolsMock = vi.fn(() => ({
    updateOrder: { execute: updateOrderMock },
    moveOrderToStage: { execute: moveOrderToStageMock },
    updateContact: { execute: updateContactMock },
    addOrderNote: { execute: addOrderNoteMock },
    createOrder: { execute: vi.fn() },
    archiveOrder: { execute: vi.fn() },
    closeOrder: { execute: vi.fn() },
    createContact: { execute: vi.fn() },
    archiveContact: { execute: vi.fn() },
    addContactNote: { execute: vi.fn() },
    archiveContactNote: { execute: vi.fn() },
    archiveOrderNote: { execute: vi.fn() },
    createTask: { execute: vi.fn() },
    updateTask: { execute: vi.fn() },
    completeTask: { execute: vi.fn() },
  }))
  return {
    mocks: {
      updateOrderMock,
      moveOrderToStageMock,
      updateContactMock,
      addOrderNoteMock,
      createCrmMutationToolsMock,
    },
  }
})

vi.mock('@/lib/agents/shared/crm-mutation-tools', () => ({
  createCrmMutationTools: mocks.createCrmMutationToolsMock,
}))

// Observability collector mock — NO-OP que no rompe los assertions.
vi.mock('@/lib/observability', () => ({
  getCollector: () => null,
}))

// Import AFTER mocks (vi.mock se eleva al top, pero los imports ESM se resuelven después).
import { executeInvocations, type ExecuteInvocationsArgs } from '../invocations'
import { createInitialState } from '../state'
import type { StateChanges } from '../state'

const ORDER_ID = '11111111-1111-1111-1111-111111111111'
const CONTACT_ID = '22222222-2222-2222-2222-222222222222'
const STAGE_UUID = '33333333-3333-3333-3333-333333333333'
const SESSION_ID = 'session-abc'

function emptyChanges(overrides: Partial<StateChanges> = {}): StateChanges {
  return {
    newFields: [],
    filled: 0,
    hasNewData: false,
    ofiInterJustSet: false,
    mencionaInter: false,
    datosCriticosJustCompleted: false,
    datosCompletosJustCompleted: false,
    ...overrides,
  }
}

function buildArgs(overrides: Partial<ExecuteInvocationsArgs> = {}): ExecuteInvocationsArgs {
  const state = createInitialState()
  return {
    ctx: {
      workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490',
      sessionId: SESSION_ID,
      conversationId: SESSION_ID,
    },
    state,
    salesAccion: null,
    changes: emptyChanges(),
    contactPhone: null,
    activeContactId: null,
    activeOrderId: null,
    ...overrides,
  }
}

describe('executeInvocations — W-04 fix coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: tools devuelven 'executed' (happy path).
    mocks.updateOrderMock.mockResolvedValue({ status: 'executed', data: { id: ORDER_ID } })
    mocks.moveOrderToStageMock.mockResolvedValue({ status: 'executed', data: { id: ORDER_ID } })
    mocks.updateContactMock.mockResolvedValue({ status: 'executed', data: { id: CONTACT_ID } })
    mocks.addOrderNoteMock.mockResolvedValue({ status: 'executed', data: { noteId: 'n-1' } })
    // Reset env var entre tests
    process.env.SOMNIO_CANCELED_STAGE_UUID = STAGE_UUID
  })

  it('Test 1: shipping fields cambiados + activeOrderId → updateOrder.execute called once', async () => {
    const state = createInitialState()
    state.datos.direccion = 'Calle 123 #45'
    state.datos.ciudad = 'Bogota'
    state.datos.departamento = 'Cundinamarca'
    const changes = emptyChanges({
      newFields: ['direccion', 'ciudad', 'departamento'],
      filled: 3,
      hasNewData: true,
    })

    const result = await executeInvocations(
      buildArgs({ state, changes, activeOrderId: ORDER_ID }),
    )

    expect(mocks.updateOrderMock).toHaveBeenCalledTimes(1)
    expect(mocks.updateOrderMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      shippingAddress: 'Calle 123 #45',
      shippingCity: 'Bogota',
      shippingDepartment: 'Cundinamarca',
    })
    expect(result.updateOrderFailed).toBeUndefined()
  })

  it('Test 2: salesAccion="cancelar" + activeOrderId → moveOrderToStage.execute con CANCELED stage', async () => {
    const state = createInitialState()
    const result = await executeInvocations(
      buildArgs({ state, salesAccion: 'cancelar', activeOrderId: ORDER_ID }),
    )
    expect(mocks.moveOrderToStageMock).toHaveBeenCalledTimes(1)
    expect(mocks.moveOrderToStageMock).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      stageId: STAGE_UUID,
    })
    expect(result.cancelarFailed).toBeUndefined()
  })

  it('Test 3: email nuevo + activeContactId → updateContact.execute fire-and-forget', async () => {
    const state = createInitialState()
    state.datos.correo = 'cliente@example.com'
    const changes = emptyChanges({ newFields: ['correo'], filled: 1, hasNewData: true })

    await executeInvocations(
      buildArgs({
        state,
        changes,
        contactPhone: '+573001234567',
        activeContactId: CONTACT_ID,
      }),
    )

    // Fire-and-forget: void exec(...). Esperamos un microtask para que el catch
    // hookee si fallara, pero el call ocurre síncronamente (mock resolved value).
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.updateContactMock).toHaveBeenCalledTimes(1)
    expect(mocks.updateContactMock).toHaveBeenCalledWith({
      contactId: CONTACT_ID,
      email: 'cliente@example.com',
    })
  })

  it('Test 4: extra.handoffReason → addOrderNote.execute con [v4 handoff] prefix', async () => {
    const state = createInitialState()
    await executeInvocations(
      buildArgs({
        state,
        activeOrderId: ORDER_ID,
        extra: { handoffReason: 'subloop_no_match' },
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mocks.addOrderNoteMock).toHaveBeenCalledTimes(1)
    const callArgs = mocks.addOrderNoteMock.mock.calls[0][0] as {
      orderId: string
      body: string
      idempotencyKey: string
    }
    expect(callArgs.orderId).toBe(ORDER_ID)
    expect(callArgs.body).toMatch(/^\[v4 handoff\]/)
    expect(callArgs.idempotencyKey).toBe(`somnio-v4-addOrderNote-${SESSION_ID}-handoff`)
  })

  it('Test 5: moveOrderToStage retorna stage_changed_concurrently → outcome.cancelarFailed.cas === true', async () => {
    mocks.moveOrderToStageMock.mockResolvedValueOnce({
      status: 'stage_changed_concurrently',
      error: {
        code: 'stage_changed_concurrently',
        expectedStageId: STAGE_UUID,
        actualStageId: 'other-stage',
      },
    })

    const state = createInitialState()
    const result = await executeInvocations(
      buildArgs({ state, salesAccion: 'cancelar', activeOrderId: ORDER_ID }),
    )

    expect(result.cancelarFailed).toBeDefined()
    expect(result.cancelarFailed?.cas).toBe(true)
    expect(result.cancelarFailed?.code).toBe('stage_changed_concurrently')
  })

  it('Test 6: sin activeOrderId → ningún update*/move*/note se llama (defensive guard)', async () => {
    const state = createInitialState()
    state.datos.direccion = 'Calle 123'
    state.datos.ciudad = 'Bogota'
    const changes = emptyChanges({
      newFields: ['direccion', 'ciudad'],
      filled: 2,
      hasNewData: true,
    })

    await executeInvocations(
      buildArgs({
        state,
        changes,
        salesAccion: 'cancelar',
        activeOrderId: null, // ← sin order
        extra: { handoffReason: 'test' },
      }),
    )

    expect(mocks.updateOrderMock).not.toHaveBeenCalled()
    expect(mocks.moveOrderToStageMock).not.toHaveBeenCalled()
    expect(mocks.addOrderNoteMock).not.toHaveBeenCalled()
  })
})
