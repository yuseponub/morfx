import { parsePhoneNumber } from 'libphonenumber-js'

/**
 * Normalizes a phone number from Shopify to E.164 format.
 *
 * DIFFERENCE FROM src/lib/utils/phone.ts:
 * The existing phone.ts utility is designed for Colombian numbers only.
 * This utility handles international Shopify phone formats because:
 * 1. Shopify stores may have customers from multiple countries
 * 2. Shopify typically includes country codes in phone data
 * 3. We need to match against existing contacts which may be international
 *
 * The normalization strategy:
 * 1. Try automatic country detection (works when country code is present)
 * 2. Fall back to Colombia (CO) for ambiguous local numbers
 *
 * @example
 * normalizeShopifyPhone("+1 555-123-4567")    // "+15551234567" (US)
 * normalizeShopifyPhone("+57 300 123 4567")   // "+573001234567" (Colombia)
 * normalizeShopifyPhone("573001234567")       // "+573001234567" (Colombia)
 * normalizeShopifyPhone("300 123 4567")       // "+573001234567" (assumes CO)
 * normalizeShopifyPhone("invalid")            // null
 *
 * @param phone - Phone number from Shopify customer data
 * @returns E.164 formatted phone or null if invalid/unparseable
 */
export function normalizeShopifyPhone(
  phone: string | null | undefined
): string | null {
  if (!phone) return null

  // Clean the input - remove spaces, dashes, parentheses, dots
  const cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '')
  if (!cleaned) return null

  try {
    // Try parsing with automatic country detection
    // This works when Shopify includes the country code (most common case)
    const phoneNumber = parsePhoneNumber(cleaned)

    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.format('E.164')
    }

    // Fallback: try with CO (Colombia) default for local numbers
    // This handles cases like "300 123 4567" without country code
    const coPhone = parsePhoneNumber(cleaned, 'CO')
    if (coPhone && coPhone.isValid()) {
      return coPhone.format('E.164')
    }

    return null
  } catch {
    // parsePhoneNumber can throw on malformed input
    return null
  }
}

/**
 * Extracts and normalizes phone from a Shopify order, checking multiple sources.
 *
 * Shopify orders may have phone numbers in different locations:
 * - order.phone: Direct order phone (rare)
 * - order.customer.phone: Customer's registered phone
 * - order.shipping_address.phone: Phone for delivery contact
 * - order.billing_address.phone: Phone from payment details
 *
 * Priority order reflects reliability:
 * 1. order.phone - Explicitly provided for this order
 * 2. customer.phone - Customer's primary phone
 * 3. shipping_address.phone - Contact for delivery (common for COD)
 * 4. billing_address.phone - Last resort
 *
 * @param order - Partial Shopify order object with phone fields
 * @returns Normalized E.164 phone or null if no valid phone found
 *
 * @example
 * // Order with customer phone
 * extractPhoneFromOrder({
 *   phone: null,
 *   customer: { phone: "+57 300 123 4567" },
 *   shipping_address: { phone: null }
 * })
 * // Returns: "+573001234567"
 *
 * // Order with only shipping phone
 * extractPhoneFromOrder({
 *   phone: null,
 *   customer: null,
 *   shipping_address: { phone: "300-123-4567" }
 * })
 * // Returns: "+573001234567"
 */
export function extractPhoneFromOrder(order: {
  phone?: string | null
  customer?: { phone?: string | null } | null
  shipping_address?: { phone?: string | null } | null
  billing_address?: { phone?: string | null } | null
}): string | null {
  // Priority: order.phone > customer.phone > shipping.phone > billing.phone
  const candidates = [
    order.phone,
    order.customer?.phone,
    order.shipping_address?.phone,
    order.billing_address?.phone,
  ]

  for (const phone of candidates) {
    const normalized = normalizeShopifyPhone(phone)
    if (normalized) return normalized
  }

  return null
}

/**
 * Extract secondary phone from Shopify note_attributes.
 * COD form apps (Releasit, CodMonster, etc.) store customer phone
 * in note_attributes with various naming conventions.
 *
 * Returns the FIRST valid phone found that differs from primaryPhone,
 * normalized to E.164. Returns null if no phone-like attribute exists,
 * all are invalid, or all match the primary phone.
 *
 * @param noteAttributes - Array of {name, value} pairs from Shopify order
 * @param primaryPhone - The contact's primary phone (E.164) to skip duplicates
 * @returns E.164 formatted secondary phone or null
 */
export function extractSecondaryPhoneFromNoteAttributes(
  noteAttributes: Array<{ name: string; value: string }> | null | undefined,
  primaryPhone: string | null
): string | null {
  if (!noteAttributes || !Array.isArray(noteAttributes)) return null

  const phonePatterns = [
    'phone', 'telefono', 'celular', 'whatsapp',
    'secondary_phone', 'secondary phone',
    'phone_number', 'phone number',
    'numero', 'numero_telefono', 'numero telefono',
    'tel', 'movil', 'mobile',
  ]

  for (const attr of noteAttributes) {
    const name = (attr.name || '').toLowerCase().trim()
    // Check if attribute name matches any phone pattern (exact or substring)
    const isPhoneAttribute = phonePatterns.some(pattern =>
      name === pattern || name.includes(pattern)
    )

    if (!isPhoneAttribute) continue

    const normalized = normalizeShopifyPhone(attr.value)
    if (!normalized) continue

    // Skip if same as primary phone (not a secondary)
    if (normalized === primaryPhone) continue

    return normalized
  }

  return null
}
