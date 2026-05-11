---
phase: shopify-dev-dashboard-oauth
plan: 03
title: OAuth primitives — src/lib/shopify/oauth.ts (state JWT, HMAC HEX, exchange, webhooks)
wave: 1
depends_on: [1]
files_modified:
  - src/lib/shopify/oauth.ts
autonomous: true
estimated_minutes: 50
requirements_addressed: []
must_haves:
  truths:
    - "Existe `src/lib/shopify/oauth.ts` con: `SHOPIFY_SCOPES`, `signStateJwt`, `verifyStateJwt`, `generateNonce`, `verifyOauthCallbackHmac`, `buildAuthorizeUrl`, `exchangeCodeForToken`, `detectScopeDrift`, `createWebhooksAfterOauth`"
    - "`verifyOauthCallbackHmac` usa HEX digest (NO base64) sobre query params sorted alphabetically, RAW values, excluyendo `hmac` (Pitfall 1)"
    - "`verifyOauthCallbackHmac` usa `crypto.timingSafeEqual` (Pitfall 1 + best practice)"
    - "`SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'read_draft_orders']` exportado como const tuple"
    - "`getStateSecret()` throws si `SHOPIFY_OAUTH_STATE_SECRET` está vacío o tiene <32 chars (Assumption A2)"
    - "`createWebhooksAfterOauth` trata 422 como success (idempotency, Pitfall 9)"
    - "Module está separado de `src/lib/shopify/hmac.ts` (que sigue intacto para webhooks)"
  artifacts:
    - path: "src/lib/shopify/oauth.ts"
      provides: "Todos los primitives OAuth — sin side effects globales, funciones puras + fetch async"
      min_lines: 200
      exports: ["SHOPIFY_SCOPES", "ShopifyScope", "StatePayload", "signStateJwt", "verifyStateJwt", "generateNonce", "verifyOauthCallbackHmac", "buildAuthorizeUrl", "TokenExchangeResult", "exchangeCodeForToken", "detectScopeDrift", "WebhookCreationResult", "createWebhooksAfterOauth"]
  key_links:
    - from: "src/lib/shopify/oauth.ts"
      to: "jose (npm package, en package.json:68, NUNCA importado antes en src/)"
      via: "import { SignJWT, jwtVerify } from 'jose'"
      pattern: "from 'jose'"
    - from: "src/lib/shopify/oauth.ts"
      to: "node crypto built-in"
      via: "import crypto from 'crypto' (estilo del proyecto, NO 'node:crypto')"
      pattern: "^import crypto from 'crypto'"
---

<objective>
Crear `src/lib/shopify/oauth.ts` — el módulo de primitives criptográficos y de red para el flujo OAuth. Hand-roll completo (NO `@shopify/shopify-api`). Usa `jose@6.1.3` (ya en package.json, primer uso en `src/`) + `node:crypto` (mismo estilo que `src/lib/shopify/hmac.ts`).

**Críticamente: este módulo es SEPARADO de `src/lib/shopify/hmac.ts`.** El HMAC del callback OAuth usa **HEX** sobre query params; el de webhooks usa **BASE64** sobre el body. Mezclarlos es el bug #1 reportado en foros Shopify (Pitfall 1).

Purpose: encapsular toda la criptografía OAuth (state JWT, HMAC HEX, code-for-token exchange, webhook creation) en funciones pequeñas, testables, importables tanto desde el server action (Plan 04) como desde el route handler (Plan 05).

Output: módulo standalone funcional. Plan 04 + Plan 05 lo consumen en Wave 2.

**Este plan corre en PARALELO con Plan 02 — son independientes.**
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/standalone/shopify-dev-dashboard-oauth/CONTEXT.md
@.planning/standalone/shopify-dev-dashboard-oauth/RESEARCH.md
@.planning/standalone/shopify-dev-dashboard-oauth/PATTERNS.md
@.planning/standalone/shopify-dev-dashboard-oauth/01-SUMMARY.md
@CLAUDE.md
@src/lib/shopify/hmac.ts
@src/lib/shopify/connection-test.ts
@package.json

<interfaces>
<!-- Targets the executor must produce. From RESEARCH.md Examples 1-5. -->

