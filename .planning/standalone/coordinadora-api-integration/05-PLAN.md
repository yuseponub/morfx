---
phase: coordinadora-api-integration
plan: 05
type: execute
wave: 1
depends_on: [01, 02, 03, 04]
files_modified:
  - src/lib/carriers/coordinadora/cotizar.ts
  - src/lib/carriers/coordinadora/create-guia.ts
  - src/lib/carriers/coordinadora/imprimir-etiqueta.ts
  - src/lib/carriers/coordinadora/__tests__/wrappers.test.ts
  - src/lib/carriers/coordinadora/index.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "cotizar(req, env) POSTs to /cotizador/nacional with Bearer token"
    - "createGuia(req, env) POSTs to ${COORDINADORA_GUIAS_PATH ?? '/guias/crear'} discriminated by nivelServicio:1|22"
    - "imprimirEtiqueta(req, env) POSTs to /etiquetas/imprimir with {tipo_etiqueta, guias[]}"
    - "Each wrapper calls getToken(env) internally (D-14)"
    - "Each wrapper throws on non-2xx with status + body in error message"
    - "15s AbortSignal.timeout (slightly above envia's 10s — Coordinadora latency unknown)"
    - "Default env arg reads process.env.COORDINADORA_ENV at CALL time (not import time)"
  artifacts:
    - path: "src/lib/carriers/coordinadora/cotizar.ts"
      provides: "cotizar wrapper"
      exports: ["cotizar"]
    - path: "src/lib/carriers/coordinadora/create-guia.ts"
      provides: "createGuia wrapper for Estándar+RCE"
      exports: ["createGuia"]
    - path: "src/lib/carriers/coordinadora/imprimir-etiqueta.ts"
      provides: "imprimirEtiqueta wrapper"
      exports: ["imprimirEtiqueta"]
    - path: "src/lib/carriers/coordinadora/index.ts"
      provides: "Barrel re-exports for downstream callers"
      exports: ["cotizar", "createGuia", "imprimirEtiqueta", "getToken", "BASE_URLS", "resolveWorkspaceFromNit", "mapStatusCode", "mapNovedadCode"]
  key_links:
    - from: "cotizar/createGuia/imprimirEtiqueta"
      to: "client.ts getToken(env)"
      via: "internal call before fetch"
      pattern: "each wrapper opens with `const token = await getToken(env)`"
---

<objective>
Implement the 3 public service wrappers (D-14): `cotizar`, `createGuia`, `imprimirEtiqueta`. Each is a thin fetch wrapper that calls `getToken(env)` first, then POSTs JSON body with Bearer token, then throws on non-2xx.

