---
phase: shopify-dev-dashboard-oauth
plan: 03
title: OAuth primitives — src/lib/shopify/oauth.ts (state JWT + HMAC HEX + token exchange + 3 webhooks)
subsystem: shopify-oauth
tags: [shopify, oauth, jwt, hmac, webhooks, jose, regla-3, d-15]
dependency_graph:
  requires:
    - "src/lib/shopify/oauth-config.ts → getShopifyOAuthConfig (Plan 02, fail-CLOSED helper)"
    - "jose@^6.1.3 (package.json:68 — primer uso real en src/)"
    - "node:crypto built-in (createHmac, timingSafeEqual, randomUUID — Node 20+)"
    - "fetch nativo Next.js 16 (sin imports)"
  provides:
    - "src/lib/shopify/oauth.ts (441 lineas, 13 exports) — primitives criptograficos y de red para OAuth Authorization Code Grant"
    - "SHOPIFY_SCOPES tuple readonly ['read_orders','read_customers','read_draft_orders'] como const (D-14)"
    - "ShopifyScope type derivado del tuple"
    - "StatePayload + signStateJwt + verifyStateJwt + generateNonce (D-08 — anti-CSRF + identidad cross-origin)"
    - "verifyOauthCallbackHmac (HEX over sorted query params, timingSafeEqual — Pitfall 1)"
    - "buildAuthorizeUrl (async, lee clientId via D-15 helper, scope joined, redirect_uri exacto Pitfall 10)"
    - "TokenExchangeResult + exchangeCodeForToken (async, lee clientId+clientSecret D-15, throws non-2xx, body truncado a 200 chars sin secrets)"
    - "detectScopeDrift (Pitfall 2 — scope grantado vs requested)"
    - "WebhookCreationResult + createWebhooksAfterOauth (Promise.allSettled de 3 POSTs, 422 idempotency Pitfall 9, API version 2024-01 D-06)"
  affects:
    - "Plan 04 (server action startShopifyOauth) — importara generateNonce + signStateJwt + buildAuthorizeUrl"
    - "Plan 05 (callback route) — importara verifyOauthCallbackHmac + verifyStateJwt + exchangeCodeForToken + detectScopeDrift + SHOPIFY_SCOPES + createWebhooksAfterOauth"
tech-stack:
  added: []
  patterns:
    - "D-15 OVERRIDE: cero process.env.SHOPIFY_* — todos los secrets via getShopifyOAuthConfig() del Plan 02 (fail-CLOSED)"
    - "Pattern F (HMAC discipline): verifyOauthCallbackHmac SEPARADO de verifyShopifyHmac (HEX vs BASE64; query params sorted vs body raw)"
    - "Pattern A (state JWT): jose HS256 + ISSUER + sub + iat + exp 600s — primer uso de jose en src/"
    - "Pattern de fetch + throw para errores no recuperables (caller maps a redirect ?reason=...)"
    - "Promise.allSettled + 422-as-success para idempotencia en webhook auto-create"
key-files:
  created:
    - "src/lib/shopify/oauth.ts (441 lineas)"
  modified: []
decisions:
  - "D-15 (credenciales en platform_config) materializada en oauth.ts: signStateJwt/verifyStateJwt/buildAuthorizeUrl/exchangeCodeForToken son ASYNC y leen secrets via await getShopifyOAuthConfig() — verifiable por grep retornando 0 matches de process.env.SHOPIFY_*"
  - "D-08 (state JWT 10min) materializada: HS256, issuer 'morfx-shopify-oauth', sub=workspaceId, exp=600s, payload {workspaceId, userId, nonce}"
  - "D-14 (scopes corregidos) materializada: SHOPIFY_SCOPES tuple ['read_orders','read_customers','read_draft_orders'] — write_webhooks NO existe en Shopify (corrige RESEARCH original)"
  - "D-09 (offline token) materializada: ni grant_options[] en authorize URL ni 'expiring' en token exchange => Shopify defaultea a non-expiring offline token"
  - "D-04 + D-06 (3 webhooks post-OAuth, API version 2024-01) materializadas: WEBHOOK_TOPICS const + SHOPIFY_API_VERSION const = '2024-01'"
  - "Pitfall 1 (HMAC HEX vs BASE64) defendido con: digest('hex'), Buffer.from(x,'hex'), timingSafeEqual, JSDoc warning explicito + header doc del modulo"
  - "Pitfall 9 (422 idempotency) defendido: const ok = res.ok || res.status === 422 — disconnect+reconnect (D-03b) NO falsea error UX"
