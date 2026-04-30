/**
 * Unit tests for task mutation tools (Plan 04 / Wave 3).
 *
 * Mocks:
 *   - @/lib/domain/tasks (createTask, updateTask, completeTask, getTaskById)
 *   - @/lib/domain/crm-mutation-idempotency (getIdempotencyRow, insertIdempotencyRow)
 *   - @/lib/observability (getCollector → recordEvent spy)
 *
 * Coverage (3 tools × multiple paths):
 *   createTask:
 *     - Test 1: happy path (no idempotency) → executed + TaskSnapshot.
 *     - Test 2: idempotency replay → first executed, second duplicate via fresh getTaskById.
 *     - Test 3: exclusive arc violation (zod refine — both contactId AND orderId) → returns error/undefined from execute (zod parse fail before execute).
 *
 *   updateTask:
 *     - Test 4: happy path → executed + TaskSnapshot from updated.data.
 *     - Test 5: domain "Tarea no encontrada" → resource_not_found.
 *     - Test 6: validation_error from domain → validation_error.
 *
 *   completeTask:
 *     - Test 7: happy path → executed.
 *     - Test 8: domain "Tarea no encontrada" → resource_not_found.
 *     - Test 9: idempotent — already completed (domain returns success no-op) → executed.
 *
 * Two-step cast pattern (Pitfall 3 — AI SDK v6).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  createTaskDomainMock,
  updateTaskDomainMock,
  completeTaskDomainMock,
  getTaskByIdMock,
  getIdempotencyRowMock,
  insertIdempotencyRowMock,
  recordEventMock,
} = vi.hoisted(() => ({
  createTaskDomainMock: vi.fn(),
  updateTaskDomainMock: vi.fn(),
  completeTaskDomainMock: vi.fn(),
  getTaskByIdMock: vi.fn(),
  getIdempotencyRowMock: vi.fn(),
  insertIdempotencyRowMock: vi.fn(),
  recordEventMock: vi.fn(),
}))

vi.mock('@/lib/domain/tasks', () => ({
  createTask: createTaskDomainMock,
  updateTask: updateTaskDomainMock,
  completeTask: completeTaskDomainMock,
  getTaskById: getTaskByIdMock,
}))

// notes.ts factory needs these mocks since the index.ts spreads it; provide stubs.
vi.mock('@/lib/domain/notes', () => ({
  createNote: vi.fn(),
  createOrderNote: vi.fn(),
  archiveNote: vi.fn(),
  archiveOrderNote: vi.fn(),
  getContactNoteById: vi.fn(),
  getOrderNoteById: vi.fn(),
}))
vi.mock('@/lib/domain/contacts', () => ({
  createContact: vi.fn(),
  updateContact: vi.fn(),
  archiveContact: vi.fn(),
  getContactById: vi.fn(),
}))
vi.mock('@/lib/domain/orders', () => ({
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  moveOrderToStage: vi.fn(),
  archiveOrder: vi.fn(),
  closeOrder: vi.fn(),
  getOrderById: vi.fn(),
}))

vi.mock('@/lib/domain/crm-mutation-idempotency', () => ({
  getIdempotencyRow: getIdempotencyRowMock,
  insertIdempotencyRow: insertIdempotencyRowMock,
}))

vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: recordEventMock }),
}))

// Import AFTER mocks
import { createCrmMutationTools } from '../index'

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111'
const CTX = { workspaceId: WORKSPACE_ID, invoker: 'test-suite' } as const

const TASK_ID = '22222222-2222-2222-2222-222222222222'
const CONTACT_ID = '33333333-3333-3333-3333-333333333333'
const ORDER_ID = '44444444-4444-4444-4444-444444444444'

function buildTaskDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    taskId: id,
    workspaceId: WORKSPACE_ID,
    title: 'Llamar al cliente',
    description: null,
    status: 'pending',
    priority: 'medium',
    contactId: CONTACT_ID,
    orderId: null,
    conversationId: null,
    assignedTo: null,
    dueDate: null,
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => {
  createTaskDomainMock.mockReset()
  updateTaskDomainMock.mockReset()
  completeTaskDomainMock.mockReset()
  getTaskByIdMock.mockReset()
  getIdempotencyRowMock.mockReset()
  insertIdempotencyRowMock.mockReset()
  recordEventMock.mockReset()
})

// ============================================================================
// createTask
// ============================================================================

describe('createTask — happy path (no idempotency)', () => {
  it('Test 1: returns executed with TaskSnapshot when domain succeeds', async () => {
    createTaskDomainMock.mockResolvedValueOnce({
      success: true,
      data: { taskId: TASK_ID },
    })
    getTaskByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildTaskDetail(TASK_ID),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ title: 'Llamar al cliente', contactId: CONTACT_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: {
        taskId: TASK_ID,
        title: 'Llamar al cliente',
        contactId: CONTACT_ID,
        orderId: null,
        conversationId: null,
      },
    })

    expect(createTaskDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, source: 'tool-handler' }),
      expect.objectContaining({ title: 'Llamar al cliente', contactId: CONTACT_ID }),
    )
    expect(getIdempotencyRowMock).not.toHaveBeenCalled()
  })
})

describe('createTask — idempotency replay rehydrates via getTaskById (D-09 / Pitfall 6)', () => {
  it('Test 2: second call same key returns duplicate using fresh task data', async () => {
    // First call: lookup miss → execute → insert.
    getIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: null })
    createTaskDomainMock.mockResolvedValueOnce({
      success: true,
      data: { taskId: TASK_ID },
    })
    getTaskByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildTaskDetail(TASK_ID, { title: 'original title' }),
    })
    insertIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: { inserted: true },
    })

    // Second call: lookup hit → fresh rehydrate via getTaskById.
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: WORKSPACE_ID,
        toolName: 'createTask',
        key: 'idem-1',
        resultId: TASK_ID,
        resultPayload: buildTaskDetail(TASK_ID, { title: 'original title' }),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    // CRITICAL: rehydrate returns FRESH data, NOT input/cached payload.
    getTaskByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildTaskDetail(TASK_ID, { title: 'fresh-from-db title', status: 'in_progress' }),
    })

    const tools = createCrmMutationTools(CTX)
    const exec = (
      tools.createTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute

    const first = await exec({
      title: 'caller-input-title-DIFFERENT',
      contactId: CONTACT_ID,
      idempotencyKey: 'idem-1',
    })
    expect(first).toMatchObject({ status: 'executed', data: { taskId: TASK_ID } })

    const second = await exec({
      title: 'caller-input-title-IGNORED',
      contactId: CONTACT_ID,
      idempotencyKey: 'idem-1',
    })
    expect(second).toMatchObject({
      status: 'duplicate',
      data: { taskId: TASK_ID, title: 'fresh-from-db title', status: 'in_progress' },
    })

    expect(createTaskDomainMock).toHaveBeenCalledTimes(1)
    // Rehydrate via getTaskById, NOT cached payload.
    expect(getTaskByIdMock).toHaveBeenCalledTimes(2)
  })
})

describe('createTask — exclusive arc violation (zod refine — defense in depth at LLM boundary)', () => {
  it('Test 3a: zod inputSchema refine rejects when both contactId AND orderId are provided', async () => {
    // AI SDK v6 tool.execute does NOT auto-run zod parse — that happens at the
    // LLM tool-call boundary. We verify the refine directly on the schema.
    const tools = createCrmMutationTools(CTX)
    const schema = (tools.createTask as unknown as { inputSchema: import('zod').ZodTypeAny })
      .inputSchema

    const parsed = schema.safeParse({
      title: 'Bad task',
      contactId: CONTACT_ID,
      orderId: ORDER_ID, // exclusive arc violation
    })
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      // Refine error should mention exclusive arc / contactId/orderId/conversationId
      const messages = parsed.error.issues.map((i) => i.message).join(' ')
      expect(messages).toMatch(/at most one|contactId|orderId|conversationId/i)
    }
    // Domain not invoked — caller never reached execute on a parse-fail input.
    expect(createTaskDomainMock).not.toHaveBeenCalled()
  })

  it('Test 3b: domain layer also rejects exclusive arc violation (defense in depth)', async () => {
    // Even if zod is bypassed (e.g. caller bypasses parse), domain enforces
    // the same invariant — second layer of protection (T-04-02 mitigation).
    createTaskDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Una tarea solo puede estar vinculada a un contacto, pedido o conversacion',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({
      title: 'Bad task',
      contactId: CONTACT_ID,
      orderId: ORDER_ID,
    })

    // Domain rejected → tool surfaces as `error` (mapDomainError doesn't have a
    // specific category for this Spanish phrase; falls to 'error' fallback).
    expect((result as { status: string }).status).toBe('error')
    expect(createTaskDomainMock).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// updateTask
// ============================================================================

describe('updateTask — happy path', () => {
  it('Test 4: returns executed with TaskSnapshot when domain succeeds', async () => {
    updateTaskDomainMock.mockResolvedValueOnce({
      success: true,
      data: { taskId: TASK_ID },
    })
    // Tool re-hydrates via getTaskById per D-09 spirit.
    getTaskByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildTaskDetail(TASK_ID, { title: 'Updated title', status: 'in_progress' }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ taskId: TASK_ID, title: 'Updated title', status: 'in_progress' })

    expect(result).toMatchObject({
      status: 'executed',
      data: { taskId: TASK_ID, title: 'Updated title', status: 'in_progress' },
    })

    expect(updateTaskDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      expect.objectContaining({ taskId: TASK_ID, title: 'Updated title' }),
    )
  })
})

describe('updateTask — task_not_found from domain', () => {
  it('Test 5: domain "Tarea no encontrada" → resource_not_found task', async () => {
    updateTaskDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Tarea no encontrada',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ taskId: TASK_ID, title: 'New title' })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'task_not_found',
        missing: { resource: 'task', id: TASK_ID },
      },
    })

    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'resource_not_found' })
  })
})

describe('updateTask — validation_error from domain', () => {
  it('Test 6: domain "El titulo es requerido" → validation_error', async () => {
    updateTaskDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'El titulo es requerido',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.updateTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ taskId: TASK_ID, title: ' ' })

    expect(result).toMatchObject({
      status: 'validation_error',
      error: { code: 'validation_error', message: 'El titulo es requerido' },
    })
  })
})

// ============================================================================
// completeTask
// ============================================================================

describe('completeTask — happy path', () => {
  it('Test 7: returns executed when domain succeeds', async () => {
    const completedAt = '2026-04-29T12:00:00.000Z'
    completeTaskDomainMock.mockResolvedValueOnce({
      success: true,
      data: { taskId: TASK_ID },
    })
    getTaskByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildTaskDetail(TASK_ID, { status: 'completed', completedAt }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.completeTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ taskId: TASK_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { taskId: TASK_ID, status: 'completed', completedAt },
    })
    expect(completeTaskDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      { taskId: TASK_ID },
    )
  })
})

describe('completeTask — task_not_found from domain', () => {
  it('Test 8: domain "Tarea no encontrada" → resource_not_found task', async () => {
    completeTaskDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Tarea no encontrada',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.completeTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ taskId: TASK_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'task_not_found',
        missing: { resource: 'task', id: TASK_ID },
      },
    })
  })
})

describe('completeTask — idempotent (already completed)', () => {
  it('Test 9: domain succeeds on no-op (already completed) → executed', async () => {
    const completedAt = '2026-04-01T00:00:00.000Z'
    completeTaskDomainMock.mockResolvedValueOnce({
      success: true,
      data: { taskId: TASK_ID },
    })
    getTaskByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildTaskDetail(TASK_ID, { status: 'completed', completedAt }),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.completeTask as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ taskId: TASK_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { taskId: TASK_ID, status: 'completed', completedAt },
    })
  })
})
