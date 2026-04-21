import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock SessionManager BEFORE importing the module under test (vi.mock hoists).
const mockGetState = vi.fn()

vi.mock('@/lib/agents/session-manager', () => ({
  SessionManager: vi.fn().mockImplementation(() => ({
    getState: mockGetState,
  })),
}))

// Import AFTER mocks.
import { pollCrmContext } from '../somnio-recompra-agent'

describe('pollCrmContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fast-path: returns immediately when datosFromInput already has status=ok', async () => {
    const result = await pollCrmContext('session-123', {
      '_v3:crm_context': 'Ultimo pedido: 2x Somnio entregado 2026-04-10...',
      '_v3:crm_context_status': 'ok',
    })

    expect(result).toEqual({
      crmContext: 'Ultimo pedido: 2x Somnio entregado 2026-04-10...',
      status: 'ok',
    })
    expect(mockGetState).not.toHaveBeenCalled()
  })

  it('fast-path: returns immediately when datosFromInput already has status=error', async () => {
    const result = await pollCrmContext('session-123', {
      '_v3:crm_context': '',
      '_v3:crm_context_status': 'error',
    })

    expect(result).toEqual({ crmContext: '', status: 'error' })
    expect(mockGetState).not.toHaveBeenCalled()
  })

  it('fast-path: returns immediately when datosFromInput has status=empty', async () => {
    const result = await pollCrmContext('session-123', {
      '_v3:crm_context': '',
      '_v3:crm_context_status': 'empty',
    })

    expect(result).toEqual({ crmContext: '', status: 'empty' })
    expect(mockGetState).not.toHaveBeenCalled()
  })

  it('poll-path: finds status=ok on 2nd DB iteration (after ~1000ms)', async () => {
    // First call (after 500ms): no status yet
    // Second call (after 1000ms): status=ok
    mockGetState
      .mockResolvedValueOnce({ datos_capturados: {} })
      .mockResolvedValueOnce({
        datos_capturados: {
          '_v3:crm_context': 'reader output texto',
          '_v3:crm_context_status': 'ok',
        },
      })

    const promise = pollCrmContext('session-123', {})

    // Advance 500ms → first getState call returns empty
    await vi.advanceTimersByTimeAsync(500)
    // Advance another 500ms → second getState returns ok
    await vi.advanceTimersByTimeAsync(500)

    const result = await promise
    expect(result).toEqual({ crmContext: 'reader output texto', status: 'ok' })
    expect(mockGetState).toHaveBeenCalledTimes(2)
  })

  it('poll-path: times out after 3000ms when status never appears → status=timeout', async () => {
    // All getState calls return empty datos_capturados
    mockGetState.mockResolvedValue({ datos_capturados: {} })

    const promise = pollCrmContext('session-123', {})

    // Advance past deadline (3000ms total). Exceed by a bit so Date.now() is past deadline.
    await vi.advanceTimersByTimeAsync(3100)

    const result = await promise
    expect(result).toEqual({ crmContext: null, status: 'timeout' })
    // At least 6 iterations should have happened (3000/500 = 6).
    expect(mockGetState.mock.calls.length).toBeGreaterThanOrEqual(6)
  })

  it('poll-path: returns immediately on status=error from DB (no more iterations)', async () => {
    // First iteration returns status=error.
    mockGetState.mockResolvedValueOnce({
      datos_capturados: {
        '_v3:crm_context': '',
        '_v3:crm_context_status': 'error',
      },
    })

    const promise = pollCrmContext('session-123', {})
    await vi.advanceTimersByTimeAsync(500)

    const result = await promise
    expect(result).toEqual({ crmContext: '', status: 'error' })
    expect(mockGetState).toHaveBeenCalledTimes(1)
  })

  it('poll-path: swallows transient getState errors and retries until timeout', async () => {
    mockGetState
      .mockRejectedValueOnce(new Error('transient db'))
      .mockRejectedValueOnce(new Error('transient db'))
      .mockResolvedValue({ datos_capturados: {} }) // subsequent calls return empty

    const promise = pollCrmContext('session-123', {})
    await vi.advanceTimersByTimeAsync(3100)

    const result = await promise
    expect(result.status).toBe('timeout')
    // errors swallowed, poll continued through timeout
    expect(mockGetState.mock.calls.length).toBeGreaterThanOrEqual(3)
  })
})
