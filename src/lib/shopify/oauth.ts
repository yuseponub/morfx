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
//
// Credentials (D-15 OVERRIDE):
//   The 3 secrets (clientId, clientSecret, stateSecret) live in `platform_config`
//   and are read via `getShopifyOAuthConfig()` (Plan 02). This module NEVER
//   touches `process.env.SHOPIFY_*` — verifiable via:
//     grep -E "process\.env\.SHOPIFY_(CLIENT|OAUTH)" src/lib/shopify/oauth.ts
//     → must return 0 matches.
//   All functions that need secrets are async and `await getShopifyOAuthConfig()`
//   in their body (fail-CLOSED: helper THROWS if any credential is missing or weak).
// ============================================================================

import crypto from 'crypto'                  // project style — see hmac.ts:1 (NOT 'node:crypto')
import { SignJWT, jwtVerify } from 'jose'    // first use of jose in src/ (already in package.json)

import { getShopifyOAuthConfig } from './oauth-config'

// ============================================================================
// Constants
// ============================================================================

const ISSUER = 'morfx-shopify-oauth'
const TTL_SECONDS = 600 // 10 minutes (D-08)

// ============================================================================
// State JWT primitives (D-08)
// ============================================================================

/**
 * Payload carried in the `state` query parameter across the OAuth redirect.
 *
 * Why JWT (vs random nonce + DB lookup): the Shopify callback arrives
 * cross-origin without our cookies — we cannot read `morfx_workspace`. The
 * signed JWT carries the workspace_id self-contained, with a 10-min `exp`
 * making it stateless and replay-resistant inside the TTL window.
 *
 * `nonce` makes each token globally unique (future replay-blacklist hook).
 */
export interface StatePayload {
  workspaceId: string
  userId: string
  nonce: string
}

/**
 * Generates a cryptographically random nonce for the state JWT payload.
 * Wraps `crypto.randomUUID()` (Node 20+).
 */
export function generateNonce(): string {
  return crypto.randomUUID()
}

/**
 * Signs a `StatePayload` into a compact JWS using HS256.
 *
 * Reads `stateSecret` via `getShopifyOAuthConfig()` (D-15 fail-CLOSED). The
 * helper throws if the secret is missing or shorter than 32 chars (RFC 7518
 * §3.2 minimum for HS256), so this function propagates that error to its
 * caller. The error message NEVER contains the secret value.
 *
 * Token shape:
 *   header  = { alg: 'HS256' }
 *   payload = { workspaceId, userId, nonce, iss, sub: workspaceId, iat, exp }
 */
export async function signStateJwt(payload: StatePayload): Promise<string> {
  const { stateSecret } = await getShopifyOAuthConfig()
  const key = new TextEncoder().encode(stateSecret)

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
    .sign(key)
}

/**
 * Verifies a state JWT and returns the typed payload.
 *
 * Throws if:
 *   - signature is invalid (wrong secret, tampered token)
 *   - token is expired (>10 min since `signStateJwt`)
 *   - issuer claim doesn't match `ISSUER`
 *   - payload is missing any of `workspaceId`, `userId`, `nonce`
 *
 * The caller (Plan 05 callback) catches and maps to `reason=state_expired`
 * (per D-12 — we treat all state failures uniformly to avoid leaking info
 * about why validation failed).
 */