```typescript
// Module exports (signatures the executor MUST produce verbatim or near-verbatim):

export const SHOPIFY_SCOPES: readonly ['read_orders', 'read_customers', 'read_draft_orders']
export type ShopifyScope = typeof SHOPIFY_SCOPES[number]

export interface StatePayload {
  workspaceId: string
  userId: string
  nonce: string
}

export function generateNonce(): string  // crypto.randomUUID()
export function signStateJwt(payload: StatePayload): Promise<string>
export function verifyStateJwt(token: string): Promise<StatePayload>  // throws if invalid/expired
export function verifyOauthCallbackHmac(
  params: Record<string, string>,
  receivedHmac: string,
  clientSecret: string
): boolean
export function buildAuthorizeUrl(opts: {
  shop: string
  state: string
  redirectUri: string
}): string

export interface TokenExchangeResult {
  accessToken: string
  scope: string
}
export function exchangeCodeForToken(opts: {
  shop: string
  code: string
}): Promise<TokenExchangeResult>  // throws on non-2xx

export function detectScopeDrift(returnedScope: string, required: readonly string[]): string[]

export interface WebhookCreationResult {
  topic: string
  ok: boolean
  status: number
  error?: string
}
export function createWebhooksAfterOauth(opts: {
  shop: string
  accessToken: string
  webhookUrl: string
}): Promise<WebhookCreationResult[]>
```