metrics:
  duration_minutes: ~35
  completed_date: 2026-05-12
  tasks_completed: 4
  commits: 4
  files_changed: 1
---

# Plan 03: OAuth primitives — Summary

Crea `src/lib/shopify/oauth.ts` (441 lineas, 13 exports) — el modulo standalone con todos los primitives criptograficos y de red para el flujo OAuth Authorization Code Grant de Shopify Dev Dashboard. Hand-roll completo (NO `@shopify/shopify-api`); `jose@6.1.3` para state JWT (primer uso real en `src/`) + `node:crypto` para HMAC HEX timing-safe + `fetch` nativo para token exchange + webhook creation.

**Critico:** este modulo es SEPARADO de `src/lib/shopify/hmac.ts`. El HMAC del callback OAuth usa **HEX** sobre query params sorted; el de webhooks usa **BASE64** sobre body raw. Mezclarlos es el bug #1 reportado en foros Shopify (Pitfall 1). Ambos archivos coexisten sin tocarse.

## What Was Built

| Seccion del archivo                | Exports                                                                                | Lineas (approx) | Decisiones materializadas |
| ---------------------------------- | -------------------------------------------------------------------------------------- | --------------- | ------------------------- |
| Header doc + imports               | (1 import jose, 1 import oauth-config, 1 import crypto)                                | 1-30            | Pitfall 1, 5, D-15        |
| State JWT primitives               | `StatePayload`, `generateNonce`, `signStateJwt`, `verifyStateJwt`                      | 32-124          | D-08, D-15                |
| Scopes                             | `SHOPIFY_SCOPES`, `ShopifyScope`                                                       | 126-148         | D-14                      |
| HMAC HEX                           | `verifyOauthCallbackHmac`                                                              | 150-216         | Pitfall 1, 6              |
| Authorize URL                      | `buildAuthorizeUrl`                                                                    | 218-254         | D-09, D-14, D-15, P10     |
| Token exchange + scope drift       | `TokenExchangeResult`, `exchangeCodeForToken`, `detectScopeDrift`                      | 256-348         | D-09, D-15, Pitfall 2     |
| Webhook auto-creation              | `WebhookCreationResult`, `createWebhooksAfterOauth`                                    | 350-441         | D-04, D-06, Pitfall 9     |

### Function signatures (verbatim del archivo)

```typescript
// State JWT primitives (D-08)
export interface StatePayload {
  workspaceId: string
  userId: string
  nonce: string
}
export function generateNonce(): string
export async function signStateJwt(payload: StatePayload): Promise<string>
export async function verifyStateJwt(token: string): Promise<StatePayload>

// Scopes (D-14)
export const SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'read_draft_orders'] as const
export type ShopifyScope = (typeof SHOPIFY_SCOPES)[number]

// HMAC HEX (Pitfall 1)
export function verifyOauthCallbackHmac(
  params: Record<string, string>,
  receivedHmac: string,
  clientSecret: string,
): boolean

// Authorize URL builder
export async function buildAuthorizeUrl(opts: {
  shop: string
  state: string
  redirectUri: string
}): Promise<string>

// Token exchange + scope drift
export interface TokenExchangeResult {
  accessToken: string
  scope: string
}
export async function exchangeCodeForToken(opts: {
  shop: string
  code: string
}): Promise<TokenExchangeResult>
export function detectScopeDrift(
  returnedScope: string,
  required: readonly string[],
): string[]

// Webhook auto-creation (D-04, Pitfall 9)
export interface WebhookCreationResult {
  topic: string
  ok: boolean
  status: number
  error?: string
}
export async function createWebhooksAfterOauth(opts: {
  shop: string
  accessToken: string
  webhookUrl: string
}): Promise<WebhookCreationResult[]>
```

