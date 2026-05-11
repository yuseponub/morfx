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

  // ... Steps 4-10 added in subsequent tasks ...

  // TEMP placeholder for Task A verification — Tasks B/C/D replace this entire tail.
  void statePayload
  void code
  void startTime
  return fail('shopify_error', 'pipeline incomplete (placeholder — Tasks B/C/D add steps 4-10)')
}
