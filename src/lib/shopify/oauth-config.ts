// ============================================================================
// Shopify OAuth — Credentials helper (Standalone shopify-dev-dashboard-oauth, D-15)
//
// Lee las 3 credenciales del flujo OAuth de Shopify Dev Dashboard desde la tabla
// `platform_config` (Phase 44.1) en vez de Vercel env vars.
//
// Keys leidas (definidas en `supabase/migrations/20260512000000_shopify_oauth_credentials.sql`):
//   - shopify_oauth_client_id      → Dev Dashboard Client ID
//   - shopify_oauth_client_secret  → Dev Dashboard Client Secret (HMAC + token exchange)
//   - shopify_oauth_state_secret   → server-side secret para firmar state JWT (>=32 chars)
//
// ──────────────────────────────────────────────────────────────────────────
// FAIL-CLOSED OVERRIDE (D-15)
// ──────────────────────────────────────────────────────────────────────────
// `getPlatformConfig` por default es FAIL-OPEN: si la key falta o la BD esta
// caida, devuelve el `fallback` provisto por el caller. Ese contract es
// correcto para kill-switches o rate-limits (un blip de DB no debe tumbar
// bots), pero para credenciales OAuth es PELIGROSO:
//
//   - Si client_secret falta y devolvemos string vacio, generariamos requests
//     a Shopify firmados con HMAC vacio → Shopify devuelve 401 → confusion.
//   - Si state_secret falta o es debil (<32 chars), JWTs de state son
//     trivialmente forgeables → atacante puede iniciar OAuth pretendiendo
//     ser otro workspace.
//
// Por eso este wrapper THROWS si:
//   - cualquiera de las 3 keys es null / undefined / string vacio, o
//   - state_secret tiene menos de 32 chars (fuerza minima recomendada por
//     RFC 7518 §3.2 para HS256 — RESEARCH A2).
//
// El error se propaga al caller (server action de start OAuth o callback
// route) que debe redirigir al usuario con `?error=oauth_failed&reason=...`
// y loguear server-side el detalle.
//
// ──────────────────────────────────────────────────────────────────────────
// CACHE
// ──────────────────────────────────────────────────────────────────────────
// Reutiliza el cache de 30s built-in de `getPlatformConfig` (PLATFORM_CONFIG_TTL_MS).
// NO se anade otra capa de cache aqui — eso introduciria una segunda ventana
// de consistencia y duplicaria el runbook (esperar 30s tras UPDATE en
// Supabase Studio para que el cambio propague).
// ============================================================================

import { getPlatformConfig } from '@/lib/domain/platform-config'

// ============================================================================
// Constantes
// ============================================================================

/** Longitud minima del state secret para HS256 (RFC 7518 §3.2 + RESEARCH A2). */
export const SHOPIFY_OAUTH_STATE_SECRET_MIN_LENGTH = 32

/** Keys leidas de `platform_config` (verificable por grep desde tests). */
const KEY_CLIENT_ID = 'shopify_oauth_client_id'
const KEY_CLIENT_SECRET = 'shopify_oauth_client_secret'
const KEY_STATE_SECRET = 'shopify_oauth_state_secret'

// ============================================================================
// Tipos
// ============================================================================

/**
 * Credenciales completas del flujo OAuth de Shopify Dev Dashboard.
 *
 * Los 3 campos son obligatorios (no opcionales) — la unica forma de obtener
 * un valor de este shape es via `getShopifyOAuthConfig()`, que THROWS si
 * cualquiera falta. Cualquier consumer que reciba este objeto puede asumir
 * los 3 strings son no-vacios.
 */
export interface ShopifyOAuthConfig {
  clientId: string
  clientSecret: string
  stateSecret: string
}

// ============================================================================
// getShopifyOAuthConfig
// ============================================================================

