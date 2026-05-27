---
phase: coordinadora-api-integration
plan: 04
type: execute
wave: 1
depends_on: [01, 02, 03]
files_modified:
  - src/lib/carriers/coordinadora/client.ts
  - src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts
autonomous: true
requirements: []
must_haves:
  truths:
    - "client.ts exports getToken(env) + BASE_URLS + _resetTokenCacheForTests"
    - "Token cache is module-scoped Map<Env, TokenEntry> with 55min TTL (D-13)"
    - "Calling getToken twice within TTL returns same token (1 fetch call)"
    - "Calling getToken after TTL expiry refreshes (2 fetch calls)"
    - "Both 'access_token' and 'acces_token' keys accepted from response (Pitfall 1)"
    - "Missing token in response throws clear error"
    - "Token never logged (D-28 PII redaction)"
  artifacts:
    - path: "src/lib/carriers/coordinadora/client.ts"
      provides: "getToken + BASE_URLS + _resetTokenCacheForTests"
      exports: ["getToken", "BASE_URLS", "TOKEN_TTL_MS", "_resetTokenCacheForTests"]
    - path: "src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts"
      provides: "Vitest suite for TTL hit, miss, refresh, error, both token-key variants"
  key_links:
    - from: "client.ts"
      to: "Coordinadora /oauth/token endpoint"
      via: "native fetch + Basic Auth header + grant_type=client_credentials body"
      pattern: "AbortSignal.timeout(10000) + retry-throw (Inngest handles retry)"
---

<objective>
Implement the OAuth2 token cache module — the foundation for all 3 outbound API wrappers (cotizar, createGuia, imprimirEtiqueta in Plan 05). Mirrors `src/lib/domain/platform-config.ts:60-103` (Map cache with TTL) + `src/lib/carriers/envia-api.ts:35-47` (native fetch wrapper).

Per D-13: module-scoped `Map<Env, TokenEntry>`, 55min TTL hardcoded (NOT read from response — Pitfall 1), cold-start refresh races accepted (NO mutex).

Per Pitfall 1: response may use `access_token` OR `acces_token` (PDF typo) — accept both.

Per D-28: NEVER log the token value. Log only env + outcome.
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
@src/lib/domain/platform-config.ts
@src/lib/audit/logger.ts
@src/lib/carriers/coordinadora/types.ts

<interfaces>
From src/lib/carriers/coordinadora/types.ts (created in Plan 03):
```typescript
export type Env = 'test' | 'prod'

export interface OAuthTokenResponse {
  access_token?: string
  acces_token?: string                // Pitfall 1 — PDF typo
  expires_in?: string | number         // Ignored — Pitfall 1
  token_type?: string
}
```

