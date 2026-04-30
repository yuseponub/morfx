/**
 * Factory aggregator smoke test (Plan 04 / Task 4.3).
 *
 * Verifies the closed list of 15 tools per CONTEXT D-02 is exactly what
 * `createCrmMutationTools(ctx)` produces — no fewer (regression guard for
 * accidental factory drop), no more (regression guard for scope creep that
 * should go to a follow-up standalone).
 */

import { describe, it, expect, vi } from 'vitest'

// All domain modules need stubs because the factory eagerly composes every
// sub-factory at construction time. None are actually invoked in this smoke test.
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
vi.mock('@/lib/domain/notes', () => ({
  createNote: vi.fn(),
  createOrderNote: vi.fn(),
  archiveNote: vi.fn(),
  archiveOrderNote: vi.fn(),
  getContactNoteById: vi.fn(),
  getOrderNoteById: vi.fn(),
}))
vi.mock('@/lib/domain/tasks', () => ({
  createTask: vi.fn(),
  updateTask: vi.fn(),
  completeTask: vi.fn(),
  getTaskById: vi.fn(),
}))
vi.mock('@/lib/domain/crm-mutation-idempotency', () => ({
  getIdempotencyRow: vi.fn(),
  insertIdempotencyRow: vi.fn(),
}))
vi.mock('@/lib/observability', () => ({
  getCollector: () => ({ recordEvent: vi.fn() }),
}))

import { createCrmMutationTools } from '../index'

const EXPECTED_TOOLS = [
  // contacts(3)
  'createContact',
  'updateContact',
  'archiveContact',
  // orders(5)
  'createOrder',
  'updateOrder',
  'moveOrderToStage',
  'archiveOrder',
  'closeOrder',
  // notes(4)
  'addContactNote',
  'addOrderNote',
  'archiveContactNote',
  'archiveOrderNote',
  // tasks(3)
  'createTask',
  'updateTask',
  'completeTask',
] as const

describe('createCrmMutationTools — closed list (D-02)', () => {
  it('exposes exactly 15 tools', () => {
    const tools = createCrmMutationTools({ workspaceId: 'ws-test' })
    const keys = Object.keys(tools).sort()
    expect(keys.length).toBe(15)
  })

  it('exposes every expected tool by name', () => {
    const tools = createCrmMutationTools({ workspaceId: 'ws-test' })
    for (const expected of EXPECTED_TOOLS) {
      expect(tools, `missing tool ${expected}`).toHaveProperty(expected)
    }
  })

  it('does not expose any unexpected tool (scope creep guard)', () => {
    const tools = createCrmMutationTools({ workspaceId: 'ws-test' })
    const keys = Object.keys(tools)
    const unexpected = keys.filter((k) => !EXPECTED_TOOLS.includes(k as (typeof EXPECTED_TOOLS)[number]))
    expect(unexpected).toEqual([])
  })
})
