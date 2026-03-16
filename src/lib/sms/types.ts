// ============================================================================
// SMS Module — Types
// Onurix API response types and SMS status definitions.
// ============================================================================

/**
 * Onurix send SMS API response.
 * POST /api/v1/sms/send
 */
export interface OnurixSendResponse {
  /** 1 = success */
  status: number
  /** dispatch_id for status checks */
  id: string
  data: {
    state: string
    /** Actual segments used (for billing) */
    credits: number
    sms: string
    phone: string
  }
}

/**
 * Onurix message status check response item.
 * GET /api/v1/messages-state
 */
export interface OnurixStatusItem {
  /** "Enviado" = delivered by carrier */
  state: string
  id: string
  credits: number
  phone: string
  sms: string
  dispatch_id: string
}

/**
 * Internal SMS status tracking.
 */
export type SmsStatus = 'pending' | 'sent' | 'delivered' | 'failed'
