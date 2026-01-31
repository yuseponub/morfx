/**
 * Phone number normalization utilities for Colombian phone numbers
 * Uses libphonenumber-js for parsing and formatting
 */

import {
  parsePhoneNumber,
  isValidPhoneNumber,
  type PhoneNumber,
} from 'libphonenumber-js'

/**
 * Normalizes a phone number to E.164 format (+573001234567)
 * Handles various input formats:
 * - 3001234567
 * - 300 123 4567
 * - +57 300 123 4567
 * - 57-300-123-4567
 *
 * @param input - Raw phone number string
 * @returns E.164 formatted phone (+573001234567) or null if invalid
 */
export function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  // Clean the input - remove spaces, dashes, parentheses
  const cleaned = input.trim().replace(/[\s\-\(\)\.]/g, '')

  // Empty after cleaning
  if (!cleaned) {
    return null
  }

  try {
    // Try parsing with CO (Colombia) as default country
    let phoneNumber: PhoneNumber | undefined

    // If starts with + or country code 57, parse as-is
    if (cleaned.startsWith('+') || cleaned.startsWith('57')) {
      phoneNumber = parsePhoneNumber(cleaned, 'CO')
    } else {
      // Assume it's a local number without country code
      phoneNumber = parsePhoneNumber(cleaned, 'CO')
    }

    if (!phoneNumber || !phoneNumber.isValid()) {
      return null
    }

    // Verify it's a Colombian number
    if (phoneNumber.country !== 'CO') {
      return null
    }

    // Return E.164 format
    return phoneNumber.format('E.164')
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
