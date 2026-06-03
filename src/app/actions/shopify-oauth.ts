'use server'

// ============================================================================
// Server Action: Start Shopify OAuth (Standalone shopify-dev-dashboard-oauth)
//
// Plan 04 / Wave 2.
//
// Called by src/app/(dashboard)/configuracion/integraciones/components/shopify-form.tsx
// (Plan 06) when the user clicks "Conectar con Shopify". On success the client
// performs `window.location.href = redirectUrl` (cross-origin → NOT router.push).
//
// Auth gate (copy of saveShopifyIntegration pattern in shopify.ts:184-210):
//   1. getRequestAuth() (local JWT verify; identity + workspaceId from cookie)
//   2. workspaceId is session-derived (cookie morfx_workspace)
//   3. workspace_members.role === 'owner'
//
// Domain validation (defense in depth — Pitfall 3 anti-injection):
//   normalizeShopDomain (existing helper) → STRICT regex below.
//
// Credentials (D-15 OVERRIDE):
//   This file NEVER touches `process.env.SHOPIFY_*`. The only env var read here
//   is `NEXT_PUBLIC_APP_URL` (public, used to build the callback redirect_uri).
//   All Shopify OAuth secrets (clientId, clientSecret, stateSecret) live in
//   `platform_config` and are read implicitly by the async helpers in
//   `src/lib/shopify/oauth.ts` (Plan 03), which await `getShopifyOAuthConfig()`
//   internally (Plan 02 fail-CLOSED helper).
//   Verifiable: `grep -E "process\.env\.SHOPIFY_(CLIENT|OAUTH)" \
//   src/app/actions/shopify-oauth.ts` returns 0 matches.
//
// Regla 3: NO domain mutations here. The only DB read is workspace_members
// (auth check, identical to shopify.ts). Plan 05 callback handles the upsert.
// ============================================================================

import { normalizeShopDomain } from '@/lib/shopify/connection-test'
import { buildAuthorizeUrl, generateNonce, signStateJwt } from '@/lib/shopify/oauth'
import { createClient } from '@/lib/supabase/server'
import { getRequestAuth } from '@/lib/auth/request-auth'

/**
 * STRICT shop domain regex (Pitfall 3, defense in depth).
 *
 * `normalizeShopDomain` already validates the format (lowercase a-z0-9 and
 * hyphens, ending in `.myshopify.com`), but we re-validate here against an
 * explicit anchored regex so any future change to the helper does not silently
 * weaken the OAuth start path. The shop is interpolated into the authorize URL
 * (`https://${shop}/admin/oauth/authorize?...`) so any unexpected character
 * could become a Host-header injection or open redirect vector.
 *
 * Accepts shop names that begin with a digit (e.g. `6xvhnx-1v.myshopify.com`),
 * which matches Shopify's own conventions for development-store handles.
 */
const SHOP_DOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

/**
 * Entry point of the Shopify OAuth flow.
 *
 * Returns the authorize URL the client should navigate to (cross-origin).
 * Envelope shape `{ success, error | redirectUrl }` matches the convention of
 * the other server actions in `src/app/actions/shopify.ts`.
 *
 * Errors are surfaced as Spanish messages suitable for a toast (D-12). Server
 * logs include the failure detail; the client message is generic when the
 * failure could leak which env var / credential is missing.
 */
export async function startShopifyOauth(input: { shopDomain: string }): Promise<
  | { success: true; redirectUrl: string }
  | { success: false; error: string }
> {
  // === Auth gate (copy of shopify.ts:184-210) ============================
  const auth = await getRequestAuth()
  if (!auth) {
    return { success: false, error: 'No autenticado' }
  }
  const workspaceId = auth.workspaceId

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', auth.userId)
    .single()

  if (!member || member.role !== 'owner') {
    return { success: false, error: 'Solo el Owner puede conectar integraciones' }
  }

  // === Validate shop domain (defense in depth — Pitfall 3) ===============
  const shop = normalizeShopDomain(input.shopDomain)
  if (!shop) {
    return {
      success: false,
      error: 'Dominio invalido. Debe ser tu-tienda.myshopify.com',
    }
  }

  if (!SHOP_DOMAIN_REGEX.test(shop)) {
    return {
      success: false,
      error: 'Dominio invalido. Debe ser tu-tienda.myshopify.com',
    }
  }

  // === Sign state JWT (D-08) =============================================
  // The state carries { workspaceId, userId, nonce } self-contained so the
  // callback (Plan 05) can re-establish identity cross-origin (Shopify's
  // redirect arrives without our cookies). signStateJwt awaits
  // getShopifyOAuthConfig() internally and throws fail-CLOSED if the
  // platform_config secret is missing or weak (<32 chars).
  let state: string
  try {
    state = await signStateJwt({
      workspaceId,
      userId: auth.userId,
      nonce: generateNonce(),
    })
  } catch (err) {
    // Never log the secret value; getShopifyOAuthConfig errors include only
    // the key name + remediation hint. Log with shop for correlation.
    console.error('[startShopifyOauth] state JWT sign failed:', {
      message: err instanceof Error ? err.message : String(err),
      shop,
    })
    return {
      success: false,
      error: 'Configuracion OAuth incompleta. Contacta al administrador.',
    }
  }

  // === Build redirect URI (Pitfall 10 — must match Dev Dashboard EXACTLY) =
  // NEXT_PUBLIC_APP_URL is the only env var read in this file (public, NOT a
  // Shopify secret). NO trailing slash — the URL string must be byte-identical
  // to what's registered in Shopify Dev Dashboard → Settings → Redirection URLs.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!baseUrl) {
    console.error('[startShopifyOauth] NEXT_PUBLIC_APP_URL not set', { shop })
    return {
      success: false,
      error: 'Configuracion OAuth incompleta. Contacta al administrador.',
    }
  }
  const redirectUri = `${baseUrl}/api/integrations/shopify/oauth/callback`

  // === Build authorize URL (Plan 03 helper) ==============================
  // buildAuthorizeUrl awaits getShopifyOAuthConfig() internally for clientId
  // (D-15) and joins SHOPIFY_SCOPES. Returns the absolute URL the client must
  // navigate to via window.location.href (cross-origin → NOT router.push).
  let redirectUrl: string
  try {
    redirectUrl = await buildAuthorizeUrl({ shop, state, redirectUri })
  } catch (err) {
    console.error('[startShopifyOauth] buildAuthorizeUrl failed:', {
      message: err instanceof Error ? err.message : String(err),
      shop,
    })
    return {
      success: false,
      error: 'Configuracion OAuth incompleta. Contacta al administrador.',
    }
  }

  return { success: true, redirectUrl }
}
