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