/**
 * Lee las credenciales OAuth de Shopify desde `platform_config` con politica
 * fail-CLOSED. THROWS si cualquier credencial falta o esta debil.
 *
 * Patron de uso:
 *   try {
 *     const oauth = await getShopifyOAuthConfig()
 *     // ... usar oauth.clientId / oauth.clientSecret / oauth.stateSecret
 *   } catch (err) {
 *     console.error('[shopify-oauth] config invalid:', err)
 *     return NextResponse.redirect('/configuracion/integraciones?error=oauth_failed&reason=config_missing')
 *   }
 *
 * @throws Error con mensaje descriptivo del campo invalido (sin exponer
 *   valores secretos en el mensaje — solo nombres de keys). El caller debe
 *   loguear server-side y redirigir UX-safe.
 */
export async function getShopifyOAuthConfig(): Promise<ShopifyOAuthConfig> {
  // Lecturas en paralelo (3 cache lookups o 3 SELECTs concurrentes).
  // Fallback `null` para que getPlatformConfig type-coerce a string|null.
  const [clientIdRaw, clientSecretRaw, stateSecretRaw] = await Promise.all([
    getPlatformConfig<string | null>(KEY_CLIENT_ID, null),
    getPlatformConfig<string | null>(KEY_CLIENT_SECRET, null),
    getPlatformConfig<string | null>(KEY_STATE_SECRET, null),
  ])

  // Validacion fail-CLOSED — orden de checks deliberado:
  // 1) presencia (null / undefined / vacio / no-string), 2) fuerza del state secret.
  const clientId = ensureNonEmptyString(KEY_CLIENT_ID, clientIdRaw)
  const clientSecret = ensureNonEmptyString(KEY_CLIENT_SECRET, clientSecretRaw)
  const stateSecret = ensureNonEmptyString(KEY_STATE_SECRET, stateSecretRaw)

  if (stateSecret.length < SHOPIFY_OAUTH_STATE_SECRET_MIN_LENGTH) {
    throw new Error(
      `[shopify-oauth] platform_config["${KEY_STATE_SECRET}"] is too short ` +
        `(${stateSecret.length} chars; min ${SHOPIFY_OAUTH_STATE_SECRET_MIN_LENGTH}). ` +
        `Generate with \`openssl rand -base64 32\` and update via Supabase Studio.`,
    )
  }

  // Reject placeholder values that the migration inserts. The migration
  // intentionally seeds `<REPLACE_*>` so getShopifyOAuthConfig fails until
  // the operator runs the 3 UPDATE statements with real values.
  for (const [key, value] of [
    [KEY_CLIENT_ID, clientId],
    [KEY_CLIENT_SECRET, clientSecret],
    [KEY_STATE_SECRET, stateSecret],
  ] as const) {
    if (value.startsWith('<REPLACE_')) {
      throw new Error(
        `[shopify-oauth] platform_config["${key}"] still holds the migration ` +
          `placeholder. Run the UPDATE in Supabase Studio with the real value ` +
          `from Shopify Dev Dashboard (or \`openssl rand -base64 32\`).`,
      )
    }
  }

  return { clientId, clientSecret, stateSecret }
}

// ============================================================================
// Helpers internos
// ============================================================================

/**
 * Normaliza el valor leido de `platform_config` a string no-vacio o lanza Error.
 *
 * Acepta:
 *   - string con contenido (≥1 char tras trim) → devuelve trimmed
 *
 * Rechaza (THROWS):
 *   - null
 *   - undefined
 *   - string vacio o solo whitespace
 *   - cualquier otro tipo (number, boolean, object) — defensa contra miscast
 *     de getPlatformConfig si alguien escribio JSONB con shape incorrecto
 *     directamente en BD.
 */
function ensureNonEmptyString(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    throw new Error(
      `[shopify-oauth] platform_config["${key}"] is missing. ` +
        `Apply migration 20260512000000_shopify_oauth_credentials.sql and ` +
        `update the value via Supabase Studio.`,
    )
  }

  if (typeof value !== 'string') {
    throw new Error(
      `[shopify-oauth] platform_config["${key}"] has wrong JSONB type ` +
        `(expected string, got ${typeof value}). Update via Supabase Studio.`,
    )
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error(
      `[shopify-oauth] platform_config["${key}"] is empty. ` +
        `Update with the real value via Supabase Studio.`,
    )
  }

  return trimmed
}
