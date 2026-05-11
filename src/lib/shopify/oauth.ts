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