Logger pattern from src/lib/audit/logger.ts:
```typescript
import { createModuleLogger } from '@/lib/audit/logger'
const logger = createModuleLogger('coordinadora-client')
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Write client-token-cache.test.ts (TDD — tests first)</name>
  <files>src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 1 lines 233-310 (canonical implementation)
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pitfall 1 lines 829-836 (token-key variants)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 695-705 (test cases by file)
    - src/lib/domain/__tests__/conversations.test.ts (vitest mock pattern reference)
  </read_first>
  <behavior>
    - Test 1: first call → fetch invoked once, returns token, caches it
    - Test 2: second call within TTL → no fetch, returns cached token
    - Test 3: call after TTL expiry (via vi.useFakeTimers + vi.advanceTimersByTime) → fetch invoked again
    - Test 4: response with `access_token` key works
    - Test 5: response with `acces_token` key works (Pitfall 1 — PDF typo)
    - Test 6: response missing both keys throws clear error
    - Test 7: fetch non-2xx throws with status + body in message
    - Test 8: missing env vars (no CLIENT_ID/SECRET) throws clear error
    - Test 9: separate cache entries for 'test' vs 'prod' (independent)
  </behavior>
  <action>
    Create `src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts` with this content:

    ```typescript
    import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

    // Mock fetch globally — must come BEFORE importing the module under test
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    import { getToken, _resetTokenCacheForTests, TOKEN_TTL_MS } from '../client'

    const ORIGINAL_ENV = { ...process.env }

    beforeEach(() => {
      _resetTokenCacheForTests()
      fetchMock.mockReset()
      process.env.COORDINADORA_CLIENT_ID = 'test-client-id'
      process.env.COORDINADORA_CLIENT_SECRET = 'test-client-secret'
      vi.useFakeTimers({ now: new Date('2026-05-26T12:00:00Z') })
    })

    afterEach(() => {
      vi.useRealTimers()
      process.env = { ...ORIGINAL_ENV }
    })

    function mockTokenResponse(body: Record<string, unknown>, status = 200): void {
      fetchMock.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
      })
    }

    describe('getToken — cache behavior (D-13)', () => {
      it('first call hits fetch and caches the token', async () => {
        mockTokenResponse({ access_token: 'tok_abc', expires_in: '3599' })
        const token = await getToken('test')
        expect(token).toBe('tok_abc')
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })

      it('second call within TTL returns cached token (no fetch)', async () => {
        mockTokenResponse({ access_token: 'tok_abc' })
        await getToken('test')
        const cached = await getToken('test')
        expect(cached).toBe('tok_abc')
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })

      it('call after TTL expiry refreshes the token', async () => {
        mockTokenResponse({ access_token: 'tok_first' })
        await getToken('test')

        // Advance past TTL (55min + 1ms)
        vi.advanceTimersByTime(TOKEN_TTL_MS + 1)

        mockTokenResponse({ access_token: 'tok_second' })
        const refreshed = await getToken('test')
        expect(refreshed).toBe('tok_second')
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })

      it('TOKEN_TTL_MS is exactly 55 minutes (D-13)', () => {
        expect(TOKEN_TTL_MS).toBe(55 * 60 * 1000)
      })

      it('test and prod caches are independent', async () => {
        mockTokenResponse({ access_token: 'tok_test' })
        const t = await getToken('test')
        mockTokenResponse({ access_token: 'tok_prod' })
        const p = await getToken('prod')
        expect(t).toBe('tok_test')
        expect(p).toBe('tok_prod')
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
    })

    describe('getToken — response key variants (Pitfall 1)', () => {
      it('accepts standard access_token key', async () => {
        mockTokenResponse({ access_token: 'tok_standard' })
        expect(await getToken('test')).toBe('tok_standard')
      })

      it('accepts PDF-typo acces_token key (missing s)', async () => {
        mockTokenResponse({ acces_token: 'tok_typo' })
        expect(await getToken('test')).toBe('tok_typo')
      })

      it('throws when both token keys are missing', async () => {
        mockTokenResponse({ expires_in: '3599' })
        await expect(getToken('test')).rejects.toThrow(/missing access_token/)
      })
    })

    describe('getToken — error handling', () => {
      it('throws when fetch returns non-2xx with status + body in message', async () => {
        mockTokenResponse({ error: 'invalid_client' }, 401)
        await expect(getToken('test')).rejects.toThrow(/401/)
      })

      it('throws when COORDINADORA_CLIENT_ID is missing', async () => {
        delete process.env.COORDINADORA_CLIENT_ID
        await expect(getToken('test')).rejects.toThrow(/COORDINADORA_CLIENT_ID/)
      })

      it('throws when COORDINADORA_CLIENT_SECRET is missing', async () => {
        delete process.env.COORDINADORA_CLIENT_SECRET
        await expect(getToken('test')).rejects.toThrow(/COORDINADORA_CLIENT_SECRET/)
      })
    })

    describe('getToken — Basic Auth header construction', () => {
      it('builds Basic Auth header from client_id:client_secret', async () => {
        process.env.COORDINADORA_CLIENT_ID = 'client123'
        process.env.COORDINADORA_CLIENT_SECRET = 'secret456'
        mockTokenResponse({ access_token: 'tok' })
        await getToken('test')
        const expectedAuth = `Basic ${Buffer.from('client123:secret456').toString('base64')}`
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('/oauth/token'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ Authorization: expectedAuth }),
          })
        )
      })

      it('targets api-test.coordinadora.tech when env=test', async () => {
        mockTokenResponse({ access_token: 'tok' })
        await getToken('test')
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining('api-test.coordinadora.tech'),
          expect.anything()
        )
      })

      it('targets api.coordinadora.tech when env=prod', async () => {
        mockTokenResponse({ access_token: 'tok' })
        await getToken('prod')
        const call = fetchMock.mock.calls[0]?.[0] as string
        expect(call).toContain('api.coordinadora.tech')
        expect(call).not.toContain('api-test')
      })
    })
    ```

    Save the file. Tests will fail until Task 2 creates `client.ts`.

    Commit message: `test(coordinadora-api): add client token-cache test suite (RED)`
  </action>
  <verify>
    <automated>test -f src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts &amp;&amp; grep -c "describe(" src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts | awk '{exit ($1 &gt;= 4 ? 0 : 1)}'</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts` exists
    - Contains 4+ `describe(` blocks (cache behavior, key variants, error handling, Basic Auth)
    - Contains 12+ `it(` test cases
    - Imports `getToken`, `_resetTokenCacheForTests`, `TOKEN_TTL_MS` from `../client`
    - Mocks global `fetch` via `vi.stubGlobal`
    - Uses `vi.useFakeTimers` for TTL expiry test
    - File committed to git (RED — implementation pending in Task 2)
  </acceptance_criteria>
  <done>Test scaffold written with 12 test cases. Running vitest now will fail (no client.ts yet). Task 2 implements to GREEN.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Create client.ts (GREEN — make tests pass)</name>
  <files>src/lib/carriers/coordinadora/client.ts</files>
  <read_first>
    - .planning/standalone/coordinadora-api-integration/RESEARCH.md §Pattern 1 lines 233-310 (verbatim source)
    - .planning/standalone/coordinadora-api-integration/PATTERNS.md lines 111-168 (deviations from analogs)
    - src/lib/domain/platform-config.ts:60-103 (Map cache TTL analog)
    - src/lib/carriers/envia-api.ts:35-47 (fetch wrapper analog with AbortSignal.timeout)
    - src/lib/audit/logger.ts (createModuleLogger usage)
    - src/lib/carriers/coordinadora/types.ts (Env type + OAuthTokenResponse — created in Plan 03)
    - src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts (created in Task 1 — assertions to satisfy)
  </read_first>
  <behavior>
    - Module exports: `getToken(env: Env): Promise<string>`, `BASE_URLS`, `TOKEN_TTL_MS`, `_resetTokenCacheForTests()`
    - Module-scoped `Map<Env, { token: string, expiresAt: number }>` cache
    - Cache hit (`expiresAt > Date.now()`) → return cached, NO fetch, NO log
    - Cache miss → fetch + cache + log info `coordinadora token refreshed` (NO token value in log)
    - Throws `Error` with clear message on: missing env vars, non-2xx, missing token in response
    - 10s AbortSignal timeout (matches envia-api.ts)
    - Pure async function — caller (Inngest function with retries) handles retry
  </behavior>
  <action>
    Create `src/lib/carriers/coordinadora/client.ts` with this VERBATIM content (RESEARCH §Pattern 1 lines 233-310 with the import + Env type sourced from types.ts):

    ```typescript
    /**
     * Coordinadora HTTP client — OAuth2 token cache (D-13, D-15).
     *
     * Module-scoped Map cache, 55min TTL, per-lambda-instance scope (resets on cold start).
     * No mutex on refresh races — cold-start storms cause extra refreshes; Coordinadora
     * doesn't document a rate limit. Mitigation if 429s arise: V1.1 keepalive cron.
     *
     * Standalone: coordinadora-api-integration
     */

    import { createModuleLogger } from '@/lib/audit/logger'
    import type { Env, OAuthTokenResponse } from './types'

    const logger = createModuleLogger('coordinadora-client')

    /** Base URLs hardcoded (D-16). Coordinadora PDF has typo `api-devcoordinadora.tech` — IGNORE. */
    export const BASE_URLS: Record<Env, string> = {
      test: 'https://api-test.coordinadora.tech',
      prod: 'https://api.coordinadora.tech',
    }

    /** Token cache TTL — 55min (5min safety vs 60min real TTL, D-13). */
    export const TOKEN_TTL_MS = 55 * 60 * 1000

    interface TokenEntry {
      token: string
      expiresAt: number
    }

    /**
     * Module-scoped cache. Lives per-lambda-instance (reset on cold start).
     * One entry per env (test/prod). No cross-instance sync — accept extra
     * refreshes during cold-start storms (D-13 explicit).
     */
    const tokenCache = new Map<Env, TokenEntry>()

    /**
     * Get a valid OAuth2 bearer token for Coordinadora API calls.
     *
     * Cache-hit returns the existing token (99%+ of calls).
     * Cache-miss POSTs to /oauth/token with Basic Auth, caches for 55min.
     *
     * Throws on: missing env vars, non-2xx response, missing access_token in response body.
     * Caller (Inngest function with retries=2) handles retry semantics — DO NOT swallow.
     */
    export async function getToken(env: Env): Promise<string> {
      const now = Date.now()
      const cached = tokenCache.get(env)
      if (cached && cached.expiresAt > now) {
        // Cache-hit: skip log to avoid noise (99%+ of calls).
        return cached.token
      }

      const clientId = process.env.COORDINADORA_CLIENT_ID
      const clientSecret = process.env.COORDINADORA_CLIENT_SECRET
      if (!clientId) {
        throw new Error('Missing COORDINADORA_CLIENT_ID env var')
      }
      if (!clientSecret) {
        throw new Error('Missing COORDINADORA_CLIENT_SECRET env var')
      }
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

      const url = `${BASE_URLS[env]}/oauth/token?grant_type=client_credentials`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(10_000),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '<unreadable>')
        throw new Error(`Coordinadora /oauth/token ${res.status}: ${text}`)
      }

      // PDF Pitfall 1: response may use `access_token` (correct) OR `acces_token` (typo).
      const json = (await res.json()) as OAuthTokenResponse
      const token = json.access_token ?? json.acces_token
      if (!token) {
        throw new Error('Coordinadora /oauth/token: missing access_token in response')
      }

      tokenCache.set(env, { token, expiresAt: now + TOKEN_TTL_MS })
      // D-28: never log the token value. Only env + outcome.
      logger.info({ env }, 'coordinadora token refreshed')
      return token
    }

    /** Test-only helper. Do NOT call from production code. */
    export function _resetTokenCacheForTests(): void {
      tokenCache.clear()
    }
    ```

    Run `npx vitest run src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts` — expect all 12+ tests green.

    Verify D-28 compliance: `grep -E "logger\.(info|warn|error).*token" src/lib/carriers/coordinadora/client.ts` should show only `'coordinadora token refreshed'` (no token VALUE logged — just the literal label).

    Commit message: `feat(coordinadora-api): add OAuth2 token cache client (GREEN)`
  </action>
  <verify>
    <automated>npx vitest run src/lib/carriers/coordinadora/__tests__/client-token-cache.test.ts 2&gt;&amp;1 | tail -20 | grep -E "Test Files\s+1 passed"</automated>
  </verify>
  <acceptance_criteria>
    - File `src/lib/carriers/coordinadora/client.ts` exists
    - Exports `getToken`, `BASE_URLS`, `TOKEN_TTL_MS`, `_resetTokenCacheForTests` (grep each)
    - `TOKEN_TTL_MS` literal value is `55 * 60 * 1000` (verified by test)
    - `BASE_URLS.test === 'https://api-test.coordinadora.tech'` (verified by test)
    - `BASE_URLS.prod === 'https://api.coordinadora.tech'` (verified by test, no 'api-test' in prod URL)
    - Uses `AbortSignal.timeout(10_000)` (grep `AbortSignal.timeout(10_000)` returns 1+)
    - Accepts both `access_token` and `acces_token` keys (verified by tests)
    - Logger does NOT include token VALUE in any log statement (grep `logger.*\${.*token` returns 0 — only label literal)
    - All 12+ Vitest cases pass (Task 1 suite green)
    - Zero `createAdminClient` or `@supabase/supabase-js` imports (Regla 3 — grep returns 0)
    - Zero `any` types (grep `: any\b|: any;` returns 0)
  </acceptance_criteria>
  <done>Token cache implementation passes all tests. Plans 05+ can call `getToken(env)` from outbound wrappers.</done>
</task>

</tasks>

<verification>
- All tests pass: `npx vitest run src/lib/carriers/coordinadora/__tests__/`
- D-28 token-redaction grep clean
- Regla 3 grep clean (no createAdminClient in carriers/coordinadora/)
</verification>

<success_criteria>
1. `client.ts` + `client-token-cache.test.ts` created and committed
2. Vitest suite for Plan 03 + Plan 04 combined passes (status-codes + tenant + client-token-cache)
3. Cache semantics verified: hit, miss, refresh after TTL, both env entries independent
4. Pitfall 1 (acces_token typo) handled
5. D-28 PII redaction enforced (token never appears in log args)
</success_criteria>

<output>
After completion, create `.planning/standalone/coordinadora-api-integration/04-SUMMARY.md` documenting:
- Files created (client.ts + test file)
- Vitest output (all coordinadora/__tests__/ pass count)
- Commit SHAs (2 — RED + GREEN)
- Confirmation D-28 grep clean
</output>
