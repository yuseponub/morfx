/**
 * Phone number normalization utilities.
 *
 * INTERNATIONAL BY DEFAULT:
 * - Auto-detects country from international prefix (e.g., +1 for US, +52 for MX)
 * - Falls back to Colombia (CO) ONLY for inputs with no country code
 * - Accepts valid numbers from ANY country, not just Colombia
 *
 * Uses libphonenumber-js for parsing and formatting.
 */

import {
  parsePhoneNumber,
  parsePhoneNumberFromString,
  isValidPhoneNumber,
} from 'libphonenumber-js'

/**
 * Normalizes a phone number to E.164 format.
 *
 * Auto-detects country from international prefix when present.
 * Falls back to Colombia (CO) for local numbers without country code
 * (backward compatibility with existing CO-only data).
 *
 * Examples:
 * - "+1 714-408-2081"     -> "+17144082081"  (US, from +1)
 * - "+52 55 1234 5678"    -> "+525512345678" (MX, from +52)
 * - "+57 300 123 4567"    -> "+573001234567" (CO, from +57)
 * - "300 123 4567"        -> "+573001234567" (CO fallback)
 * - "3001234567"          -> "+573001234567" (CO fallback)
 * - "573001234567"        -> "+573001234567" (CO, detected from 57 prefix)
 * - "17144082081"         -> "+17144082081"  (US, detected from 1 prefix)
 *
 * @param input - Raw phone number string
 * @returns E.164 formatted phone or null if invalid
 */
export function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  // Clean the input - remove spaces, dashes, parentheses, dots
  const cleaned = input.trim().replace(/[\s\-\(\)\.]/g, '')

  // Empty after cleaning
  if (!cleaned) {
    return null
  }

  try {
    // Strategy 1: If input has a + prefix, parse as international (auto-detect country)
    if (cleaned.startsWith('+')) {
      const phone = parsePhoneNumberFromString(cleaned)
      if (phone && phone.isValid()) {
        return phone.format('E.164')
      }
      return null
    }

    // Strategy 2: Short local number (<=10 digits) — assume Colombia (backward compat)
    // This preserves existing behavior for CO numbers typed without country code.
    if (cleaned.length <= 10) {
      const coPhone = parsePhoneNumberFromString(cleaned, 'CO')
      if (coPhone && coPhone.isValid() && coPhone.country === 'CO') {
        return coPhone.format('E.164')
      }
      return null
    }

    // Strategy 3: Longer number (11+ digits) without + — likely includes a country code.
    // Try auto-detecting by prepending + (handles "17144082081", "573001234567", etc.)
    const withPlus = parsePhoneNumberFromString('+' + cleaned)
    if (withPlus && withPlus.isValid()) {
      return withPlus.format('E.164')
    }

    // Strategy 4: Last resort — fall back to Colombia default
    const coPhone = parsePhoneNumberFromString(cleaned, 'CO')
    if (coPhone && coPhone.isValid() && coPhone.country === 'CO') {
      return coPhone.format('E.164')
    }

    return null
  } catch {
    return null
  }
}

/**
 * Formats an E.164 phone number for display
 * Input: +573001234567
 * Output: +57 300 123 4567
 *
 * @param e164 - Phone number in E.164 format
 * @returns Formatted phone for display
 */
export function formatPhoneDisplay(e164: string): string {
  if (!e164 || typeof e164 !== 'string') {
    return ''
  }

  try {
    const phoneNumber = parsePhoneNumber(e164)
    if (!phoneNumber) {
      return e164
    }

    // Format as international (includes +country code with spaces)
    return phoneNumber.formatInternational()
  } catch {
    return e164
  }
}

/**
 * Validates if a string is a valid Colombian phone number
 *
 * @param input - Raw phone number string
 * @returns true if valid Colombian phone number
 */
/**
 * Normalize phone to E.164 format WITHOUT + prefix.
 * Used by Somnio agent for backward compatibility with datos_capturados format.
 * Example: "300 123 4567" -> "573001234567"
 */
export function normalizePhoneRaw(input: string): string {
  if (!input || typeof input !== 'string') {
    return input
  }

  // Strip all non-digits
  const digits = input.replace(/\D/g, '')

  // 10 digits starting with 3 (Colombian mobile)
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`
  }

  // 12 digits starting with 57 and third digit is 3 (already formatted)
  if (digits.length === 12 && digits.startsWith('573')) {
    return digits
  }

  // 11 digits starting with 57 (missing a digit - try to fix)
  if (digits.length === 11 && digits.startsWith('57')) {
    // Could be user typed 57 + 9-digit number
    return digits
  }

  // 10 digits starting with 57 (incorrectly formatted, missing digits)
  // Return as-is, might be landline or other format
  if (digits.length >= 7 && digits.length <= 12) {
    return digits
  }

  // Return original if we can't normalize
  return input
}

export function isValidColombianPhone(input: string): boolean {
  if (!input || typeof input !== 'string') {
    return false
  }

  const cleaned = input.trim().replace(/[\s\-\(\)\.]/g, '')

  try {
    // Check if it's a valid phone number for Colombia
    const isValid = isValidPhoneNumber(cleaned, 'CO')
    if (!isValid) {
      return false
    }

    // Additionally verify it parses to a Colombian number
    const phoneNumber = parsePhoneNumber(cleaned, 'CO')
    return phoneNumber?.country === 'CO'
  } catch {
    return false
  }
}

/**
 * Validates a phone number from ANY country.
 * Uses the same logic as normalizePhone — if it can be normalized, it's valid.
 *
 * Accepts:
 * - International numbers with + prefix (auto-detects country)
 * - Colombian numbers without country code (backward compat fallback)
 *
 * @param input - Raw phone number string
 * @returns true if the phone number is valid for any country
 */
export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null
}
