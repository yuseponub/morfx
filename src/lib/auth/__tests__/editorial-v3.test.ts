import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit test for getIsEditorialV3Enabled — D-04 fail-closed gate.
 *
 * The resolver reads the JSONB sub-key workspaces.settings.ui_editorial_v3.enabled
 * and MUST fail closed to false on any error / null / missing key / non-strict-true
 * value. This guarantees Regla 6: if the flag check breaks, the user sees the
 * current (legacy) UI, never a half-rendered editorial-v3 one.
 *
 * Mock controls: `singleResult` holds the { data, error } pair the supabase
 * `.from().select().eq().single()` chain resolves to. Each test sets it before
 * a fresh import of the module.
 */

let singleResult: { data: unknown; error: unknown } = { data: null, error: null }
const singleMock = vi.fn(async () => singleResult)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: singleMock,
        }),
      }),
    }),
  })),
}))

async function importFresh() {
  vi.resetModules()
  const mod = await import('../editorial-v3')
  return mod.getIsEditorialV3Enabled
}

describe('getIsEditorialV3Enabled', () => {
  beforeEach(() => {
    singleMock.mockClear()
    singleResult = { data: null, error: null }
  })

  it('Test 1: workspaceId vacio → false (no consulta la DB)', async () => {
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('')).toBe(false)
    expect(singleMock).not.toHaveBeenCalled()
  })

  it('Test 2: supabase devuelve error → false', async () => {
    singleResult = { data: { settings: { ui_editorial_v3: { enabled: true } } }, error: { message: 'boom' } }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 3: data null → false', async () => {
    singleResult = { data: null, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 4: settings null → false', async () => {
    singleResult = { data: { settings: null }, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 5: settings.ui_editorial_v3 key ausente → false', async () => {
    singleResult = { data: { settings: { ui_inbox_v2: { enabled: true } } }, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 6: enabled === "true" (string, no boolean estricto) → false', async () => {
    singleResult = { data: { settings: { ui_editorial_v3: { enabled: 'true' } } }, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 7: enabled === 1 (number, no boolean estricto) → false', async () => {
    singleResult = { data: { settings: { ui_editorial_v3: { enabled: 1 } } }, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 8: enabled ausente dentro del namespace → false', async () => {
    singleResult = { data: { settings: { ui_editorial_v3: {} } }, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 9: la consulta lanza (throw) → false (try/catch)', async () => {
    singleMock.mockImplementationOnce(async () => {
      throw new Error('network down')
    })
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(false)
  })

  it('Test 10: enabled === true (boolean estricto) → true', async () => {
    singleResult = { data: { settings: { ui_editorial_v3: { enabled: true } } }, error: null }
    const getIsEditorialV3Enabled = await importFresh()
    expect(await getIsEditorialV3Enabled('ws1')).toBe(true)
  })
})
