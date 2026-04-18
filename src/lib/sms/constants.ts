// ============================================================================
// SMS Module — Constants
// ZERO imports from project (prevents circular dependencies).
// ============================================================================

/** Price per SMS segment in Colombian Pesos */
export const SMS_PRICE_COP = 97

/** Characters per segment for GSM-7 encoding (ASCII only) */
export const SMS_GSM7_SEGMENT_LENGTH = 160

/** Characters per segment for UCS-2 encoding (accents, emojis, special chars) */
export const SMS_UCS2_SEGMENT_LENGTH = 70

/** Onurix API base URL */
export const ONURIX_BASE_URL = 'https://www.onurix.com/api/v1'

// ============================================================================
// SMS Source Taxonomy
// ============================================================================

/**
 * Sources that are inherently transactional — bypass time-window guard (24/7 allowed).
 * Per Colombian CRC Res. 5111/2017: transactional / utility SMS are exempt from schedule.
 *
 * Adding a source here permanently exempts it from marketing-hours enforcement.
 * If a new channel can send marketing, add it to MARKETING_SOURCES instead.
 */
export const TRANSACTIONAL_SOURCES = ['automation', 'domain-call', 'script'] as const

/**
 * Sources that are marketing/commercial — subject to time-window guard.
 * Today: no caller sets these values (campaigns module doesn't exist yet).
 * Future campaign module MUST set source to one of these values by contract (D-02).
 */
export const MARKETING_SOURCES = ['campaign', 'marketing'] as const

export type TransactionalSource = typeof TRANSACTIONAL_SOURCES[number]
export type MarketingSource = typeof MARKETING_SOURCES[number]
export type SMSSource = TransactionalSource | MarketingSource
