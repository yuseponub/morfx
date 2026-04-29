/**
 * Unit tests for createContact tool (Plan 02 / Wave 1).
 *
 * Mocks:
 *   - @/lib/domain/contacts (createContact, getContactById)
 *   - @/lib/domain/crm-mutation-idempotency (getIdempotencyRow, insertIdempotencyRow)
 *   - @/lib/observability (getCollector → recordEvent spy)
 *
 * Coverage:
 *   - Test 1: happy path (no idempotency) → executed + ContactDetail.
 *   - Test 2: idempotency replay → first call executed, second call duplicate same id.
 *   - Test 3: validation_error from domain → MutationResult.validation_error.
 *   - Test 4: unexpected error from domain → MutationResult.error.
 *   - Test 5: observability emits invoked + completed (or failed).
 *   - Test 6: PII redaction (phoneSuffix='4567', emailRedact masks local part).
 *
 * Two-step cast pattern (Pitfall 3 — AI SDK v6):
 *   await (tool as unknown as { execute: (input: unknown) => Promise<unknown> }).execute(...)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  createContactDomainMock,
  getContactByIdMock,
  getIdempotencyRowMock,
  insertIdempotencyRowMock,
  recordEventMock,
} = vi.hoisted(() => ({
  createContactDomainMock: vi.fn(),
  getContactByIdMock: vi.fn(),
  getIdempotencyRowMock: vi.fn(),
  insertIdempotencyRowMock: vi.fn(),
  recordEventMock: vi.fn(),
}))

vi.mock('@/lib/domain/contacts', () => ({
  createContact: createContactDomainMock,
  getContactById: getContactByIdMock,
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

function buildContactDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Alice',
    phone: '+573001234567',
    email: 'alice@example.com',
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

beforeEach(() => {
  createContactDomainMock.mockReset()
  getContactByIdMock.mockReset()
  getIdempotencyRowMock.mockReset()
  insertIdempotencyRowMock.mockReset()
  recordEventMock.mockReset()
})

// ============================================================================
// Test 1: happy path
// ============================================================================

describe('createContact — happy path (no idempotency)', () => {
  it('Test 1: returns executed with ContactDetail when domain succeeds', async () => {
    createContactDomainMock.mockResolvedValueOnce({
      success: true,
      data: { contactId: 'c-new' },
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('c-new'),
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ name: 'Alice', phone: '+573001234567' })

    expect(result).toMatchObject({
      status: 'executed',
      data: { id: 'c-new', name: 'Alice' },
    })

    // Domain createContact called WITH workspace from ctx (D-pre-03), not input.
    expect(createContactDomainMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE_ID, source: 'tool-handler' }),
      expect.objectContaining({ name: 'Alice', phone: '+573001234567' }),
    )
    // No idempotency table touched (no key provided).
    expect(getIdempotencyRowMock).not.toHaveBeenCalled()
    expect(insertIdempotencyRowMock).not.toHaveBeenCalled()
  })
})

// ============================================================================
// Test 2: idempotency replay
// ============================================================================

describe('createContact — idempotency replay', () => {
  it('Test 2: first call executed, second call same key → duplicate same contact id', async () => {
    // First call: lookup miss → execute → clean insert.
    getIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: null })
    createContactDomainMock.mockResolvedValueOnce({
      success: true,
      data: { contactId: 'c-1' },
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('c-1'),
    })
    insertIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: { inserted: true },
    })

    // Second call: lookup hit → re-hydrate fresh.
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: WORKSPACE_ID,
        toolName: 'createContact',
        key: 'idem-1',
        resultId: 'c-1',
        resultPayload: buildContactDetail('c-1'),
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('c-1', { name: 'Alice (fresh)' }),
    })

    const tools = createCrmMutationTools(CTX)
    const exec = (
      tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute

    const first = await exec({ name: 'Alice', phone: '+573001234567', idempotencyKey: 'idem-1' })
    expect(first).toMatchObject({ status: 'executed', data: { id: 'c-1' } })

    const second = await exec({ name: 'Alice', phone: '+573001234567', idempotencyKey: 'idem-1' })
    expect(second).toMatchObject({
      status: 'duplicate',
      data: { id: 'c-1', name: 'Alice (fresh)' },
    })

    // Domain createContact called only ONCE (second call short-circuited via lookup hit).
    expect(createContactDomainMock).toHaveBeenCalledTimes(1)
  })
})

// ============================================================================
// Test 3: validation_error
// ============================================================================

describe('createContact — validation_error from domain', () => {
  it('Test 3: maps "Phone es requerido" → validation_error', async () => {
    createContactDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'Numero de telefono invalido',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ name: 'Alice', phone: '+573001234567' })

    expect(result).toMatchObject({
      status: 'validation_error',
      error: { code: 'validation_error', message: 'Numero de telefono invalido' },
    })

    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'validation_error' })
  })
})

// ============================================================================
// Test 4: unexpected error
// ============================================================================

describe('createContact — unexpected error from domain', () => {
  it('Test 4: maps "db connection lost" → status:error', async () => {
    createContactDomainMock.mockResolvedValueOnce({
      success: false,
      error: 'db connection lost',
    })

    const tools = createCrmMutationTools(CTX)
    const result = await (
      tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ name: 'Alice', phone: '+573001234567' })

    expect(result).toMatchObject({
      status: 'error',
      error: { code: 'create_contact_failed', message: 'db connection lost' },
    })

    const failed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_failed')
    expect(failed?.[2]).toMatchObject({ errorCode: 'error' })
  })
})

// ============================================================================
// Test 5: observability emits invoked + completed (or failed)
// ============================================================================

describe('createContact — observability', () => {
  it('Test 5: emits crm_mutation_invoked + crm_mutation_completed on happy path', async () => {
    createContactDomainMock.mockResolvedValueOnce({
      success: true,
      data: { contactId: 'c-1' },
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('c-1'),
    })

    const tools = createCrmMutationTools(CTX)
    await (
      tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({ name: 'Alice', phone: '+573001234567' })

    const labels = recordEventMock.mock.calls.map((c) => c[1])
    expect(labels).toContain('crm_mutation_invoked')
    expect(labels).toContain('crm_mutation_completed')

    const completed = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_completed')
    expect(completed?.[2]).toMatchObject({
      tool: 'createContact',
      workspaceId: WORKSPACE_ID,
      invoker: 'test-suite',
      resultStatus: 'executed',
      resultId: 'c-1',
      idempotencyKeyHit: false,
    })
    expect(typeof completed?.[2].latencyMs).toBe('number')
  })
})

// ============================================================================
// Test 6: PII redaction in observability payload
// ============================================================================

describe('createContact — PII redaction (D-23 / Pattern 5)', () => {
  it('Test 6: invoked payload contains phoneSuffix + emailRedact, NOT raw phone/email', async () => {
    createContactDomainMock.mockResolvedValueOnce({
      success: true,
      data: { contactId: 'c-1' },
    })
    getContactByIdMock.mockResolvedValueOnce({
      success: true,
      data: buildContactDetail('c-1'),
    })

    const tools = createCrmMutationTools(CTX)
    await (
      tools.createContact as unknown as { execute: (input: unknown) => Promise<unknown> }
    ).execute({
      name: 'Alice',
      phone: '+57 300 123 4567',
      email: 'alice@example.com',
    })

    const invoked = recordEventMock.mock.calls.find((c) => c[1] === 'crm_mutation_invoked')
    const payload = invoked?.[2] as Record<string, unknown>
    const inputRedacted = payload.inputRedacted as Record<string, unknown>

    expect(inputRedacted).toMatchObject({
      phoneSuffix: '4567',
      email: 'ali…@example.com',
      hasName: true,
      hasIdempotencyKey: false,
    })
    // Raw PII MUST NOT appear anywhere in the payload.
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('+57 300 123 4567')
    expect(serialized).not.toContain('3001234567')
    expect(serialized).not.toContain('alice@example.com')
  })
})
