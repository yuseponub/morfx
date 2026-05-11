// ============================================================================
// OAuth Callback Route Handler (Standalone shopify-dev-dashboard-oauth, Plan 05)
//
// Receives Shopify's 302 redirect after the merchant authorizes the MorfX app.
// Pipeline (FAIL FAST — every step short-circuits to redirect on error):
//   1. Zod-parse query params (shape + SHOP_REGEX)
//   2. HMAC HEX verify (CRITICAL: separate from webhook HMAC — Pitfall 1)
//   3. State JWT verify (signature + exp + payload shape — D-08)
//   4. Owner re-check (defense in depth — user could be demoted mid-flow)
//   5. Token exchange (POST /admin/oauth/access_token via oauth.ts)
//   6. Scope drift detection (Pitfall 2 — user can tamper with scope)
//   7. Connection test (reuse existing testShopifyConnection)
//   8. Auto-create 3 webhooks (Promise.allSettled internally — Pattern 4)
//   9. Domain upsert (Regla 3, D-10 — single source of truth)
//  10. 302 redirect with ?success=oauth_connected
//
// Runtime: 'nodejs' (REQUIRED for node:crypto in oauth.ts — Pitfall 5).
// Dynamic: 'force-dynamic' (never cache OAuth callbacks).
//
// D-15 OVERRIDE — NO `process.env.SHOPIFY_*` in this file. All Shopify
// secrets (clientId, clientSecret, stateSecret) are accessed implicitly
// through the async helpers in `src/lib/shopify/oauth.ts`, which internally
// `await getShopifyOAuthConfig()` (Plan 02 fail-CLOSED). The ONLY env var
// read here is `NEXT_PUBLIC_APP_URL` (public, used to build redirect URLs).
//
// PII / secrets in logs (T-shopify-oauth-23): NEVER log access_token, full
// JWT, or full HMAC. OK to log: shop domain, error reason, duration.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

import { upsertShopifyIntegration } from '@/lib/domain/integrations'
import { testShopifyConnection } from '@/lib/shopify/connection-test'
import {
  SHOPIFY_SCOPES,
  createWebhooksAfterOauth,
  detectScopeDrift,
  exchangeCodeForToken,
  verifyOauthCallbackHmac,
  verifyStateJwt,
} from '@/lib/shopify/oauth'
import { getShopifyOAuthConfig } from '@/lib/shopify/oauth-config'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs' // CRITICAL: node:crypto requires nodejs (Pitfall 5)
export const dynamic = 'force-dynamic' // CRITICAL: never cache OAuth callbacks

// ============================================================================
// Zod schema — query params from Shopify callback
// SHOP_REGEX (Pitfall 3): only accept *.myshopify.com sub-domains. The shop
// param arrives signed by HMAC, but defense-in-depth: parse-stage rejection
// stops malformed requests before any IO.
// ============================================================================
const SHOP_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

const CallbackQuerySchema = z.object({
  code: z.string().min(1),
  hmac: z.string().min(1),
  shop: z.string().regex(SHOP_REGEX),
  state: z.string().min(1),
  timestamp: z.string().min(1),
  host: z.string().optional(),
})

// ============================================================================
// Failure helper — single redirect path with enumerated reason (D-12).
//
// The cliente only sees `reason` (4 enumerated values). Detailed error
// information (parse errors, exception messages) is logged server-side
// only — see T-shopify-oauth-27 (info disclosure).
// ============================================================================
type FailReason = 'denied' | 'hmac_mismatch' | 'state_expired' | 'shopify_error'

