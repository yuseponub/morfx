// ============================================================================
// Phase 11: Shopify Connection Test Utility
// Tests Shopify connection by making a simple API call to verify credentials
// ============================================================================

import { shopifyApi, ApiVersion, Session } from '@shopify/shopify-api'
import '@shopify/shopify-api/adapters/node'

/**
 * Result of testing Shopify connection.
 */
export interface ConnectionTestResult {
  /** Whether the connection test succeeded */
  success: boolean
  /** Error message if the test failed */
  error?: string
  /** Scopes the app has access to (if successful) */
  scopes?: string[]
  /** Shop name from Shopify (if successful) */
  shopName?: string
}

/**
 * Tests Shopify connection by making a simple API call.
 * This verifies the credentials are valid and have required permissions.
 *
 * @param shopDomain - The shop domain (e.g., "mystore.myshopify.com")
 * @param accessToken - The Admin API access token
 * @param apiSecret - The API secret key (needed to initialize SDK)
 * @returns Test result with scopes and shop name if successful
 */
export async function testShopifyConnection(
  shopDomain: string,
  accessToken: string,
  apiSecret: string
): Promise<ConnectionTestResult> {
  // Normalize shop domain
  const normalizedDomain = normalizeShopDomain(shopDomain)
  if (!normalizedDomain) {
    return { success: false, error: 'Dominio de tienda invalido' }
  }

  try {
    // Initialize Shopify API client
    const shopify = shopifyApi({
      apiKey: 'not-used-for-custom-apps',
      apiSecretKey: apiSecret,
      hostName: normalizedDomain,
      apiVersion: ApiVersion.January25,
      isCustomStoreApp: true,
      isEmbeddedApp: false,
      adminApiAccessToken: accessToken,
    })

    // Create session for API calls
    const session = shopify.session.customAppSession(normalizedDomain)

    // Create REST client
    const client = new shopify.clients.Rest({ session })

    // Test with access_scopes endpoint (lightweight, always available)
    const response = await client.get<{
      access_scopes: Array<{ handle: string }>
    }>({
      path: 'oauth/access_scopes',
    })

    const scopes = response.body.access_scopes.map(s => s.handle)

    // Verify required scopes for order and customer data
    const requiredScopes = ['read_orders', 'read_customers']
    const missingScopes = requiredScopes.filter(s => !scopes.includes(s))

    if (missingScopes.length > 0) {
      return {
        success: false,
        error: `Permisos faltantes: ${missingScopes.join(', ')}. La app necesita: read_orders, read_customers`,
        scopes,
      }
    }

    // Get shop info for confirmation
    const shopResponse = await client.get<{
      shop: { name: string; domain: string }
    }>({
      path: 'shop',
    })

    return {
      success: true,
      scopes,
      shopName: shopResponse.body.shop.name,
    }
  } catch (error: unknown) {
    console.error('Shopify connection test failed:', error)

    // Parse common errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase()

      if (message.includes('401') || message.includes('unauthorized')) {
        return { success: false, error: 'Access Token invalido o expirado' }
      }
      if (message.includes('404') || message.includes('not found')) {
        return { success: false, error: 'Tienda no encontrada. Verifica el dominio.' }
      }
      if (message.includes('403') || message.includes('forbidden')) {
        return { success: false, error: 'Acceso denegado. Verifica los permisos de la app.' }
      }
      if (message.includes('enotfound') || message.includes('getaddrinfo')) {
        return { success: false, error: 'No se pudo conectar. Verifica el dominio de la tienda.' }
      }
      if (message.includes('timeout')) {
        return { success: false, error: 'Tiempo de espera agotado. Intenta de nuevo.' }
      }

      return { success: false, error: error.message }
    }

    return { success: false, error: 'Error desconocido al conectar con Shopify' }
  }
}

/**
 * Normalizes shop domain to mystore.myshopify.com format.
 * Accepts:
 * - Full URL: https://mystore.myshopify.com
 * - Domain with suffix: mystore.myshopify.com
 * - Just store name: mystore
 *
 * @param input - Raw shop domain input from user
 * @returns Normalized domain or null if invalid
 */
export function normalizeShopDomain(input: string): string | null {
  if (!input || typeof input !== 'string') return null

  let domain = input.trim().toLowerCase()

  // Remove protocol if present
  domain = domain.replace(/^https?:\/\//, '')

  // Remove trailing slash
  domain = domain.replace(/\/$/, '')

  // Remove path if present
  domain = domain.split('/')[0]

  // Validate format
  // Accept: mystore.myshopify.com OR mystore (and add .myshopify.com)
  if (domain.endsWith('.myshopify.com')) {
    // Validate the store name part
    const storeName = domain.replace('.myshopify.com', '')
    if (isValidStoreName(storeName)) {
      return domain
    }
    return null
  }

  // If just store name provided, add .myshopify.com
  if (isValidStoreName(domain)) {
    return `${domain}.myshopify.com`
  }

  // Custom domains not supported for API access
  return null
}

/**
 * Validates that a store name follows Shopify naming rules.
 * Store names can contain lowercase letters, numbers, and hyphens.
 */
function isValidStoreName(name: string): boolean {
  if (!name) return false
  // Shopify store names: lowercase alphanumeric and hyphens
  // Cannot start or end with hyphen, min 1 char
  if (/^[a-z0-9][a-z0-9\-]*[a-z0-9]$/.test(name)) {
    return true
  }
  // Single character store names
  if (/^[a-z0-9]$/.test(name)) {
    return true
  }
  return false
}