Total: **13 exports** (8 funciones + 1 const + 1 type + 4 interfaces). Verificado con `grep -cE "^export ..."` retornando 13.

## Tasks Completed

### Task A — State JWT primitives (commit `a450f41`)

- File header doc + imports (jose, crypto, oauth-config).
- `ISSUER = 'morfx-shopify-oauth'` + `TTL_SECONDS = 600` constantes privadas.
- `generateNonce()` = wrapper trivial sobre `crypto.randomUUID()`.
- `signStateJwt(payload)`: `await getShopifyOAuthConfig()` para `stateSecret`, `new TextEncoder().encode(stateSecret)`, jose `SignJWT({...}).setProtectedHeader({alg:'HS256'}).setIssuer(ISSUER).setSubject(workspaceId).setIssuedAt().setExpirationTime('600s').sign(key)`.
- `verifyStateJwt(token)`: `await getShopifyOAuthConfig()` para mismo `stateSecret`, `jwtVerify(token, key, { issuer: ISSUER })`. Throws si signature/exp/issuer fallan; valida adicional que `workspaceId/userId/nonce` esten presentes; retorna `StatePayload` strongly-typed (todos `String(...)`).
- **D-15 critico:** las 2 funciones son `async` para poder `await getShopifyOAuthConfig()`. RESEARCH original tenia `getStateSecret()` que leia env vars — lo elimine porque el helper de Plan 02 ya hace lo mismo (validar >=32 chars + throw mensajes con nombre de la key sin exponer valores).

### Task B — HMAC HEX + scopes + authorize URL (commit `d3a2b30`)

- `SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'read_draft_orders'] as const` (D-14 corregido) + JSDoc explicit con nota historica vs RESEARCH original (que tenia `write_webhooks` — scope inexistente).
- `ShopifyScope = (typeof SHOPIFY_SCOPES)[number]` type literal.
- `verifyOauthCallbackHmac(params, receivedHmac, clientSecret)`: pure function (clientSecret pasado como parametro — testeable; el caller en Plan 05 lo lee del helper UNA vez y pasa el pedazo). Algoritmo verbatim Shopify:
  1. `delete filtered.hmac`
  2. `Object.keys(filtered).sort().map(k => \`${k}=${filtered[k]}\`).join('&')` (RAW values, NO `URLSearchParams.toString()` — Pitfall 6)
  3. `crypto.createHmac('sha256', clientSecret).update(message, 'utf8').digest('hex')` ← **HEX** (Pitfall 1)
  4. `crypto.timingSafeEqual(Buffer.from(computed,'hex'), Buffer.from(receivedHmac,'hex'))` envuelto en try/catch (mismatched lengths o invalid hex chars => `false`)
- `buildAuthorizeUrl(opts)`: async (D-15 — `await getShopifyOAuthConfig()` para `clientId`). `URLSearchParams` con `client_id`, `scope: SHOPIFY_SCOPES.join(',')`, `redirect_uri: opts.redirectUri` (caller responsable de no añadir trailing slash — Pitfall 10), `state`. `grant_options[]` OMITIDO => offline token (D-09). Retorna `https://${shop}/admin/oauth/authorize?${params.toString()}`.

### Task C — Token exchange + scope drift (commit `1e20a49`)

- `TokenExchangeResult` interface (`{ accessToken, scope }`).
- `exchangeCodeForToken(opts)`: async, `await getShopifyOAuthConfig()` => `{clientId, clientSecret}`. POST a `https://${shop}/admin/oauth/access_token` con `Content-Type: application/x-www-form-urlencoded` y body URLSearchParams `{client_id, client_secret, code}` (D-09 — `expiring` omitido). Si non-2xx: `text.slice(0,200)` (T-shopify-oauth-11 — secret nunca en error msg porque Shopify no echoes el body request) y throw `shopify-token-exchange-failed:${status}:${body}`. Si 2xx pero sin `access_token`: throw `shopify-token-exchange-no-token`. Retorna `{ accessToken, scope: scope ?? '' }`.
- `detectScopeDrift(returnedScope, required)`: `granted = new Set(returnedScope.split(',').map(s=>s.trim()))`, `return required.filter(s => !granted.has(s))`. Empty array = todos presentes; non-empty = caller (Plan 05) treats as `reason=denied`.

