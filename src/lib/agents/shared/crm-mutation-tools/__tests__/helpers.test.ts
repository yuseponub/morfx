/**
 * Unit tests for crm-mutation-tools helpers (Plan 02 / Wave 1).
 *
 * Coverage:
 *   - withIdempotency: 4 paths (no-key, lookup-hit-fresh, lookup-hit-fallback, race-detect).
 *   - mapDomainError: 4 status branches (stage_changed_concurrently, resource_not_found,
 *     validation_error, error fallback).
 *
 * Mocks: @/lib/domain/crm-mutation-idempotency (getIdempotencyRow, insertIdempotencyRow).
 *
 * Two-step cast NOT needed here — withIdempotency is a plain async function, not an AI SDK tool.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getIdempotencyRowMock, insertIdempotencyRowMock } = vi.hoisted(() => ({
  getIdempotencyRowMock: vi.fn(),
  insertIdempotencyRowMock: vi.fn(),
}))

vi.mock('@/lib/domain/crm-mutation-idempotency', () => ({
  getIdempotencyRow: getIdempotencyRowMock,
  insertIdempotencyRow: insertIdempotencyRowMock,
}))

// Import AFTER mocks
import { withIdempotency, mapDomainError } from '../helpers'

const DOMAIN_CTX = { workspaceId: 'ws-1', source: 'tool-handler' as const }
const TOOL_CTX = { workspaceId: 'ws-1', invoker: 'test-suite' }

beforeEach(() => {
  getIdempotencyRowMock.mockReset()
  insertIdempotencyRowMock.mockReset()
})

// ============================================================================
// withIdempotency
// ============================================================================

describe('withIdempotency — no key path', () => {
  it('Test 1: without key calls doMutate once and returns executed', async () => {
    const doMutate = vi.fn().mockResolvedValue({ id: 'c1', data: { id: 'c1', name: 'Alice' } })
    const rehydrate = vi.fn()

    const result = await withIdempotency(
      DOMAIN_CTX,
      TOOL_CTX,
      'createContact',
      undefined,
      doMutate,
      rehydrate,
    )

    expect(result).toEqual({
      status: 'executed',
      data: { id: 'c1', name: 'Alice' },
      idempotencyKeyHit: false,
    })
    expect(doMutate).toHaveBeenCalledTimes(1)
    expect(rehydrate).not.toHaveBeenCalled()
    expect(getIdempotencyRowMock).not.toHaveBeenCalled()
    expect(insertIdempotencyRowMock).not.toHaveBeenCalled()
  })
})

describe('withIdempotency — lookup hit (fresh re-hydration)', () => {
  it('Test 2: with key + existing row returns duplicate with fresh data from rehydrate', async () => {
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: 'ws-1',
        toolName: 'createContact',
        key: 'k1',
        resultId: 'c-existing',
        resultPayload: { id: 'c-existing', name: 'STALE' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    const doMutate = vi.fn()
    const rehydrate = vi.fn().mockResolvedValue({ id: 'c-existing', name: 'FRESH' })

    const result = await withIdempotency(
      DOMAIN_CTX,
      TOOL_CTX,
      'createContact',
      'k1',
      doMutate,
      rehydrate,
    )

    expect(result).toEqual({
      status: 'duplicate',
      data: { id: 'c-existing', name: 'FRESH' },
      idempotencyKeyHit: true,
    })
    expect(doMutate).not.toHaveBeenCalled()
    expect(rehydrate).toHaveBeenCalledWith('c-existing')
    expect(insertIdempotencyRowMock).not.toHaveBeenCalled()
  })
})

describe('withIdempotency — lookup hit (rehydrate returns null → fallback to payload)', () => {
  it('Test 3: with key + existing row + rehydrate returns null → falls back to resultPayload', async () => {
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: 'ws-1',
        toolName: 'createContact',
        key: 'k1',
        resultId: 'c-orphan',
        resultPayload: { id: 'c-orphan', name: 'TOMBSTONE' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })
    const doMutate = vi.fn()
    const rehydrate = vi.fn().mockResolvedValue(null)

    const result = await withIdempotency(
      DOMAIN_CTX,
      TOOL_CTX,
      'createContact',
      'k1',
      doMutate,
      rehydrate,
    )

    expect(result).toEqual({
      status: 'duplicate',
      data: { id: 'c-orphan', name: 'TOMBSTONE' },
      idempotencyKeyHit: true,
    })
    expect(doMutate).not.toHaveBeenCalled()
  })
})

describe('withIdempotency — insert race (inserted=false → re-fetch winner)', () => {
  it('Test 4: with key + insert race re-fetches winner and rehydrates', async () => {
    // First lookup: miss
    getIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: null })
    // Insert: race lost
    insertIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: { inserted: false } })
    // Second lookup (re-fetch winner)
    getIdempotencyRowMock.mockResolvedValueOnce({
      success: true,
      data: {
        workspaceId: 'ws-1',
        toolName: 'createContact',
        key: 'k1',
        resultId: 'c-winner',
        resultPayload: { id: 'c-winner', name: 'WINNER-PAYLOAD' },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    })

    const doMutate = vi.fn().mockResolvedValue({ id: 'c-loser', data: { id: 'c-loser', name: 'LOSER' } })
    const rehydrate = vi.fn().mockResolvedValue({ id: 'c-winner', name: 'WINNER-FRESH' })

    const result = await withIdempotency(
      DOMAIN_CTX,
      TOOL_CTX,
      'createContact',
      'k1',
      doMutate,
      rehydrate,
    )

    expect(result).toEqual({
      status: 'duplicate',
      data: { id: 'c-winner', name: 'WINNER-FRESH' },
      idempotencyKeyHit: true,
    })
    expect(doMutate).toHaveBeenCalledTimes(1)
    expect(rehydrate).toHaveBeenCalledWith('c-winner')
    expect(getIdempotencyRowMock).toHaveBeenCalledTimes(2)
  })
})

describe('withIdempotency — clean insert (inserted=true → executed)', () => {
  it('Test 5: with key + clean insert returns executed with idempotencyKeyHit=false', async () => {
    getIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: null })
    insertIdempotencyRowMock.mockResolvedValueOnce({ success: true, data: { inserted: true } })

    const doMutate = vi.fn().mockResolvedValue({ id: 'c-new', data: { id: 'c-new', name: 'Alice' } })
    const rehydrate = vi.fn()

    const result = await withIdempotency(
      DOMAIN_CTX,
      TOOL_CTX,
      'createContact',
      'k1',
      doMutate,
      rehydrate,
    )

    expect(result).toEqual({
      status: 'executed',
      data: { id: 'c-new', name: 'Alice' },
      idempotencyKeyHit: false,
    })
    expect(doMutate).toHaveBeenCalledTimes(1)
    expect(rehydrate).not.toHaveBeenCalled()
    expect(insertIdempotencyRowMock).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'ws-1' }),
      expect.objectContaining({ toolName: 'createContact', key: 'k1', resultId: 'c-new' }),
    )
  })
})

// ============================================================================
// mapDomainError
// ============================================================================

describe('mapDomainError — status branches', () => {
  it('Test 6: "no encontrado" → resource_not_found', () => {
    expect(mapDomainError('Pedido no encontrado en este workspace')).toBe('resource_not_found')
    expect(mapDomainError('Contacto no encontrada')).toBe('resource_not_found')
  })

  it('Test 7: "stage_changed_concurrently" verbatim → stage_changed_concurrently', () => {
    expect(mapDomainError('stage_changed_concurrently')).toBe('stage_changed_concurrently')
  })

  it('Test 8: "requerido" / "invalid" / "obligatorio" → validation_error', () => {
    expect(mapDomainError('Campo nombre es requerido')).toBe('validation_error')
    expect(mapDomainError('Numero de telefono invalido')).toBe('validation_error')
    expect(mapDomainError('Email es obligatorio')).toBe('validation_error')
    expect(mapDomainError('input inválido')).toBe('validation_error')
  })

  it('Test 9: random unknown failure → error fallback', () => {
    expect(mapDomainError('Some random failure')).toBe('error')
    expect(mapDomainError('db connection lost')).toBe('error')
  })
})