export async function verifyStateJwt(token: string): Promise<StatePayload> {
  const { stateSecret } = await getShopifyOAuthConfig()
  const key = new TextEncoder().encode(stateSecret)

  const { payload } = await jwtVerify(token, key, { issuer: ISSUER })
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

// ============================================================================
// Scopes (D-14: corrected list — write_webhooks does NOT exist)
// ============================================================================

/**
 * OAuth scopes solicitados al merchant en el authorize URL (D-14).
 *
 * - `read_orders`        — leer pedidos + recibir webhooks `orders/*`
 * - `read_customers`     — leer datos del customer en orders/draft_orders
 * - `read_draft_orders`  — recibir webhook `draft_orders/create` (Required per
 *                          WebhookSubscriptionTopic GraphQL docs)
 *
 * NOTA HISTORICA (D-14 vs D-05):
 *   `write_webhooks` apareció en RESEARCH original — **es incorrecto**, ese
 *   scope no existe en Shopify. La creación de webhook subscriptions vía
 *   Admin API NO requiere un scope dedicado; basta tener el `read_*` del
 *   resource subscribed.
 *
 * Si Shopify retorna un subset de estos scopes en el token exchange, el
 * caller (Plan 05) lo trata como `reason=denied` (Pitfall 2 scope drift).
 */
export const SHOPIFY_SCOPES = ['read_orders', 'read_customers', 'read_draft_orders'] as const
export type ShopifyScope = (typeof SHOPIFY_SCOPES)[number]

// ============================================================================
// HMAC validation (Pitfall 1 — HEX, NOT BASE64)
// ============================================================================

/**
 * Verifies the HMAC of an OAuth callback redirect from Shopify.
 *
 * CRITICAL: This is DIFFERENT from `verifyShopifyHmac` (webhook HMAC) in
 * `src/lib/shopify/hmac.ts`:
 *   - OAuth callback HMAC: HEX digest over sorted query params (no URL encoding,
 *     RAW values), excluding the `hmac` param itself.
 *   - Webhook HMAC:        BASE64 digest over the raw request body.
 *
 * Algorithm per Shopify docs (verbatim from
 *   https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 *   "The HMAC verification procedure for authorization code grant is
 *    different from the procedure for verifying webhooks."):
 *
 *   1. Remove `hmac` from query params.
 *   2. Sort the remaining params alphabetically by key.
 *   3. Build message: `key1=value1&key2=value2&...` with RAW (decoded) values.
 *      Do NOT use `URLSearchParams.toString()` — it re-encodes (Pitfall 6).
 *   4. HMAC-SHA256(message, clientSecret) -> HEX digest.
 *   5. Compare with the received `hmac` using `crypto.timingSafeEqual`
 *      (constant-time, never `===` — Pitfall 1).
 *
 * @param params         All callback query params (already URL-decoded by Next.js).
 * @param receivedHmac   Value of the `hmac` query param.
 * @param clientSecret   Dev Dashboard Client Secret (read from platform_config
 *                       via `getShopifyOAuthConfig()` upstream — passed as
 *                       parameter so this function stays pure + testable).
 * @returns true iff the HMAC is valid.
 */
export function verifyOauthCallbackHmac(
  params: Record<string, string>,
  receivedHmac: string,
  clientSecret: string,
): boolean {
  // Step 1: Remove hmac from params (do not mutate original).
  const filtered = { ...params }
  delete filtered.hmac

  // Step 2 + 3: Sort alphabetically and build message with RAW (decoded) values.
  // CRITICAL (Pitfall 6): Do NOT use URLSearchParams.toString() — it re-encodes.
  // The caller hands us already-decoded values from request.nextUrl.searchParams.
  const message = Object.keys(filtered)
    .sort()
    .map((key) => `${key}=${filtered[key]}`)
    .join('&')

  // Step 4: HMAC-SHA256, HEX digest (Pitfall 1: NOT base64 — that's the webhook algorithm).
  const computed = crypto
    .createHmac('sha256', clientSecret)
    .update(message, 'utf8')
    .digest('hex')

  // Step 5: Timing-safe comparison (Pitfall 1: never use ===).
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(receivedHmac, 'hex'),
    )
  } catch {
    // Mismatched lengths or invalid hex chars in receivedHmac.
    return false
  }
}

// ============================================================================
// Authorize URL (consumed by server action in Plan 04)
// ============================================================================

/**
 * Builds the Shopify authorize URL the merchant is redirected to in step 3
 * of the flow (browser → Shopify admin).
 *
 * The `redirect_uri` param MUST exactly match (no trailing slash) what's
 * configured in Dev Dashboard → app → Settings → Redirection URLs (Pitfall 10).
 * The caller is responsible for building it consistently — typically:
 *   `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/shopify/oauth/callback`
 *
 * `grant_options[]` is OMITTED → Shopify defaults to **offline** (non-expiring)
 * access token (D-09).
 *
 * D-15 OVERRIDE: `clientId` is read from `platform_config` (NOT env vars).
 * The function is `async` so it can `await getShopifyOAuthConfig()` — Plan 02
 * helper throws if the credential is missing or weak.
 */
export async function buildAuthorizeUrl(opts: {
  shop: string // pre-validated: ^[a-z0-9][a-z0-9-]*\.myshopify\.com$
  state: string // signed state JWT
  redirectUri: string // exact match with Dev Dashboard config (no trailing slash)
}): Promise<string> {
  const { clientId } = await getShopifyOAuthConfig()

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES.join(','),
    redirect_uri: opts.redirectUri,
    state: opts.state,
    // grant_options[] OMITTED → offline (non-expiring) token by default (D-09)
  })

  return `https://${opts.shop}/admin/oauth/authorize?${params.toString()}`
}
