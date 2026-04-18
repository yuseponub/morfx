// ============================================================================
// SMS Module — Utilities
// Phone formatting, segment calculation, and time window checking.
// ============================================================================

import {
  SMS_GSM7_SEGMENT_LENGTH,
  SMS_UCS2_SEGMENT_LENGTH,
  TRANSACTIONAL_SOURCES,
} from './constants'

/**
 * Format a Colombian phone number for Onurix API (57XXXXXXXXXX).
 * Handles various input formats:
 * - 3137549286     -> 573137549286
 * - +573137549286  -> 573137549286
 * - 573137549286   -> 573137549286
 * - 03137549286    -> 573137549286
 *
 * @throws Error if phone number is invalid
 */
export function formatColombianPhone(phone: string): string {
  // Strip all non-digits
  const digits = phone.replace(/\D/g, '')

  // Already has 57 prefix and correct length (12 digits)
  if (digits.startsWith('57') && digits.length === 12) {
    return digits
  }

  // 10-digit Colombian mobile (starts with 3)
  if (digits.length === 10 && digits.startsWith('3')) {
    return `57${digits}`
  }

  // 11-digit with leading 0 (local format)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `57${digits.slice(1)}`
  }

  throw new Error(`Numero de telefono colombiano invalido: ${phone}`)
}

/**
 * Calculate the number of SMS segments a message will consume.
 * GSM-7 (ASCII only): 160 chars per segment.
 * UCS-2 (accents, emojis, special chars): 70 chars per segment.
 */
export function calculateSMSSegments(message: string): number {
  // GSM-7 check: basic ASCII printable + newline + carriage return
  const isGSM7 = /^[\x20-\x7E\n\r]*$/.test(message)
  const charsPerSegment = isGSM7 ? SMS_GSM7_SEGMENT_LENGTH : SMS_UCS2_SEGMENT_LENGTH
  return Math.ceil(message.length / charsPerSegment)
}

/**
 * Check whether an SMS source is transactional (bypass time-window guard).
 *
 * Permissive default (D-02): NULL/undefined/unknown sources are treated as transactional
 * so a missing `source` never blocks a legitimate dispatch. Marketing compliance is
 * defended by:
 *  - contract: sms_messages.source is NOT NULL (migration)
 *  - convention: callers must set source explicitly (enforced at code review)
 *
 * @param source - Value of SendSMSParams.source (possibly NULL/undefined).
 * @returns true if the source is transactional OR unknown (permissive); false only for
 *          explicit marketing sources ('campaign' | 'marketing').
 */
export function isTransactionalSource(source?: string | null): boolean {
  if (source == null) return true
  return (TRANSACTIONAL_SOURCES as readonly string[]).includes(source)
}

/**
 * Check if current time is within Colombia marketing-SMS sending window.
 * CRC regulation: marketing SMS only between 8 AM and 9 PM Colombia time.
 *
 * NOTE: This applies ONLY to marketing SMS. Transactional SMS bypass this check
 * via isTransactionalSource(). See standalone sms-time-window-by-type for rationale.
 *
 * NOTE: Current implementation is conservative (daily 8 AM - 9 PM). Actual CRC norm
 * differs by day (L-V 7-9PM, Sáb 8-8PM, Dom/festivos prohibited). Adjustment deferred
 * until campaign module exists.
 */
export function isWithinMarketingSMSWindow(): boolean {
  const now = new Date()
  const colombiaHour = parseInt(
    now.toLocaleString('en-US', {
      timeZone: 'America/Bogota',
      hour: 'numeric',
      hour12: false,
    })
  )
  return colombiaHour >= 8 && colombiaHour < 21
}