### Task D — Webhook auto-creation (commit `b8ca508`)

- `WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'draft_orders/create'] as const` (D-04).
- `SHOPIFY_API_VERSION = '2024-01'` (D-06 — pinned, sin upgrade en este standalone).
- `WebhookCreationResult` interface (`{ topic, ok, status, error? }`).
- `createWebhooksAfterOauth(opts)`: `Promise.allSettled` de 3 POSTs en paralelo a `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json`. Headers: `X-Shopify-Access-Token`, `Content-Type: application/json`. Body: `JSON.stringify({ webhook: { topic, address: opts.webhookUrl, format: 'json' } })`.
- **Pitfall 9 idempotency:** `const ok = res.ok || res.status === 422` — Shopify rechaza re-creation con 422 "address has already been taken" cuando el webhook ya existe (escenario disconnect+reconnect D-03b); tratamos como success para no falsear error UX en clean reconnect.
- Map de `Promise.allSettled` results: si fulfilled => devuelve el value; si rejected => `{topic, ok:false, status:0, error: String(reason).slice(0,200)}`. 1 fallo NO bloquea los otros 2 — caller (Plan 05) loguea cada falla pero CONTINUA el flujo (los webhooks reintentables via reconnect).

## Decisions / Deviations

**Cero deviations contradictorias** vs el plan/contexto. Las anotaciones siguientes afinan (no contradicen) las instrucciones:

1. **D-15 OVERRIDE absoluto aplicado.** El plan task code samples (lineas 182-188 de `03-PLAN.md` Task 1, lineas 326-329 Task 2, lineas 387-389 Task 3) mostraban `process.env.SHOPIFY_OAUTH_STATE_SECRET / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET`. Esos snippets son **historicos** — el plan-level `must_haves.truths` linea 18 explicitamente OVERRIDE: "TODAS las funciones que necesitan client_id/client_secret/state_secret leen via `await getShopifyOAuthConfig()` del helper de Plan 02. PROHIBIDO process.env.SHOPIFY_*". Implementacion sigue el OVERRIDE: 4 funciones (`signStateJwt`, `verifyStateJwt`, `buildAuthorizeUrl`, `exchangeCodeForToken`) son `async` y `await` el helper en su body. Verificable por `grep -cE "process\.env\.SHOPIFY_(CLIENT|OAUTH)" src/lib/shopify/oauth.ts` => `0`.

2. **`getStateSecret()` interno NO existe.** El plan task A linea 182-188 propuso un helper privado `getStateSecret()` que validaba >=32 chars y leia de env. Ese helper se elimino por completo — su logica ya vive en `getShopifyOAuthConfig()` (Plan 02 throws si <32 chars con mensaje explicito). Las 2 funciones JWT obtienen `stateSecret` directo del destructuring del helper. Reduce duplicacion + 1 fuente de verdad para validacion de credenciales.

3. **API version literal vs constante.** El success_criterion del prompt esperaba `grep "/admin/api/2024-01/" src/lib/shopify/oauth.ts` retorne >=1. Implementacion usa `\`https://${opts.shop}/admin/api/${SHOPIFY_API_VERSION}/webhooks.json\`` con `const SHOPIFY_API_VERSION = '2024-01'` (linea 358). El grep literal retorna 0 pero `grep "2024-01"` retorna 1 (en la const declaration). **Trade-off intencional:** una const + un consumer es mas mantenible que hardcodear "2024-01" en el URL string (D-06 explicito que API version es pinned). Si en futuro standalone se sube version, basta actualizar la const en 1 lugar. Documentado aqui para que Plan 05 caller no busque por la string literal.