Mirror `src/lib/carriers/envia-api.ts:35-47` pattern (native fetch + AbortSignal.timeout). Deviation per PATTERNS.md lines 204-208: throw on error (vs envia's `return null`) — Inngest function with `retries: 2` handles retry semantics.

Per D-37 #5: `createGuia` URL path is pending Coordinadora confirmation; use `process.env.COORDINADORA_GUIAS_PATH ?? '/guias/crear'` as a configurable fallback so the code ships and the path can be flipped via env var when Jenny responds.

Also create `index.ts` barrel exports for clean downstream imports.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/coordinadora-api-integration/CONTEXT.md
@.planning/standalone/coordinadora-api-integration/RESEARCH.md
@.planning/standalone/coordinadora-api-integration/PATTERNS.md
@src/lib/carriers/envia-api.ts
@src/lib/carriers/coordinadora/types.ts
@src/lib/carriers/coordinadora/client.ts
@src/lib/carriers/coordinadora/status-codes.ts
@src/lib/carriers/coordinadora/tenant.ts

<interfaces>
From src/lib/carriers/coordinadora/client.ts (created in Plan 04):
```typescript
export const BASE_URLS: Record<Env, string>
export const TOKEN_TTL_MS: number
export function getToken(env: Env): Promise<string>
export function _resetTokenCacheForTests(): void
```

From src/lib/carriers/coordinadora/types.ts (created in Plan 03):
```typescript
export type Env = 'test' | 'prod'
export interface CotizarRequest, CotizarResponse
export interface GuiaEstandarRequest, GuiaRCERequest
export type CreateGuiaRequest = GuiaEstandarRequest | GuiaRCERequest
export interface GuiaResponse
export interface ImprimirEtiquetaRequest, ImprimirEtiquetaResponse
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write wrappers.test.ts (TDD — tests first)</name>
  <files>src/lib/carriers/coordinadora/__tests__/wrappers.test.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Code Examples lines 966-993 (cotizar wrapper canonical)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 172-209 (service wrapper pattern + deviations)
    - src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts (Plan 04 — fetch-mock pattern to mirror)
    - .planning/standalone/coordinadora-api-integration/reference/API Cotizador Nacional.pdf (cotizar endpoint shape)
    - .planning/standalone/coordinadora-api-integration/reference/Servicio etiquetas.pdf (etiquetas endpoint shape)
  </read_first>
  <behavior>
    - cotizar: POSTs to `${BASE_URLS[env]}/cotizador/nacional` with Bearer token + JSON body, returns response, throws on non-2xx
    - createGuia: discriminates on `nivelServicio` field — both branches POST to same URL (path from env or default `/guias/crear`)
    - imprimirEtiqueta: POSTs to `${BASE_URLS[env]}/etiquetas/imprimir` with `{tipo_etiqueta, guias[]}` body
    - All 3 wrappers call `getToken` internally before fetch
    - All 3 wrappers use `AbortSignal.timeout(15_000)` (NOT 10s — see PATTERNS deviation)
    - Non-2xx → throw with status code + body text in message
    - Default env arg reads `process.env.COORDINADORA_ENV` at call time
  </behavior>
  <action>
    Create `src/lib/carriers/coordinadora/__tests__/wrappers.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    import { cotizar } from '../cotizar'
    import { createGuia } from '../create-guia'
    import { imprimirEtiqueta } from '../imprimir-etiqueta'
    import { _resetTokenCacheForTests } from '../client'
    import type { GuiaEstandarRequest, GuiaRCERequest } from '../types'

    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
      _resetTokenCacheForTests()
      fetchMock.mockReset()
      process.env.COORDINADORA_CLIENT_ID = 'cid'
      process.env.COORDINADORA_CLIENT_SECRET = 'csec'
      process.env.COORDINADORA_ENV = 'test'
      // First fetch in each test will be the token call; subsequent calls are the service call.
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'tok' }),
        text: async () => '{}',
      })
    })

    afterEach(() => {
      process.env = { ...ORIGINAL_ENV }
    })

    function mockJsonResponse(body: unknown, status = 200): void {
      fetchMock.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      })
    }

    function primeTokenAnd(serviceBody: unknown, serviceStatus = 200): void {
      // First call = token endpoint
      mockJsonResponse({ access_token: 'tok_abc' }, 200)
      // Second call = service endpoint
      mockJsonResponse(serviceBody, serviceStatus)
    }

    // --- cotizar ---
    describe('cotizar', () => {
      it('POSTs to /cotizador/nacional with Bearer token', async () => {
        primeTokenAnd({ flete_total: 12000, dias_entrega: 2, tipo_trayecto: 'nacional' })
        const res = await cotizar({
          codigoPais: '170',
          ciudadOrigen: '11001',
          ciudadDestino: '05001',
          pesoTotal: 1,
          valorDeclarado: 50000,
          unidades: 1,
        }, 'test')
        expect(res.flete_total).toBe(12000)
        // Second call (index 1) is the service call
        const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('api-test.coordinadora.tech/cotizador/nacional')
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok_abc')
        expect(init.method).toBe('POST')
      })

      it('throws on non-2xx with status + body in message', async () => {
        mockJsonResponse({ access_token: 'tok' }, 200)
        mockJsonResponse({ error: 'bad_request' }, 400)
        await expect(cotizar({
          codigoPais: '170', ciudadOrigen: '0', ciudadDestino: '0',
          pesoTotal: 1, valorDeclarado: 1, unidades: 1,
        }, 'test')).rejects.toThrow(/400/)
      })

      it('uses 15s AbortSignal.timeout', async () => {
        primeTokenAnd({ flete_total: 1, dias_entrega: 1, tipo_trayecto: 'x' })
        await cotizar({
          codigoPais: '170', ciudadOrigen: '0', ciudadDestino: '0',
          pesoTotal: 1, valorDeclarado: 1, unidades: 1,
        }, 'test')
        const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
        // AbortSignal.timeout(15_000) — instance check (we don't compare ms directly because
        // AbortSignal doesn't expose its timeout duration). Presence is enough.
        expect(init.signal).toBeInstanceOf(AbortSignal)
      })
    })

    // --- createGuia ---
    describe('createGuia (D-14)', () => {
      const baseGuia: Omit<GuiaEstandarRequest, 'nivelServicio'> = {
        idProceso: 'IP', divisionCliente: '01', nitCliente: '902052328',
        tipoCuenta: 'TC', tipoProducto: 'TP',
        destinatario: { nombre: 'X', telefono: '3000000000' },
        direccion: { direccion: 'cl 1', ciudad: '11001' },
        productos: [{ descripcion: 'p', cantidad: 1, pesoUnitario: 0.1, valorUnitario: 1000 }],
        pesoTotal: 0.1, valorDeclarado: 1000, unidades: 1,
      }

      it('POSTs nivelServicio:1 (Estándar) to env-configured path', async () => {
        process.env.COORDINADORA_GUIAS_PATH = '/guias/crear'
        primeTokenAnd({ numero_guia: '12345678901' })
        const res = await createGuia({ ...baseGuia, nivelServicio: 1 }, 'test')
        expect(res.numero_guia).toBe('12345678901')
        const [url] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('api-test.coordinadora.tech/guias/crear')
      })

      it('POSTs nivelServicio:22 (RCE) with valorRecaudar', async () => {
        primeTokenAnd({ numero_guia: '12345678902' })
        const rce: GuiaRCERequest = { ...baseGuia, nivelServicio: 22, valorRecaudar: 100000 }
        const res = await createGuia(rce, 'test')
        expect(res.numero_guia).toBe('12345678902')
        const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
        const body = JSON.parse(init.body as string)
        expect(body.nivelServicio).toBe(22)
        expect(body.valorRecaudar).toBe(100000)
      })

      it('falls back to default path /guias/crear when env var unset', async () => {
        delete process.env.COORDINADORA_GUIAS_PATH
        primeTokenAnd({ numero_guia: '12345678903' })
        await createGuia({ ...baseGuia, nivelServicio: 1 }, 'test')
        const [url] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('/guias/crear')
      })

      it('respects custom path from env var (D-37 #5 unblock pattern)', async () => {
        process.env.COORDINADORA_GUIAS_PATH = '/guias/v2/registrar'
        primeTokenAnd({ numero_guia: '12345678904' })
        await createGuia({ ...baseGuia, nivelServicio: 1 }, 'test')
        const [url] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('/guias/v2/registrar')
      })
    })

    // --- imprimirEtiqueta ---
    describe('imprimirEtiqueta', () => {
      it('POSTs to /etiquetas/imprimir with {tipo_etiqueta, guias[]}', async () => {
        primeTokenAnd({ etiqueta_base64: 'JVBERi0xLjQK' })
        const res = await imprimirEtiqueta({ tipo_etiqueta: '55', guias: ['12345678901', '12345678902'] }, 'test')
        expect(res.etiqueta_base64).toBeTruthy()
        const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('/etiquetas/imprimir')
        const body = JSON.parse(init.body as string)
        expect(body.tipo_etiqueta).toBe('55')
        expect(body.guias).toEqual(['12345678901', '12345678902'])
      })

      it('throws on non-2xx', async () => {
        mockJsonResponse({ access_token: 'tok' }, 200)
        mockJsonResponse({ error: 'guides_not_found' }, 404)
        await expect(imprimirEtiqueta({ tipo_etiqueta: '55', guias: ['99999999999'] }, 'test'))
          .rejects.toThrow(/404/)
      })
    })

    // --- env discriminator ---
    describe('env discriminator', () => {
      it('uses prod base URL when env=prod', async () => {
        primeTokenAnd({ flete_total: 0, dias_entrega: 0, tipo_trayecto: '' })
        await cotizar({
          codigoPais: '170', ciudadOrigen: '0', ciudadDestino: '0',
          pesoTotal: 1, valorDeclarado: 1, unidades: 1,
        }, 'prod')
        const [url] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('api.coordinadora.tech')
        expect(url).not.toContain('api-test')
      })

      it('default env reads process.env.COORDINADORA_ENV at call time', async () => {
        process.env.COORDINADORA_ENV = 'prod'
        primeTokenAnd({ flete_total: 0, dias_entrega: 0, tipo_trayecto: '' })
        // Call without explicit env argument
        await cotizar({
          codigoPais: '170', ciudadOrigen: '0', ciudadDestino: '0',
          pesoTotal: 1, valorDeclarado: 1, unidades: 1,
        })
        const [url] = fetchMock.mock.calls[1] as [string, RequestInit]
        expect(url).toContain('api.coordinadora.tech')
      })
    })
    ```

    Save the file. Tests will fail until Task 2.

    Commit message: `test(coordinadora-api): add wrapper test suite (RED)`
  </action>
  <verify>
    <automated>test -f src/lib/carriers/coordinadora/__tests__/wrappers.test.ts &amp;&amp; grep -c "describe(" src/lib/carriers/coordinadora/__tests__/wrappers.test.ts | awk '{exit ($1 &gt;= 4 ? 0 : 1)}'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/__tests__/wrappers.test.ts` exists
    - Contains 4+ `describe(` blocks (cotizar, createGuia, imprimirEtiqueta, env discriminator)
    - Contains 10+ `it(` cases including the COORDINADORA_GUIAS_PATH fallback tests
    - File committed (RED — wrappers don't exist yet)
  </acceptance_criteria>
  <done>Wrapper test scaffold committed. Tests will fail; Task 2 makes them pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create cotizar.ts, create-guia.ts, imprimir-etiqueta.ts (GREEN)</name>
  <files>src/lib/carriers/coordinadora/cotizar.ts, src/lib/carriers/coordinadora/create-guia.ts, src/lib/carriers/coordinadora/imprimir-etiqueta.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Code Examples lines 966-993 (cotizar canonical)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 172-209 (service wrapper pattern)
    - src/lib/carriers/envia-api.ts (analog fetch wrapper)
    - src/lib/carriers/coordinadora/client.ts (Plan 04 — getToken + BASE_URLS)
    - src/lib/carriers/coordinadora/types.ts (Plan 03 — types to import)
    - src/lib/carriers/coordinadora/__tests__/wrappers.test.ts (Task 1 — assertions to satisfy)
  </read_first>
  <behavior>
    - Three single-purpose modules, each exports one function
    - All use `AbortSignal.timeout(15_000)` (15s — Coordinadora prod latency unknown)
    - All throw on non-2xx with `Coordinadora <path> <status>: <body>` message
    - createGuia uses `process.env.COORDINADORA_GUIAS_PATH ?? '/guias/crear'` (D-37 #5 unblock)
    - Default env arg reads `process.env.COORDINADORA_ENV` at CALL time (not at import time)
  </behavior>
  <action>
    **Create `src/lib/carriers/coordinadora/cotizar.ts`**:

    ```typescript
    /**
     * Coordinadora /cotizador/nacional wrapper (D-14).
     * PDF: API Cotizador Nacional.pdf
     */
    import { getToken, BASE_URLS } from './client'
    import type { Env, CotizarRequest, CotizarResponse } from './types'

    export async function cotizar(
      req: CotizarRequest,
      env: Env = (process.env.COORDINADORA_ENV ?? 'test') as Env,
    ): Promise<CotizarResponse> {
      const token = await getToken(env)
      const res = await fetch(`${BASE_URLS[env]}/cotizador/nacional`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '<unreadable>')
        throw new Error(`Coordinadora /cotizador/nacional ${res.status}: ${text}`)
      }
      return (await res.json()) as CotizarResponse
    }
    ```

    **Create `src/lib/carriers/coordinadora/create-guia.ts`**:

    ```typescript
    /**
     * Coordinadora guías wrapper — Estándar (nivelServicio=1) + RCE (nivelServicio=22) (D-14).
     * PDF: Documentacion Creacion de Guía Estándar y RCE.pdf
     *
     * URL path is configurable via COORDINADORA_GUIAS_PATH env var because
     * Coordinadora hasn't confirmed the exact path (D-37 #5).
     */
    import { getToken, BASE_URLS } from './client'
    import type { Env, CreateGuiaRequest, GuiaResponse } from './types'

    export async function createGuia(
      req: CreateGuiaRequest,
      env: Env = (process.env.COORDINADORA_ENV ?? 'test') as Env,
    ): Promise<GuiaResponse> {
      const token = await getToken(env)
      const path = process.env.COORDINADORA_GUIAS_PATH ?? '/guias/crear'
      const res = await fetch(`${BASE_URLS[env]}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '<unreadable>')
        throw new Error(`Coordinadora ${path} ${res.status}: ${text}`)
      }
      return (await res.json()) as GuiaResponse
    }
    ```

    **Create `src/lib/carriers/coordinadora/imprimir-etiqueta.ts`**:

    ```typescript
    /**
     * Coordinadora /etiquetas/imprimir wrapper (D-14).
     * PDF: Servicio etiquetas.pdf
     * Returns base64-encoded PDF in etiqueta_base64 field (PDF shape).
     */
    import { getToken, BASE_URLS } from './client'
    import type { Env, ImprimirEtiquetaRequest, ImprimirEtiquetaResponse } from './types'

    export async function imprimirEtiqueta(
      req: ImprimirEtiquetaRequest,
      env: Env = (process.env.COORDINADORA_ENV ?? 'test') as Env,
    ): Promise<ImprimirEtiquetaResponse> {
      const token = await getToken(env)
      const res = await fetch(`${BASE_URLS[env]}/etiquetas/imprimir`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '<unreadable>')
        throw new Error(`Coordinadora /etiquetas/imprimir ${res.status}: ${text}`)
      }
      return (await res.json()) as ImprimirEtiquetaResponse
    }
    ```

    Run `npx vitest run src/lib/carriers/coordinadora/__tests__/wrappers.test.ts` — expect all 10+ tests green.

    Commit message: `feat(coordinadora-api): add cotizar/createGuia/imprimirEtiqueta wrappers (GREEN)`
  </action>
  <verify>
    <automated>npx vitest run src/lib/carriers/coordinadora/__tests__/wrappers.test.ts 2&gt;&amp;1 | tail -10 | grep -E "Test Files\s+1 passed"</automated>
  </verify>
  <acceptance_criteria>
    - Files `cotizar.ts`, `create-guia.ts`, `imprimir-etiqueta.ts` exist
    - Each exports exactly one named function (`cotizar`, `createGuia`, `imprimirEtiqueta`)
    - Each calls `getToken(env)` (grep `getToken\(env\)` in each file returns 1)
    - Each uses `AbortSignal.timeout(15_000)` (grep returns 3 across all 3 files)
    - createGuia uses `process.env.COORDINADORA_GUIAS_PATH ?? '/guias/crear'` exactly (grep returns 1)
    - All wrappers test suite passes (12+ tests)
    - Zero `createAdminClient` or `@supabase/supabase-js` imports (Regla 3)
    - Zero `any` types (grep `: any\b` returns 0)
  </acceptance_criteria>
  <done>All 3 service wrappers implemented and tested. Callers (Inngest functions, server actions) can import and use them.</done>
</task>

<task type="auto">
  <name>Task 3: Create barrel index.ts for clean downstream imports</name>
  <files>src/lib/carriers/coordinadora/index.ts</files>
  <read_first>
    - src/lib/carriers/coordinadora/client.ts, cotizar.ts, create-guia.ts, imprimir-etiqueta.ts, status-codes.ts, tenant.ts, types.ts (already in context — see what they export)
  </read_first>
  <action>
    Create `src/lib/carriers/coordinadora/index.ts` with these re-exports:

    ```typescript
    /**
     * Coordinadora carrier module — public API.
     * Barrel exports for downstream callers (Inngest functions, server actions, route handlers).
     *
     * Internal modules (pub-sub-envelope, env reader if added) are NOT re-exported —
     * they're consumed by the webhook receiver directly.
     */

    // HTTP client + token cache
    export { getToken, BASE_URLS, TOKEN_TTL_MS, _resetTokenCacheForTests } from './client'

    // Service wrappers (D-14)
    export { cotizar } from './cotizar'
    export { createGuia } from './create-guia'
    export { imprimirEtiqueta } from './imprimir-etiqueta'

    // Status code mapping
    export {
      COORDINADORA_STATUS_CODES,
      COORDINADORA_NOVEDAD_CODES,
      mapStatusCode,
      mapNovedadCode,
    } from './status-codes'
    export type { CoordinadoraStatusLabel } from './status-codes'

    // Multi-tenant
    export { resolveWorkspaceFromNit, SOMNIO_WORKSPACE_ID, MORFX_NIT } from './tenant'

    // Types (re-exported for convenience)
    export type {
      Env,
      OAuthTokenResponse,
      CotizarRequest,
      CotizarRequestCO,
      CotizarRequestMX,
      CotizarResponse,
      GuiaBase,
      GuiaEstandarRequest,
      GuiaRCERequest,
      CreateGuiaRequest,
      GuiaResponse,
      ImprimirEtiquetaRequest,
      ImprimirEtiquetaResponse,
      PubSubEnvelope,
      CoordinadoraEvent,
      CoordinadoraEventWithoutNovedad,
      CoordinadoraEventWithNovedad,
    } from './types'
    ```

    NOTE: Pub/Sub envelope helpers (`isPubSubEnvelope`, `decodePubSubPayload`) are NOT exported here — they are added in Plan 07. We can leave a TODO in this file OR add them in Plan 07 by editing this barrel.

    Run `npx tsc --noEmit` to verify the barrel compiles (re-export type/value distinction must be correct).

    Commit message: `feat(coordinadora-api): add barrel index.ts re-exports`
  </action>
  <verify>
    <automated>test -f src/lib/carriers/coordinadora/index.ts &amp;&amp; npx tsc --noEmit 2&gt;&amp;1 | grep -E "src/lib/carriers/coordinadora/index\.ts" | grep -v "^$" | head -5 ; npx vitest run src/lib/carriers/coordinadora/__tests__/ 2&gt;&amp;1 | tail -5 | grep -E "Test Files\s+[0-9]+ passed"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/index.ts` exists
    - Re-exports `getToken`, `BASE_URLS`, `cotizar`, `createGuia`, `imprimirEtiqueta`, `mapStatusCode`, `mapNovedadCode`, `resolveWorkspaceFromNit` (grep each)
    - `npx tsc --noEmit` produces no errors for this file
    - Full coordinadora test suite passes (status-codes + tenant + client-token-cache + wrappers — 30+ tests total)
  </acceptance_criteria>
  <done>Barrel exports created. Downstream code can `import { cotizar, createGuia } from '@/lib/carriers/coordinadora'`.</done>
</task>

</tasks>

<verification>
- All wrappers + barrel created
- Full coordinadora `__tests__/` suite passes
- TypeScript compiles clean
- Regla 3 grep clean (no createAdminClient anywhere in `src/lib/carriers/coordinadora/`)
</verification>

<success_criteria>
1. `cotizar.ts`, `create-guia.ts`, `imprimir-etiqueta.ts`, `index.ts` created and committed
2. Vitest passes for all 4 test files in `src/lib/carriers/coordinadora/__tests__/`
3. D-14 satisfied — 3 wrappers with internal `getToken` calls
4. D-37 #5 mitigated via `COORDINADORA_GUIAS_PATH` env var override
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/05-SUMMARY.md` documenting:
- 4 files created (3 wrappers + barrel)
- Full Vitest count for `src/lib/carriers/coordinadora/__tests__/`
- Commit SHAs
- Confirmation `npx tsc --noEmit` clean
</output>