From `src/lib/shopify/hmac.ts:1-63` (the WEBHOOK HMAC — DO NOT modify, but copy the outer shape — try/catch + timingSafeEqual):
```typescript
import crypto from 'crypto'   // ← note: 'crypto' (project style), NOT 'node:crypto'

export function verifyShopifyHmac(rawBody: string, hmacHeader: string, apiSecret: string): boolean {
  const generatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64')          // ← BASE64 (webhook)
  try {
    return crypto.timingSafeEqual(Buffer.from(generatedHmac), Buffer.from(hmacHeader))
  } catch {
    return false
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Skeleton + state JWT (sign + verify + nonce + getStateSecret helper)</name>
  <files>src/lib/shopify/oauth.ts</files>
  <read_first>
    - PATTERNS.md §"`src/lib/shopify/oauth.ts`" — sección entera (Imports pattern, Adaptation note `crypto` style)
    - RESEARCH.md §Code Examples §Example 1 (líneas 436-484) — implementación verbatim
    - RESEARCH.md §Pitfall 5 (Edge runtime crashes crypto — el archivo no declara runtime; el route handler que lo importa sí)
    - CONTEXT.md D-08 (state como JWT con payload `{workspace_id, user_id, nonce, exp: now+10min}`)
    - `package.json` línea 68 (confirmar `jose@^6.1.3`)
    - `src/lib/shopify/hmac.ts:1` (confirmar `import crypto from 'crypto'` — NO `'node:crypto'`)
  </read_first>
  <action>
    Crear `src/lib/shopify/oauth.ts` con el header y los primitives de state JWT:

    1. **File header comment**:
       ```typescript
       // ============================================================================
       // Shopify OAuth Primitives (Standalone shopify-dev-dashboard-oauth)
       //
       // CRITICAL: This file is SEPARATE from src/lib/shopify/hmac.ts.
       //   - verifyOauthCallbackHmac (here): HEX digest over sorted query params (OAuth)
       //   - verifyShopifyHmac (hmac.ts):    BASE64 digest over raw body  (webhook)
       //   These use DIFFERENT algorithms — DO NOT MERGE.
       //   See RESEARCH.md Pitfall 1 + Q4. Shopify docs quote:
       //     "The HMAC verification procedure for authorization code grant is
       //      different from the procedure for verifying webhooks."
       //
       // Runtime: this module uses node:crypto (createHmac, timingSafeEqual,
       //   randomUUID). The route handler that imports it MUST declare
       //   `export const runtime = 'nodejs'`. See RESEARCH.md Pitfall 5.
       // ============================================================================
       ```

    2. **Imports**:
       ```typescript
       import crypto from 'crypto'                    // project style — see hmac.ts:1 (NOT 'node:crypto')
       import { SignJWT, jwtVerify } from 'jose'      // first use of jose in src/ (already in package.json)
       ```

    3. **Constants + helpers**:
       ```typescript
       const ISSUER = 'morfx-shopify-oauth'
       const TTL_SECONDS = 600 // 10 minutes (D-08)

       function getStateSecret(): Uint8Array {
         const secret = process.env.SHOPIFY_OAUTH_STATE_SECRET
         if (!secret || secret.length < 32) {
           throw new Error('SHOPIFY_OAUTH_STATE_SECRET must be set and >= 32 chars (Assumption A2)')
         }
         return new TextEncoder().encode(secret)
       }

       export function generateNonce(): string {
         return crypto.randomUUID()
       }
       ```

    4. **`StatePayload` interface + `signStateJwt` + `verifyStateJwt`** (copiar RESEARCH Example 1 líneas 452-479 verbatim):
       ```typescript
       export interface StatePayload {
         workspaceId: string
         userId: string
         nonce: string
       }

       export async function signStateJwt(payload: StatePayload): Promise<string> {
         return await new SignJWT({
           workspaceId: payload.workspaceId,
           userId: payload.userId,
           nonce: payload.nonce,
         })
           .setProtectedHeader({ alg: 'HS256' })
           .setIssuer(ISSUER)
           .setSubject(payload.workspaceId)
           .setIssuedAt()
           .setExpirationTime(`${TTL_SECONDS}s`)
           .sign(getStateSecret())
       }

       export async function verifyStateJwt(token: string): Promise<StatePayload> {
         const { payload } = await jwtVerify(token, getStateSecret(), { issuer: ISSUER })
         // jose throws if exp expired or signature invalid; reaching here = valid
         if (!payload.workspaceId || !payload.userId || !payload.nonce) {
           throw new Error('state-malformed')
         }
         return {
           workspaceId: String(payload.workspaceId),
           userId: String(payload.userId),
           nonce: String(payload.nonce),
         }
       }
       ```

    **Notas:**
    - `getStateSecret` se llama lazy (dentro de sign/verify), NO al top-level — así no crashea el módulo en build time si la var falta; solo crashea cuando alguien intenta OAuth.
    - `HS256` simétrico (D-08, Pattern 2 de RESEARCH).
    - `setSubject(workspaceId)` — extra defense-in-depth: `sub` claim contiene el workspace.

    Decisión D referenciada: D-08 (state JWT con payload + exp + nonce).
  </action>
  <verify>
    <automated>test -f src/lib/shopify/oauth.ts && echo "EXISTS"</automated>
    <automated>grep -c "^import crypto from 'crypto'$" src/lib/shopify/oauth.ts</automated>
    <automated>grep -c "from 'jose'" src/lib/shopify/oauth.ts</automated>
    <automated>grep -E "export (async function|function|interface|const) (signStateJwt|verifyStateJwt|generateNonce|StatePayload|ISSUER|TTL_SECONDS)" src/lib/shopify/oauth.ts | wc -l</automated>
    <automated>grep "must be set and >= 32 chars" src/lib/shopify/oauth.ts</automated>
  </verify>
  <done>
    - Archivo creado con header doc claro (incluye warning Pitfall 1 + 5)
    - `import crypto from 'crypto'` (NO `'node:crypto'`) — match estilo proyecto
    - `signStateJwt`, `verifyStateJwt`, `generateNonce`, `StatePayload` exportados
    - `getStateSecret()` privado, throws si <32 chars
    - Uses jose `SignJWT` + `jwtVerify` con HS256, issuer, sub, iat, exp 600s
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: `verifyOauthCallbackHmac` (HEX, sorted params, timingSafeEqual) + `SHOPIFY_SCOPES` + `buildAuthorizeUrl`</name>
  <files>src/lib/shopify/oauth.ts</files>
  <read_first>
    - RESEARCH.md §Pitfall 1 (CRITICAL — HMAC HEX vs Base64)
    - RESEARCH.md §Pitfall 6 (URL encoding in HMAC message — usar RAW values, NO `URLSearchParams.toString()`)
    - RESEARCH.md §Code Examples §Example 2 (líneas 486-543) — implementación verbatim
    - RESEARCH.md §Code Examples §Example 3 (líneas 545-571) — buildAuthorizeUrl
    - PATTERNS.md §"Pattern F — HMAC Validation Discipline" (separate functions)
    - CONTEXT.md D-07 (HMAC validation obligatoria con `SHOPIFY_CLIENT_SECRET`) + D-05 (scopes)
    - https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
  </read_first>
  <action>
    APPEND a `src/lib/shopify/oauth.ts` (mismo archivo):

    1. **`SHOPIFY_SCOPES` + `ShopifyScope` type** (RESEARCH Example 3 líneas 549-550):
       ```typescript
       /** Scopes solicitados (D-05). Si Shopify retorna scope subset → reject as 'denied' (Pitfall 2). */
       export const SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'read_draft_orders'] as const
       export type ShopifyScope = typeof SHOPIFY_SCOPES[number]
       ```

    2. **`verifyOauthCallbackHmac`** — copy RESEARCH Example 2 verbatim, incluyendo el JSDoc completo (líneas 490-510). El JSDoc DEBE incluir:
       - "CRITICAL: DIFFERENT from webhook HMAC validation" + diferencias bullet
       - Algoritmo step-by-step (1-5)
       - `@see` link a Shopify docs

       Body (líneas 511-542):
       ```typescript
       export function verifyOauthCallbackHmac(
         params: Record<string, string>,
         receivedHmac: string,
         clientSecret: string
       ): boolean {
         // Step 1: Remove hmac from params (do not mutate original)
         const filtered = { ...params }
         delete filtered.hmac

         // Step 2 + 3: Sort alphabetically and build message with RAW (decoded) values.
         // CRITICAL (Pitfall 6): Do NOT use URLSearchParams.toString() — it re-encodes.
         // The caller hands us already-decoded values from request.nextUrl.searchParams.
         const message = Object.keys(filtered)
           .sort()
           .map(key => `${key}=${filtered[key]}`)
           .join('&')

         // Step 4: HMAC-SHA256, HEX digest (Pitfall 1: NOT base64 — that's the webhook algorithm)
         const computed = crypto
           .createHmac('sha256', clientSecret)
           .update(message, 'utf8')
           .digest('hex')

         // Step 5: Timing-safe comparison (Pitfall 1: never use ===)
         try {
           return crypto.timingSafeEqual(
             Buffer.from(computed, 'hex'),
             Buffer.from(receivedHmac, 'hex'),
           )
         } catch {
           // Mismatched lengths or invalid hex chars
           return false
         }
       }
       ```

    3. **`buildAuthorizeUrl`** — copy RESEARCH Example 3 líneas 552-571 verbatim:
       ```typescript
       export function buildAuthorizeUrl(opts: {
         shop: string         // pre-validated: ^[a-z0-9][a-z0-9-]*\.myshopify\.com$
         state: string        // signed state JWT
         redirectUri: string  // e.g. https://morfx-sandy.vercel.app/api/integrations/shopify/oauth/callback
       }): string {
         const clientId = process.env.SHOPIFY_CLIENT_ID
         if (!clientId) throw new Error('SHOPIFY_CLIENT_ID not set')

         const params = new URLSearchParams({
           client_id: clientId,
           scope: SHOPIFY_SCOPES.join(','),
           redirect_uri: opts.redirectUri,
           state: opts.state,
           // grant_options[] OMITTED → offline (non-expiring) token by default (D-09)
         })

         return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`
       }
       ```

    **Importante (Pitfall 10):** `redirectUri` se construye en el caller con `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback` (SIN trailing slash). Este helper no añade slash.

    Decisión D referenciada: D-05 (scopes), D-07 (HMAC con CLIENT_SECRET).
  </action>
  <verify>
    <automated>grep -c "digest('hex')" src/lib/shopify/oauth.ts</automated>
    <automated>grep -c "timingSafeEqual" src/lib/shopify/oauth.ts</automated>
    <automated>grep -c "SHOPIFY_SCOPES" src/lib/shopify/oauth.ts</automated>
    <automated>grep -E "'read_orders'.*'read_customers'.*'read_draft_orders'" src/lib/shopify/oauth.ts</automated>
    <automated>grep -E "export (function|const) (verifyOauthCallbackHmac|buildAuthorizeUrl|SHOPIFY_SCOPES)" src/lib/shopify/oauth.ts | wc -l</automated>
    <automated>! grep "digest('base64')" src/lib/shopify/oauth.ts && echo "OK: no base64 (would be Pitfall 1)"</automated>
  </verify>
  <done>
    - `verifyOauthCallbackHmac` con HEX + timingSafeEqual + sorted params (NO URLSearchParams.toString para construir message)
    - JSDoc warning explícito sobre diferencia con `verifyShopifyHmac`
    - `SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'read_draft_orders'] as const`
    - `buildAuthorizeUrl` no añade trailing slash
    - **CERO `digest('base64')`** en este archivo (eso es para webhooks)
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: `exchangeCodeForToken` + `detectScopeDrift` + `createWebhooksAfterOauth` + commit</name>
  <files>src/lib/shopify/oauth.ts</files>
  <read_first>
    - RESEARCH.md §Code Examples §Example 4 (líneas 573-625) — token exchange + scope drift
    - RESEARCH.md §Code Examples §Example 5 (líneas 628-679) — webhook creation con Promise.allSettled + 422 idempotency
    - RESEARCH.md §Pitfall 2 (scope drift)
    - RESEARCH.md §Pitfall 9 (422 = idempotent re-install)
    - CONTEXT.md D-04 (3 webhooks: `orders/create, orders/updated, draft_orders/create`, API version 2024-01, format JSON, URL `${NEXT_PUBLIC_APP_URL}/api/webhooks/shopify`)
    - CONTEXT.md D-06 (API version `2024-01` literal)
  </read_first>
  <action>
    APPEND a `src/lib/shopify/oauth.ts`:

    1. **`TokenExchangeResult` + `exchangeCodeForToken`** — copy RESEARCH Example 4 líneas 577-616 verbatim:
       ```typescript
       export interface TokenExchangeResult {
         accessToken: string
         scope: string
       }

       export async function exchangeCodeForToken(opts: {
         shop: string
         code: string
       }): Promise<TokenExchangeResult> {
         const clientId = process.env.SHOPIFY_CLIENT_ID
         const clientSecret = process.env.SHOPIFY_CLIENT_SECRET
         if (!clientId || !clientSecret) throw new Error('Shopify OAuth env not configured')

         const url = `https://${opts.shop}/admin/oauth/access_token`
         const body = new URLSearchParams({
           client_id: clientId,
           client_secret: clientSecret,
           code: opts.code,
           // 'expiring' OMITTED → non-expiring offline token (D-09)
         })

         const res = await fetch(url, {
           method: 'POST',
           headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
           body: body.toString(),
         })

         if (!res.ok) {
           const text = await res.text().catch(() => '<no body>')
           throw new Error(`shopify-token-exchange-failed:${res.status}:${text.slice(0, 200)}`)
         }

         const json = await res.json() as { access_token?: string; scope?: string }
         if (!json.access_token) throw new Error('shopify-token-exchange-no-token')

         return {
           accessToken: json.access_token,
           scope: json.scope ?? '',
         }
       }
       ```

    2. **`detectScopeDrift`** (RESEARCH Example 4 líneas 618-625):
       ```typescript
       /**
        * Verifies the scope returned by Shopify includes all required scopes.
        * Returns array of missing scopes (empty if all present).
        * @see RESEARCH.md Pitfall 2 — user can tamper with scope mid-flow
        */
       export function detectScopeDrift(returnedScope: string, required: readonly string[]): string[] {
         const granted = new Set(returnedScope.split(',').map(s => s.trim()))
         return required.filter(s => !granted.has(s))
       }
       ```

    3. **Webhook constants + `WebhookCreationResult` + `createWebhooksAfterOauth`** (RESEARCH Example 5 líneas 632-678):
       ```typescript
       /** D-04: 3 webhook topics auto-creados post-OAuth */
       const WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'draft_orders/create'] as const

       /** D-06: API version literal (no upgrade in this standalone) */
       const SHOPIFY_API_VERSION = '2024-01'

       export interface WebhookCreationResult {
         topic: string
         ok: boolean
         status: number
         error?: string
       }

       export async function createWebhooksAfterOauth(opts: {
         shop: string
         accessToken: string
         webhookUrl: string  // e.g. https://morfx-sandy.vercel.app/api/webhooks/shopify
       }): Promise<WebhookCreationResult[]> {
         const results = await Promise.allSettled(
           WEBHOOK_TOPICS.map(async (topic): Promise<WebhookCreationResult> => {
             const res = await fetch(
               `https://${opts.shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`,
               {
                 method: 'POST',
                 headers: {
                   'X-Shopify-Access-Token': opts.accessToken,
                   'Content-Type': 'application/json',
                 },
                 body: JSON.stringify({
                   webhook: {
                     topic,
                     address: opts.webhookUrl,
                     format: 'json',
                   },
                 }),
               }
             )

             // 422 "address has already been taken" = idempotent re-install (Pitfall 9)
             const ok = res.ok || res.status === 422
             let errorMsg: string | undefined
             if (!ok) {
               const text = await res.text().catch(() => '<no body>')
               errorMsg = text.slice(0, 200)
             }
             return { topic, ok, status: res.status, error: errorMsg }
           })
         )

         return results.map((r, i): WebhookCreationResult =>
           r.status === 'fulfilled'
             ? r.value
             : { topic: WEBHOOK_TOPICS[i], ok: false, status: 0, error: String(r.reason).slice(0, 200) }
         )
       }
       ```

    4. **Type-check final + commit atómico (Regla 1):**
       ```bash
       npx tsc --noEmit src/lib/shopify/oauth.ts 2>&1 | head -20
       # esperado: sin errores

       git add src/lib/shopify/oauth.ts
       git commit -m "$(cat <<'EOF'
       feat(shopify-oauth 03): oauth primitives (state JWT + HMAC HEX + token exchange + webhooks)

       - src/lib/shopify/oauth.ts NEW: state JWT (jose, HS256, exp 10min)
       - verifyOauthCallbackHmac HEX + timingSafeEqual (Pitfall 1, SEPARADO de hmac.ts)
       - exchangeCodeForToken + detectScopeDrift (Pitfall 2 scope drift)
       - createWebhooksAfterOauth Promise.allSettled + 422 idempotent (Pitfall 9)
       - SHOPIFY_SCOPES const tuple, API version 2024-01 (D-04, D-05, D-06)

       Plan 03/Wave 1. Primer uso de jose en src/. Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       EOF
       )"
       ```
       NO push (orchestrator).
  </action>
  <verify>
    <automated>grep -c "export (async )?function" src/lib/shopify/oauth.ts</automated>
    <automated>grep -E "export (async function|function|interface|const|type) (SHOPIFY_SCOPES|ShopifyScope|StatePayload|signStateJwt|verifyStateJwt|generateNonce|verifyOauthCallbackHmac|buildAuthorizeUrl|TokenExchangeResult|exchangeCodeForToken|detectScopeDrift|WebhookCreationResult|createWebhooksAfterOauth)" src/lib/shopify/oauth.ts | wc -l</automated>
    <automated>grep -c "Promise.allSettled" src/lib/shopify/oauth.ts</automated>
    <automated>grep "res.status === 422" src/lib/shopify/oauth.ts</automated>
    <automated>grep "2024-01" src/lib/shopify/oauth.ts</automated>
    <automated>grep -c "WEBHOOK_TOPICS = \['orders/create', 'orders/updated', 'draft_orders/create'\]" src/lib/shopify/oauth.ts</automated>
    <automated>npx tsc --noEmit 2>&1 | grep "src/lib/shopify/oauth.ts" | head -20</automated>
    <automated>git log --oneline -1 | grep -E "feat\(shopify-oauth 03\)"</automated>
  </verify>
  <done>
    - Los 13+ exports listados en interfaces presentes
    - `exchangeCodeForToken` throws en non-2xx (Plan 05 lo captura)
    - `detectScopeDrift` retorna array de scopes faltantes
    - `createWebhooksAfterOauth` usa `Promise.allSettled`, 422 → ok=true, fetcha `${SHOPIFY_API_VERSION}/webhooks.json`
    - TypeScript sin errores nuevos
    - Commit atómico creado
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Caller (server action o route handler) → primitives en este módulo | Caller pasa input semi-trusted (e.g., `shop` desde query param) — primitives asumen validación previa |
| Este módulo → Shopify HTTPS API | TLS protege en tránsito; clientSecret sale al wire pero solo en el body POST a `${shop}.myshopify.com/admin/oauth/access_token` |
| `process.env` → este módulo | Trust crítico: si las env vars están mal seteadas (Plan 01), funciones throws en runtime |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-shopify-oauth-08 | T (Tampering) | HMAC algorithm confusion (base64 used instead of hex) → all callbacks rejected | mitigate | `verifyOauthCallbackHmac` usa `digest('hex')` + JSDoc warning extenso; grep gate `! grep "digest('base64')" src/lib/shopify/oauth.ts` |
| T-shopify-oauth-09 | I (Information disclosure) | Timing attack on HMAC compare | mitigate | `crypto.timingSafeEqual` con `Buffer.from(x, 'hex')` (nunca `===`) |
| T-shopify-oauth-10 | S (Spoofing) | State JWT replay within 10-min TTL | accept | D-08 acepta ventana 10min sin nonce-blacklist (futuro hardening); ataque requiere capturar URL + completar flow en <10min + Shopify login del víctima — práctico riesgo bajo |
| T-shopify-oauth-11 | I (Information disclosure) | `SHOPIFY_CLIENT_SECRET` en logs de exception (e.g., stack trace en `exchangeCodeForToken`) | mitigate | Error messages truncan body a 200 chars y NO incluyen el body de la request (que es donde está el secret); el caller (Plan 05) loguea solo el status, no el clientSecret |
| T-shopify-oauth-12 | T (Tampering) | Scope drift (user removes scope mid-flow) | mitigate | `detectScopeDrift` post-exchange; Plan 05 rejects con `reason=denied` si missing scopes |
| T-shopify-oauth-13 | D (DoS) | Webhook creation hangs → callback timeout | mitigate | `Promise.allSettled` — fallos individuales no bloquean; cada fetch tiene timeout implícito de Node (~120s default — Plan 05 monitoreará en logs) |
| T-shopify-oauth-14 | S (Spoofing) | `state` JWT firmado con secret distinto al de verify (rotation race) | accept | RESEARCH Open Question 10: 10-min ventana, no multi-key; usuario reintenta OAuth |
</threat_model>

<verification>
Verificaciones globales del módulo al final del plan:

```bash
# 1. Regla de separación HMAC (Pitfall 1) — este archivo NO usa base64.
grep -c "digest('base64')" src/lib/shopify/oauth.ts
# esperado: 0