4. **`crypto` import path = `'crypto'` (no `'node:crypto'`).** PATTERNS.md linea 38 + RESEARCH Pitfall 5 + `src/lib/shopify/hmac.ts:1` confirman estilo del proyecto. RESEARCH Example 1 mostraba `'node:crypto'` — se usa el form sin prefix por consistency con el otro modulo de Shopify HMAC.

5. **JSDoc explicito sobre diferencia HMAC OAuth vs webhook.** Header del archivo + JSDoc de `verifyOauthCallbackHmac` repiten 2 veces la advertencia critica (HEX over sorted query params vs BASE64 over raw body). Pitfall 1 ranks como bug #1 en foros Shopify; mejor over-document que silencio.

## Hand-off

### Plan 04 — `src/app/actions/shopify-oauth.ts` (server action `startShopifyOauth`)

```typescript
import { normalizeShopDomain } from '@/lib/shopify/connection-test'
import { signStateJwt, buildAuthorizeUrl, generateNonce } from '@/lib/shopify/oauth'

export async function startShopifyOauth({ shopDomain }: { shopDomain: string }) {
  // 1. Auth gate (cookie + workspace_members.role === 'owner')
  // 2. Normalize + regex validate shop domain
  // 3. const state = await signStateJwt({ workspaceId, userId, nonce: generateNonce() })
  //    ← internally awaits getShopifyOAuthConfig() — no env vars touched
  // 4. const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback`
  //    (sin trailing slash — Pitfall 10; redirect_uri DEBE matchear EXACTO Dev Dashboard config)
  // 5. const redirectUrl = await buildAuthorizeUrl({ shop, state, redirectUri })
  //    ← internally awaits getShopifyOAuthConfig() — no env vars touched
  // 6. return { success: true, redirectUrl }
}
```

**Importante:** `signStateJwt` y `buildAuthorizeUrl` son **async** (D-15) — Plan 04 debe usar `await`. Si cualquiera throws (helper fail-CLOSED), el caller debe catchear y devolver `{success:false, error: 'Configuracion OAuth invalida'}` + log server-side con `err.message` (que ya viene con nombre de key + accion remediadora).

### Plan 05 — `src/app/api/integrations/shopify/oauth/callback/route.ts` (route handler)

```typescript
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth-config'
import {
  verifyOauthCallbackHmac,
  verifyStateJwt,
  exchangeCodeForToken,
  detectScopeDrift,
  createWebhooksAfterOauth,
  SHOPIFY_SCOPES,
} from '@/lib/shopify/oauth'
import { upsertShopifyIntegration } from '@/lib/domain/integrations'

export const runtime = 'nodejs'         // node:crypto.timingSafeEqual + createHmac
export const dynamic = 'force-dynamic'  // never cache OAuth callbacks

