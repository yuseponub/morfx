/**
 * Unit tests for note mutation tools (Plan 04 / Wave 3).
 *
 * Mocks:
 *   - @/lib/domain/notes (createNote (alias domainCreateContactNote), createOrderNote,
 *     archiveNote (alias domainArchiveContactNote), archiveOrderNote, getContactNoteById,
 *     getOrderNoteById)
 *   - @/lib/domain/contacts (getContactById — pre-check for addContactNote)
 *   - @/lib/domain/orders (getOrderById — pre-check for addOrderNote)
 *   - @/lib/domain/crm-mutation-idempotency (getIdempotencyRow, insertIdempotencyRow)
 *   - @/lib/observability (getCollector → recordEvent spy)
 *
 * Coverage (4 tools × multiple paths):
 *   addContactNote:
 *     - Test 1: happy path → executed + NoteSnapshot.
 *     - Test 2: contact_not_found pre-check → resource_not_found, no domain.createNote call.
 *     - Test 3: idempotency replay → first executed, second duplicate (rehydrate via getContactNoteById, NOT fabricated from input).
 *     - Test 4: PII redaction in observability — body truncated to 200 chars.
 *
 *   addOrderNote:
 *     - Test 5: happy path → executed + NoteSnapshot.
 *     - Test 6: order_not_found pre-check → resource_not_found, no domain.createOrderNote call.
 *     - Test 7: PII redaction — long body truncated.
 *
 *   archiveContactNote:
 *     - Test 8: happy path → executed (idempotent at domain).
 *     - Test 9: domain "Nota no encontrada" → resource_not_found note.
 *
 *   archiveOrderNote:
 *     - Test 10: happy path → executed.
 *     - Test 11: domain "Nota de pedido no encontrada" → resource_not_found note.
 *
 * Two-step cast pattern (Pitfall 3 — AI SDK v6).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  createNoteDomainMock,
  createOrderNoteDomainMock,
  archiveNoteDomainMock,
  archiveOrderNoteDomainMock,
  getContactNoteByIdMock,
  getOrderNoteByIdMock,
  getContactByIdMock,
  getOrderByIdMock,
  getIdempotencyRowMock,
  insertIdempotencyRowMock,
  recordEventMock,
} = vi.hoisted(() => ({
  createNoteDomainMock: vi.fn(),
  createOrderNoteDomainMock: vi.fn(),
  archiveNoteDomainMock: vi.fn(),
  archiveOrderNoteDomainMock: vi.fn(),
  getContactNoteByIdMock: vi.fn(),
  getOrderNoteByIdMock: vi.fn(),
  getContactByIdMock: vi.fn(),
  getOrderByIdMock: vi.fn(),
  getIdempotencyRowMock: vi.fn(),
  insertIdempotencyRowMock: vi.fn(),
  recordEventMock: vi.fn(),
}))

vi.mock('@/lib/domain/notes', () => ({
  createNote: createNoteDomainMock,
  createOrderNote: createOrderNoteDomainMock,
  archiveNote: archiveNoteDomainMock,
  archiveOrderNote: archiveOrderNoteDomainMock,
  getContactNoteById: getContactNoteByIdMock,
  getOrderNoteById: getOrderNoteByIdMock,
}))

vi.mock('@/lib/domain/contacts', () => ({
  getContactById: getContactByIdMock,
  // create/update/archive contact mocks are unused here but the contacts.ts
  // module imports them at the top of the file; provide no-op stubs.
  createContact: vi.fn(),
  updateContact: vi.fn(),
  archiveContact: vi.fn(),
}))

vi.mock('@/lib/domain/orders', () => ({
  getOrderById: getOrderByIdMock,
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  moveOrderToStage: vi.fn(),
  archiveOrder: vi.fn(),
  closeOrder: vi.fn(),
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

const CONTACT_ID = '22222222-2222-2222-2222-222222222222'
const ORDER_ID = '33333333-3333-3333-3333-333333333333'
const NOTE_ID = '44444444-4444-4444-4444-444444444444'

function buildContactDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Alice',
    phone: '+573001234567',
    email: null,
    address: null,
    city: null,
    department: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    tags: [],
    customFields: {},
    ...overrides,
  }
}

function buildOrderDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    contactId: CONTACT_ID,
    pipelineId: 'pipe-1',
    stageId: 'stage-1',
    totalValue: 0,
    description: null,
    shippingAddress: null,
    shippingCity: null,
    shippingDepartment: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    closedAt: null,
    items: [],
    ...overrides,
  }
}

function buildContactNoteDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    noteId: id,
    contactId: CONTACT_ID,
    workspaceId: WORKSPACE_ID,
    body: 'Cliente solicitó cotización',
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  }
}

function buildOrderNoteDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    noteId: id,
    orderId: ORDER_ID,
    workspaceId: WORKSPACE_ID,
    body: 'Pedido confirmado por WhatsApp',
    createdAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  createNoteDomainMock.mockReset()
  createOrderNoteDomainMock.mockReset()
  archiveNoteDomainMock.mockReset()
  archiveOrderNoteDomainMock.mockReset()
  getContactNoteByIdMock.mockReset()
  getOrderNoteByIdMock.mockReset()
  getContactByIdMock.mockReset()
  getOrderByIdMock.mockReset()
  getIdempotencyRowMock.mockReset()
  insertIdempotencyRowMock.mockReset()
  recordEventMock.mockReset()
})

// ============================================================================
// addContactNote
// ============================================================================

describe('addContactNote — happy path', () => {
  it('Test 1: returns executed with NoteSnapshot when contact exists and domain succeeds', async () => {
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail(CONTACT_ID),
    })
    createNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID },
    })
    getContactNoteByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactNoteDetail(NOTE_ID),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.addContactNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, body: 'Cliente solicitó cotización' })

    expect(result).toMatchObject({
      status: 'executed',
      data: { noteId: NOTE_ID, body: 'Cliente solicitó cotización', archivedAt: null },
    })

    // Domain createNote called with workspace from ctx + content (NOT body)
    expect(createNoteDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, source: 'tool-handler' }),
      expect.objectContaining({ contactId: CONTACT_ID, content: 'Cliente solicitó cotización' }),
    )
    // No idempotency table touched (no key)
    expect(getIdempotencyRowMock).not.toHaveBeenCalled()
  })
})

describe('addContactNote — contact_not_found pre-check', () => {
  it('Test 2: returns resource_not_found without calling domain.createNote', async () => {
    getContactByIdMock.mockResolvedValueOnce({ success: true, data: null })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.addContactNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, body: 'note body' })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'contact_not_found',
        missing: { resource: 'contact', id: CONTACT_ID },
      },
    })
    expect(createNoteDomainMock).not.toHaveBeenCalled()
  })
})

describe('addContactNote — idempotency replay rehydrates via domain getter (D-09 / Pitfall 6)', () => {
  it('Test 3: second call with same key returns duplicate using fresh getContactNoteById data, NOT input body', async () => {
    // First call: lookup miss → execute → clean insert.
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail(CONTACT_ID),
    })
    getIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: null })
    createNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID },
    })
    getContactNoteByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactNoteDetail(NOTE_ID, { body: 'original body' }),
    })
    insertIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: { inserted: true },
    })

    // Second call: lookup hit → rehydrate fresh via getContactNoteById.
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail(CONTACT_ID),
    })
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: WORKSPACE_ID,
        toolName: 'addContactNote',
        key: 'idem-1',
        resultId: NOTE_ID,
        resultPayload: buildContactNoteDetail(NOTE_ID, { body: 'original body' }),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    // CRITICAL: rehydrate returns FRESH data, not the input body — proves D-09.
    getContactNoteByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactNoteDetail(NOTE_ID, { body: 'fresh-from-db body' }),
    })

    const tools = createCrmMutationTools(CTX)
    const exec = (
      tools.addContactNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute

    const first = await exec({
      contactId: CONTACT_ID,
      body: 'caller-input-body-DIFFERENT',
      idempotencyKey: 'idem-1',
    })
    expect(first).toMatchObject({ status: 'executed', data: { noteId: NOTE_ID } })

    const second = await exec({
      contactId: CONTACT_ID,
      body: 'caller-input-body-IGNORED',
      idempotencyKey: 'idem-1',
    })
    expect(second).toMatchObject({
      status: 'duplicate',
      data: { noteId: NOTE_ID, body: 'fresh-from-db body' },
    })

    // Domain createNote called only ONCE (second call short-circuited).
    expect(createNoteDomainMock).toHaveBeenCalledTimes(1)
    // Rehydrate via domain getter, NOT input — Pitfall 6 enforcement.
    expect(getContactNoteByIdMock).toHaveBeenCalledTimes(2)
  })
})

describe('addContactNote — PII redaction (body truncate to 200 chars)', () => {
  it('Test 4: invoked payload contains body truncated, no full long body', async () => {
    const longBody = 'A'.repeat(500)
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail(CONTACT_ID),
    })
    createNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID },
    })
    getContactNoteByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactNoteDetail(NOTE_ID, { body: longBody }),
    })

    const tools = createCrmMutationTools(CTX)
    await (
      tools.addContactNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ contactId: CONTACT_ID, body: longBody })

    const invoked = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_invoked')
    const payload = invoked?.[2] as Record<string, unknown>
    const inputRedacted = payload.inputRedacted as Record<string, unknown>
    // bodyTruncate(s, 200) → first 200 chars + ellipsis = 201 chars total.
    expect(typeof inputRedacted.body).toBe('string')
    expect((inputRedacted.body as string).length).toBeLessThanOrEqual(201)
    expect((inputRedacted.body as string).startsWith('AAAA')).toBe(true)
    // Full 500-char body MUST NOT appear in payload.
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('A'.repeat(500))
  })
})

// ============================================================================
// addOrderNote
// ============================================================================

describe('addOrderNote — happy path', () => {
  it('Test 5: returns executed with NoteSnapshot when order exists and domain succeeds', async () => {
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    createOrderNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID },
    })
    getOrderNoteByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderNoteDetail(NOTE_ID),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.addOrderNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, body: 'Pedido confirmado por WhatsApp' })

    expect(result).toMatchObject({
      status: 'executed',
      data: { noteId: NOTE_ID, body: 'Pedido confirmado por WhatsApp', archivedAt: null },
    })

    expect(createOrderNoteDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, source: 'tool-handler' }),
      expect.objectContaining({ orderId: ORDER_ID, content: 'Pedido confirmado por WhatsApp' }),
    )
  })
})

describe('addOrderNote — order_not_found pre-check', () => {
  it('Test 6: returns resource_not_found without calling domain.createOrderNote', async () => {
    getOrderByIdMock.mockResolvedValueOnce({ success: true, data: null })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.addOrderNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, body: 'note body' })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'order_not_found',
        missing: { resource: 'order', id: ORDER_ID },
      },
    })
    expect(createOrderNoteDomainMock).not.toHaveBeenCalled()
  })
})

describe('addOrderNote — PII redaction (body truncate)', () => {
  it('Test 7: invoked payload contains body truncated to ≤201 chars', async () => {
    const longBody = 'B'.repeat(400)
    getOrderByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderDetail(ORDER_ID),
    })
    createOrderNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID },
    })
    getOrderNoteByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildOrderNoteDetail(NOTE_ID, { body: longBody }),
    })

    const tools = createCrmMutationTools(CTX)
    await (
      tools.addOrderNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ orderId: ORDER_ID, body: longBody })

    const invoked = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_invoked')
    const payload = invoked?.[2] as Record<string, unknown>
    const inputRedacted = payload.inputRedacted as Record<string, unknown>
    expect(typeof inputRedacted.body).toBe('string')
    expect((inputRedacted.body as string).length).toBeLessThanOrEqual(201)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('B'.repeat(400))
  })
})

// ============================================================================
// archiveContactNote
// ============================================================================

describe('archiveContactNote — happy path', () => {
  it('Test 8: returns executed with archivedAt populated', async () => {
    const archivedAt = '2026-04-29T12:00:00.000Z'
    archiveNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID, archivedAt },
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveContactNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ noteId: NOTE_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { noteId: NOTE_ID, archivedAt },
    })
    expect(archiveNoteDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      { noteId: NOTE_ID },
    )
  })
})

describe('archiveContactNote — note_not_found from domain', () => {
  it('Test 9: domain "Nota no encontrada" → resource_not_found note', async () => {
    archiveNoteDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Nota no encontrada',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveContactNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ noteId: NOTE_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'note_not_found',
        missing: { resource: 'note', id: NOTE_ID },
      },
    })

    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'resource_not_found' })
  })
})

// ============================================================================
// archiveOrderNote
// ============================================================================

describe('archiveOrderNote — happy path', () => {
  it('Test 10: returns executed with archivedAt populated', async () => {
    const archivedAt = '2026-04-29T13:00:00.000Z'
    archiveOrderNoteDomainMock.mockResolvedValueOnce({
      success: true,
      data: { noteId: NOTE_ID, archivedAt },
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveOrderNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ noteId: NOTE_ID })

    expect(result).toMatchObject({
      status: 'executed',
      data: { noteId: NOTE_ID, archivedAt },
    })
    expect(archiveOrderNoteDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID }),
      { noteId: NOTE_ID },
    )
  })
})

describe('archiveOrderNote — note_not_found from domain', () => {
  it('Test 11: domain "Nota de pedido no encontrada" → resource_not_found note', async () => {
    archiveOrderNoteDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Nota de pedido no encontrada',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.archiveOrderNote as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ noteId: NOTE_ID })

    expect(result).toMatchObject({
      status: 'resource_not_found',
      error: {
        code: 'note_not_found',
        missing: { resource: 'note', id: NOTE_ID },
      },
    })
  })
})