function fail(reason: FailReason, detail?: string): NextResponse {
  if (detail) {
    console.warn(`[oauth-callback] fail reason=${reason} detail=${detail}`)
  } else {
    console.warn(`[oauth-callback] fail reason=${reason}`)
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const url = `${baseUrl}/configuracion/integraciones?error=oauth_failed&reason=${reason}`
  return NextResponse.redirect(url)
}

// ============================================================================
// GET handler
// ============================================================================
export async function GET(request: NextRequest): Promise<NextResponse> {
  const startTime = Date.now()
  const sp = request.nextUrl.searchParams

  // === Step 1: Zod-parse query params ===
  // Build a plain object from URLSearchParams (already URL-decoded by Next).
  // RAW (decoded) values are required for HMAC message construction (Pitfall 6).
  const queryObj: Record<string, string> = {}
  sp.forEach((v, k) => {
    queryObj[k] = v
  })
  const parsed = CallbackQuerySchema.safeParse(queryObj)
  if (!parsed.success) {
    return fail('shopify_error', `invalid-query: ${parsed.error.message.slice(0, 200)}`)
  }
  const { code, hmac, shop, state } = parsed.data

  // === Step 2: HMAC validation (HEX over sorted query params, excluding hmac) ===
  // D-15 OVERRIDE: read clientSecret via async helper (NOT process.env).
  // Single getShopifyOAuthConfig call up-front; downstream oauth.ts helpers
  // also call it but cache 30s in getPlatformConfig keeps it sub-ms.
  let clientSecret: string
  try {
    const cfg = await getShopifyOAuthConfig()
    clientSecret = cfg.clientSecret
  } catch (err) {
    return fail('shopify_error', `oauth-config: ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`)
  }

  if (!verifyOauthCallbackHmac(queryObj, hmac, clientSecret)) {
    return fail('hmac_mismatch', `shop=${shop}`)
  }

  // === Step 3: State JWT verification (signature + exp + issuer + payload) ===
  // verifyStateJwt throws on any failure (signature, expired, malformed).
  // We map ALL state failures to `state_expired` to avoid leaking which
  // validation step failed (D-12 — uniform error UX).
  let statePayload: { workspaceId: string; userId: string; nonce: string }
  try {
    statePayload = await verifyStateJwt(state)
  } catch (err) {
    return fail('state_expired', err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200))
  }

  // === Step 4: Owner re-check (defense in depth — user could be demoted mid-flow) ===
  // The callback arrives cross-origin without cookies, so we cannot reuse the
  // server-action auth gate (cookie + workspace_members lookup via SSR client).
  // We use the admin client (RLS-bypass) ONLY to query workspace_members for the
  // user/workspace pair encoded in the verified state JWT. NO writes here.
  const adminSupabase = createAdminClient()
  const { data: member, error: memberErr } = await adminSupabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', statePayload.workspaceId)
    .eq('user_id', statePayload.userId)
    .maybeSingle()

  if (memberErr) {
    return fail('shopify_error', `owner-recheck: ${memberErr.message.slice(0, 200)}`)
  }
  if (!member || member.role !== 'owner') {
    return fail(
      'denied',
      `user=${statePayload.userId.slice(0, 8)} no longer owner of workspace=${statePayload.workspaceId.slice(0, 8)}`,
    )
  }

  // === Step 5: Exchange authorization code for offline access token ===
  // exchangeCodeForToken throws on non-2xx, missing token, or network errors.
  // The error message includes status + first 200 chars of response body for
  // debugging — NEVER includes the secret (Shopify does not echo client_secret).
  let tokenResult: { accessToken: string; scope: string }
  try {
    tokenResult = await exchangeCodeForToken({ shop, code })
  } catch (err) {
    return fail(
      'shopify_error',
      `token-exchange: ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`,
    )
  }

  // === Step 6: Scope drift detection (Pitfall 2) ===
  // Shopify documents that the merchant can edit `scope` mid-authorize and grant
  // a subset. The token would still work for granted scopes but our downstream
  // (e.g. draft_orders/create webhook needs read_draft_orders) would 403.
  // We treat scope drift as `reason=denied` — security: do not distinguish from
  // outright denial so the UX is uniform (T-shopify-oauth-27).
  const missingScopes = detectScopeDrift(tokenResult.scope, SHOPIFY_SCOPES)
  if (missingScopes.length > 0) {
    return fail('denied', `missing scopes: ${missingScopes.join(',')}`)
  }

  // === Step 7: Connection test (reuse existing connection-test, unchanged) ===
  // Pattern G — Test Before Persist. Verify the offline access token actually
  // works against /shop.json before writing it to the DB. Also retrieves the
  // shop name we'll persist as integration label.
  const testResult = await testShopifyConnection(shop, tokenResult.accessToken, clientSecret)
  if (!testResult.success) {
    return fail('shopify_error', `connection-test: ${(testResult.error ?? 'unknown').slice(0, 200)}`)
  }
  const shopName = testResult.shopName ?? shop

  // === Step 8: Auto-create 3 webhooks (D-04 + Pattern 4 — failures NON-blocking) ===
  // createWebhooksAfterOauth uses Promise.allSettled internally. One failed
  // webhook does NOT fail the OAuth — the merchant can retry by reconnecting.
  // Pitfall 9: 422 "address has already been taken" is treated as success
  // (idempotent re-install when disconnect+reconnect — D-03b).
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const webhookUrl = `${baseUrl}/api/webhooks/shopify`
  const webhookResults = await createWebhooksAfterOauth({
    shop,
    accessToken: tokenResult.accessToken,
    webhookUrl,
  })
  for (const r of webhookResults) {
    if (r.ok) {
      console.log(`[oauth-callback] webhook ${r.topic} OK status=${r.status}`)
    } else {
      console.warn(
        `[oauth-callback] webhook ${r.topic} FAILED status=${r.status} error=${(r.error ?? '').slice(0, 200)}`,
      )
    }
  }

  // === Step 9: Persist via domain layer (Regla 3, D-10) ===
  // Open Question 8: persist `granted_scope` so future drift detection (e.g.
  // background job) can compare against SHOPIFY_SCOPES.join(',').
  // `apiSecret: clientSecret` because the existing webhook handler reads
  // `integrations.config.api_secret` to verify HMAC of inbound webhooks
  // (src/app/api/webhooks/shopify/route.ts) — same Dev Dashboard secret.
  const upsertResult = await upsertShopifyIntegration(
    {
      workspaceId: statePayload.workspaceId,
      source: 'oauth-callback',
      actorId: statePayload.userId,
      actorLabel: `user:${statePayload.userId.slice(0, 8)}`,
    },
    {
      shopDomain: shop,
      accessToken: tokenResult.accessToken,
      apiSecret: clientSecret,
      shopName,
      grantedScope: tokenResult.scope,
    },
  )
  if (!upsertResult.success) {
    return fail('shopify_error', `domain-upsert: ${(upsertResult.error ?? 'unknown').slice(0, 200)}`)
  }

  // ... Step 10 added in next task ...

  // TEMP placeholder for Task C verification — Task D replaces this tail.
  void startTime
  void webhookResults
  return fail('shopify_error', 'pipeline incomplete (placeholder — Task D adds step 10)')
}