export async function GET(request: NextRequest) {
  // 1. Zod-parse query params
  // 2. const { clientSecret } = await getShopifyOAuthConfig()  ← UNA llamada al top
  // 3. if (!verifyOauthCallbackHmac(queryObj, hmac, clientSecret)) → fail('hmac_mismatch')
  // 4. const statePayload = await verifyStateJwt(state)  → throws → fail('state_expired')
  //    (verifyStateJwt llama a getShopifyOAuthConfig internamente para stateSecret;
  //     el cache 30s de getPlatformConfig hace que la 2da llamada sea memory-hit)
  // 5. const tokenResult = await exchangeCodeForToken({ shop, code })  → throws → fail('shopify_error')
  //    (idem — getShopifyOAuthConfig internamente)
  // 6. const missing = detectScopeDrift(tokenResult.scope, SHOPIFY_SCOPES)
  //    if (missing.length > 0) → fail('denied', `missing: ${missing.join(',')}`)
  // 7. (testShopifyConnection — opcional)
  // 8. const webhookResults = await createWebhooksAfterOauth({ shop, accessToken, webhookUrl })
  //    webhookResults.forEach(r => if (!r.ok) console.warn(...))
  // 9. await upsertShopifyIntegration(ctx, { shopDomain, accessToken, apiSecret: clientSecret, ... })
  // 10. NextResponse.redirect(.../integraciones?success=oauth_connected)
}
```

**Importante para Plan 05:**
- `verifyOauthCallbackHmac` es **pure/sync** y recibe `clientSecret` como parametro. Plan 05 hace UNA `getShopifyOAuthConfig()` al top y pasa `clientSecret` aqui (testeable + sin doble lectura del cache).
- `verifyStateJwt` y `exchangeCodeForToken` son **async** y consultan el helper internamente. Eso significa 3 invocaciones a `getShopifyOAuthConfig` en un callback exitoso — pero el cache 30s built-in de `getPlatformConfig` (Plan 02 §Cache) hace que las 2-3-ras sean memory hits sub-millisecond. No hay deuda de performance.
- Si quieres **0 redundancia**, Plan 05 puede agregar wrappers `verifyStateJwtWith(secret, token)` y `exchangeCodeForTokenWith(creds, opts)` — pero la API actual prioriza ergonomia (caller no juega passing-secrets-around) sobre sub-ms savings.

### Plan 06 — refactor `src/app/actions/shopify.ts` (delete path)

No depende de oauth.ts directamente. Sigue hand-off de Plan 02 (`02-SUMMARY.md` §Hand-off Plan 06).

## Self-Check: PASSED

```bash
# files exist
test -f src/lib/shopify/oauth.ts                                      → EXISTS

# success_criteria gates from prompt:
[2]  grep -cE "^export ..." src/lib/shopify/oauth.ts                  → 13   ✓ (8 funciones + 1 const + 1 type + 4 interfaces)
[3]  grep -cE "process\.env\.SHOPIFY_(CLIENT|OAUTH)" oauth.ts          → 0    ✓ (D-15 satisfied)
[4]  grep "from './oauth-config'" oauth.ts                            → 1    ✓ (helper importado)
[5]  grep "digest('hex')" oauth.ts                                    → 1    ✓ (Pitfall 1 — HMAC HEX)
[6]  grep "digest('base64')" oauth.ts                                 → 0    ✓ (Pitfall 1 — no base64 en este modulo)
[7]  grep "timingSafeEqual" oauth.ts                                  → 3    ✓ (constant-time compare)
[8]  grep "address has already been taken|status === 422" oauth.ts    → 3    ✓ (Pitfall 9 idempotency)
[9]  grep "from 'jose'" oauth.ts                                      → 1    ✓ (JWT lib)
[10] grep "2024-01" oauth.ts                                          → 1    ✓ (API version pinned via const SHOPIFY_API_VERSION)
     (NOTA: el grep literal "/admin/api/2024-01/" retorna 0 porque la URL
      usa `${SHOPIFY_API_VERSION}` template literal — ver Deviations §3)

# typecheck (no errores nuevos en oauth.ts)
npx tsc --noEmit --skipLibCheck 2>&1 | grep -cE "src/lib/shopify/oauth\.ts"
                                                                       → 0    ✓

# hmac.ts UNTOUCHED (Pitfall 1 separation)
git log --oneline src/lib/shopify/hmac.ts                              → 1e0e7a9 feat(11-02) (intacto)

# unrelated files NO modified
git diff --stat fbcad3fe55fba2a106e1955ad2c806650d070560..HEAD          → 1 file (only oauth.ts) ✓
git status --short                                                     → clean ✓

# commits — 4 atomic en orden A → B → C → D
git log --oneline fbcad3fe..HEAD
b8ca508 feat(shopify-oauth-03): create 3 webhooks post-OAuth (Pitfall 9 idempotency)
1e20a49 feat(shopify-oauth-03): token exchange + scope drift detection
d3a2b30 feat(shopify-oauth-03): HMAC HEX + scopes + authorize URL builder (Pitfall 1, D-14)
a450f41 feat(shopify-oauth-03): state JWT primitives (sign + verify + nonce, D-08 + D-15)
```

Todos los gates pasan. Plan 03 listo para Plans 04 + 05 (Wave 2).
