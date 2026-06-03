/**
 * Tests for Embedded Signup exchange + auto-subscribe (SIGNUP-02, SIGNUP-03).
 * Phase 38 Plan 01 (Wave 0) — TDD RED scaffold.
 *
 * Contracts under test (to be exported from src/lib/meta/embedded-signup.ts in Plan 04):
 *   exchangeCodeForBisuat(code): Promise<string>
 *     - GET https://graph.facebook.com/v22.0/oauth/access_token?client_id&client_secret&code
 *     - NO Authorization/Bearer header (Pitfall 6 — dedicated unauthenticated fetch, NOT metaRequest).
 *     - Returns data.access_token. Throws on !res.ok || missing access_token.
 *   subscribeWaba(bisuat, wabaId): Promise<void>
 *     - POST /{wabaId}/subscribed_apps via metaRequest (Bearer = bisuat). Throws if !success.
 *
 * RED STATE / Plan 04 dependency:
 *   The import of '@/lib/meta/embedded-signup' fails (module not found) until Plan 04
 *   ships the module. That is the intended Wave 0 RED state, NOT a scaffold failure.
 *
 * Threat coverage:
 *   T-38-03 (Info Disclosure): asserts the exchange fetch carries NO Authorization/Bearer
 *   header and runs server-side (secret in query string, server-only).
 */

import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'

// Mock the Meta API client so subscribeWaba's metaRequest is observable/controllable.
// Plan 04's subscribeWaba reuses metaRequest(bisuat, '/{wabaId}/subscribed_apps', { method:'POST' }).
vi.mock('@/lib/meta/api', () => ({
  metaRequest: vi.fn(),
}))

// RED: this import throws until Plan 04 ships the module. Intended.
import { exchangeCodeForBisuat, subscribeWaba } from '@/lib/meta/embedded-signup'
import { metaRequest } from '@/lib/meta/api'

const mockMetaRequest = metaRequest as ReturnType<typeof vi.fn>

beforeAll(() => {
  process.env.META_APP_ID = '1457229738955828'
  process.env.META_APP_SECRET = 'app_secret_xyz'
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('exchangeCodeForBisuat (SIGNUP-02)', () => {
  it('GETs the oauth/access_token endpoint with client_id, client_secret and code', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'BISUAT_123', token_type: 'bearer' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await exchangeCodeForBisuat('CODE_ABC')

    expect(result).toBe('BISUAT_123')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('https://graph.facebook.com/v22.0/oauth/access_token')
    expect(url).toContain('client_id=1457229738955828')
    expect(url).toContain('client_secret=app_secret_xyz')
    expect(url).toContain('code=CODE_ABC')
  })

  it('sends NO Authorization/Bearer header on the exchange (Pitfall 6)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'BISUAT_123' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await exchangeCodeForBisuat('CODE_ABC')

    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined
    // Either no init at all, or an init with no Authorization header.
    const headers = (init?.headers ?? {}) as Record<string, string>
    const headerKeys = Object.keys(headers).map((k) => k.toLowerCase())
    expect(headerKeys).not.toContain('authorization')
    expect(JSON.stringify(init ?? {})).not.toMatch(/Bearer/i)
  })

  it('throws when fetch resolves !ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: 'bad code' } }),
      })
    )
    await expect(exchangeCodeForBisuat('BAD_CODE')).rejects.toThrow()
  })

  it('throws when the response has no access_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token_type: 'bearer' }),
      })
    )
    await expect(exchangeCodeForBisuat('CODE_ABC')).rejects.toThrow()
  })
})

describe('subscribeWaba (SIGNUP-03)', () => {
  it('POSTs /{wabaId}/subscribed_apps via metaRequest with the BISUAT and resolves on success', async () => {
    mockMetaRequest.mockResolvedValue({ success: true })

    await expect(subscribeWaba('BISUAT_123', 'WABA_999')).resolves.toBeUndefined()

    expect(mockMetaRequest).toHaveBeenCalledTimes(1)
    const [token, endpoint, options] = mockMetaRequest.mock.calls[0]
    expect(token).toBe('BISUAT_123')
    expect(endpoint).toBe('/WABA_999/subscribed_apps')
    expect((options as RequestInit).method).toBe('POST')
  })

  it('throws when metaRequest returns success:false', async () => {
    mockMetaRequest.mockResolvedValue({ success: false })
    await expect(subscribeWaba('BISUAT_123', 'WABA_999')).rejects.toThrow()
  })
})
