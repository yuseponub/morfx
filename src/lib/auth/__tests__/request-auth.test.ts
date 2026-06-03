import { describe, it, expect, vi, beforeEach } from 'vitest'

// Shared mock controls. The factories below read from these refs so each test
// can configure getClaims()/cookies() behavior before importing the module.
const getClaimsMock = vi.fn()
const cookieGetMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getClaims: getClaimsMock },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGetMock })),
}))

/**
 * getRequestAuth is wrapped in React cache(), which memoizes within a request
 * context. To guarantee a fresh, un-memoized function per test we reset the
 * module registry and dynamic-import the module after configuring the mocks.
 */
async function importFresh() {
  vi.resetModules()
  const mod = await import('../request-auth')
  return mod.getRequestAuth
}

function setCookie(value: string | undefined) {
  cookieGetMock.mockImplementation((name: string) =>
    name === 'morfx_workspace' && value !== undefined ? { value } : undefined,
  )
}

describe('getRequestAuth', () => {
  beforeEach(() => {
    getClaimsMock.mockReset()
    cookieGetMock.mockReset()
  })

  it('Test 1: claims validos + cookie → { userId, email, workspaceId }', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'u1', email: 'a@b.com' } },
      error: null,
    })
    setCookie('ws1')

    const getRequestAuth = await importFresh()
    const result = await getRequestAuth()

    expect(result).toEqual({ userId: 'u1', email: 'a@b.com', workspaceId: 'ws1' })
  })

  it('Test 2: getClaims { data:null, error:null } (sin sesion) → null (Pitfall 2)', async () => {
    getClaimsMock.mockResolvedValue({ data: null, error: null })
    setCookie('ws1')

    const getRequestAuth = await importFresh()
    expect(await getRequestAuth()).toBeNull()
  })

  it('Test 3: getClaims { data:null, error:AuthError } → null (Pitfall 2)', async () => {
    getClaimsMock.mockResolvedValue({
      data: null,
      error: { name: 'AuthError', message: 'invalid' },
    })
    setCookie('ws1')

    const getRequestAuth = await importFresh()
    expect(await getRequestAuth()).toBeNull()
  })

  it('Test 4: claims validos pero SIN cookie morfx_workspace → null', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'u1', email: 'a@b.com' } },
      error: null,
    })
    setCookie(undefined)

    const getRequestAuth = await importFresh()
    expect(await getRequestAuth()).toBeNull()
  })

  it('Test 5: claims.email ausente → email:null (usa ?? null)', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'u1' } },
      error: null,
    })
    setCookie('ws1')

    const getRequestAuth = await importFresh()
    const result = await getRequestAuth()

    expect(result).toEqual({ userId: 'u1', email: null, workspaceId: 'ws1' })
  })

  it('Test 6 (aislamiento cross-workspace): workspaceId SIEMPRE de la cookie, nunca de input', async () => {
    getClaimsMock.mockResolvedValue({
      data: { claims: { sub: 'u1', email: 'a@b.com' } },
      error: null,
    })
    setCookie('ws-cookie')

    const getRequestAuth = await importFresh()
    // La firma NO acepta workspaceId como argumento; pasar uno se ignora a nivel
    // de tipos y de runtime. Verificamos que el workspaceId resuelto venga SOLO
    // de la cookie, nunca de un body/arg atacante.
    const result = await (getRequestAuth as () => Promise<unknown>)()

    expect(result).toEqual({
      userId: 'u1',
      email: 'a@b.com',
      workspaceId: 'ws-cookie',
    })
    // getRequestAuth no expone parametros: longitud de la funcion = 0
    expect(getRequestAuth.length).toBe(0)
  })
})
