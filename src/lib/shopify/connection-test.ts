// ============================================================================
// Phase 11: Shopify Connection Test Utility
// Tests Shopify connection by making a simple API call to verify credentials
// Uses direct fetch instead of SDK for reliability
// ============================================================================

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
 * Uses direct fetch for reliability (SDK has compatibility issues).
 *
 * @param shopDomain - The shop domain (e.g., "mystore.myshopify.com")
 * @param accessToken - The Admin API access token
 * @param apiSecret - The API secret key (stored for webhook verification)
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

  const baseUrl = `https://${normalizedDomain}/admin/api/2024-01`
  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  }

  try {
    // Test with shop endpoint to verify connection
    const shopResponse = await fetch(`${baseUrl}/shop.json`, { headers })

    if (!shopResponse.ok) {
      const status = shopResponse.status
      if (status === 401) {
        return { success: false, error: 'Access Token invalido o expirado' }
      }
      if (status === 404) {
        return { success: false, error: 'Tienda no encontrada. Verifica el dominio.' }
      }
      if (status === 403) {
        return { success: false, error: 'Acceso denegado. Verifica los permisos de la app.' }
      }
      return { success: false, error: `Error de Shopify: ${status}` }
    }

    const shopData = await shopResponse.json()
    const shopName = shopData.shop?.name || normalizedDomain

    // Get access scopes to verify permissions
    const scopesResponse = await fetch(`${baseUrl}/oauth/access_scopes.json`, { headers })

    if (!scopesResponse.ok) {
      // If we can read shop but not scopes, still consider it a success
      // Some apps may not have this endpoint available
      return {
        success: true,
        shopName,
        scopes: [],
      }
    }

    const scopesData = await scopesResponse.json()
    const scopes = (scopesData.access_scopes || []).map((s: { handle: string }) => s.handle)

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

    return {
      success: true,
      scopes,
      shopName,
    }
  } catch (error: unknown) {
    console.error('Shopify connection test failed:', error)

    // Parse common errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase()

      if (message.includes('enotfound') || message.includes('getaddrinfo')) {
        return { success: false, error: 'No se pudo conectar. Verifica el dominio de la tienda.' }
      }
      if (message.includes('timeout') || message.includes('etimedout')) {
        return { success: false, error: 'Tiempo de espera agotado. Intenta de nuevo.' }
      }
      if (message.includes('fetch failed')) {
        return { success: false, error: 'Error de conexion. Verifica tu internet.' }
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
