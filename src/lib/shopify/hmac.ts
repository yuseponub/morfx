import crypto from 'crypto'

/**
 * Verifies a Shopify webhook HMAC signature.
 *
 * CRITICAL SECURITY NOTES:
 * 1. Must use RAW body string (before JSON parsing) for verification.
 *    The HMAC is computed by Shopify on the exact bytes sent over the wire.
 *    If you parse the body first and re-stringify, whitespace changes will
 *    invalidate the signature.
 *
 * 2. Uses timing-safe comparison to prevent timing attacks.
 *    A timing attack could allow an attacker to determine the correct HMAC
 *    character by character by measuring response time differences.
 *
 * CREDENTIAL CLARIFICATION:
 * - apiSecret: The "API secret key" from your Shopify custom app credentials.
 *              This is used ONLY for HMAC verification.
 * - accessToken: The "Admin API access token" (starts with "shpat_").
 *                This is used for API calls, NOT for HMAC verification.
 *
 * @param rawBody - The raw request body as a string (NOT parsed JSON)
 * @param hmacHeader - The X-Shopify-Hmac-SHA256 header value
 * @param apiSecret - The Shopify API Secret Key (NOT the access token)
 * @returns true if signature is valid, false otherwise
 *
 * @example
 * // In your webhook route handler:
 * const rawBody = await request.text()
 * const hmacHeader = request.headers.get('X-Shopify-Hmac-SHA256')
 * const isValid = verifyShopifyHmac(rawBody, hmacHeader, process.env.SHOPIFY_API_SECRET)
 * if (!isValid) {
 *   return Response.json({ error: 'Invalid signature' }, { status: 401 })
 * }
 * const payload = JSON.parse(rawBody) // Safe to parse now
 */
export function verifyShopifyHmac(
  rawBody: string,
  hmacHeader: string,
  apiSecret: string
): boolean {
  // Generate HMAC using SHA-256 and API secret
  // The algorithm matches Shopify's: HMAC-SHA256(raw_body, secret) -> base64
  const generatedHmac = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody, 'utf8')
    .digest('base64')

  try {
    // Use timing-safe comparison to prevent timing attacks.
    // crypto.timingSafeEqual runs in constant time regardless of where
    // the first difference occurs, preventing attackers from measuring
    // response times to guess the correct HMAC.
    return crypto.timingSafeEqual(
      Buffer.from(generatedHmac),
      Buffer.from(hmacHeader)
    )
  } catch {
    // If buffers have different lengths, timingSafeEqual throws an error.
    // This is a failed verification (wrong HMAC format or length).
    return false
  }
}