# 2. El otro archivo HMAC sigue intacto (no fue refactorizado por error).
grep -c "digest('base64')" src/lib/shopify/hmac.ts
# esperado: >= 1 (webhook usa base64)

# 3. Exports completos.
node -e "
const m = require('./src/lib/shopify/oauth.ts')
console.log(Object.keys(m).sort())
" 2>&1 || npx tsx -e "
import * as m from './src/lib/shopify/oauth'
console.log(Object.keys(m).sort())
"
# esperado (orden alfabético):
# SHOPIFY_SCOPES, buildAuthorizeUrl, createWebhooksAfterOauth, detectScopeDrift,
# exchangeCodeForToken, generateNonce, signStateJwt, verifyOauthCallbackHmac, verifyStateJwt
# (types son borrados al runtime — no aparecen)

# 4. Unit smoke (opcional pero recomendado — el executor puede agregar test en /scripts si lo siente útil):
#    Test conocido vector: HMAC HEX sobre params `{code:'abc', shop:'foo.myshopify.com', timestamp:'1', state:'xyz'}` con secret `s`.
#    Verbatim ejemplo de Shopify docs: `message = 'code=0907a61c0c8d55e99db179b68161bc00&shop={shop}.myshopify.com&state=0.6784241404160823&timestamp=1337178173'`
```
</verification>

<success_criteria>
- [ ] `src/lib/shopify/oauth.ts` existe con todos los exports listados en `<interfaces>`
- [ ] `import crypto from 'crypto'` (estilo del proyecto, NO 'node:crypto')
- [ ] `verifyOauthCallbackHmac` usa **HEX** digest + `timingSafeEqual`
- [ ] CERO `digest('base64')` en el archivo (gate explícito Pitfall 1)
- [ ] `src/lib/shopify/hmac.ts` intacto — webhook HMAC sigue usando base64
- [ ] `SHOPIFY_SCOPES` exportado como tuple readonly literal `['read_orders', 'read_customers', 'read_draft_orders']`
- [ ] `getStateSecret()` throws si secret <32 chars (cover Assumption A2)
- [ ] `createWebhooksAfterOauth` trata 422 como success
- [ ] `WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'draft_orders/create']` const literal
- [ ] API version `2024-01` literal en webhook URL (D-06)
- [ ] TypeScript compila sin errores
- [ ] Commit atómico
</success_criteria>

<output>
Tras completar este plan, crear `.planning/standalone/shopify-dev-dashboard-oauth/03-SUMMARY.md` con:
- Líneas exactas de cada función creada con su firma
- Confirmación de los grep gates (HMAC HEX, no base64, timingSafeEqual)
- Hand-off para Plan 04 (qué importar: `normalizeShopDomain` desde `connection-test`, `signStateJwt` + `buildAuthorizeUrl` + `generateNonce` desde `oauth`)
- Hand-off para Plan 05 (qué importar: `verifyOauthCallbackHmac`, `verifyStateJwt`, `exchangeCodeForToken`, `detectScopeDrift`, `SHOPIFY_SCOPES`, `createWebhooksAfterOauth`)
</output>
