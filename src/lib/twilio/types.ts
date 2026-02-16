// ============================================================================
// Phase 20: Twilio Integration Types
// Types for Twilio configuration, SMS messages, and status tracking
// ============================================================================

/**
 * Twilio credentials configuration for a workspace.
 * Stored in the `config` JSONB field of the integrations table (type='twilio').
 */
export interface TwilioConfig {
  /** Twilio Account SID (starts with AC) */
  account_sid: string
  /** Twilio Auth Token */
  auth_token: string
  /** Twilio phone number in E.164 format (e.g., +15017122661) */
  phone_number: string
}

/**
 * SMS message record from the sms_messages table.
 * Tracks every SMS sent/received for usage and cost reporting.
 */
export interface SmsMessage {
  id: string
  workspace_id: string
  /** Twilio Message SID (unique identifier from Twilio) */
  twilio_sid: string
  from_number: string
  to_number: string
  body: string
  direction: 'outbound' | 'inbound'
  status: SmsStatus
  /** Cost in price_unit currency (null until Twilio reports it) */
  price: number | null
  price_unit: string
  /** Number of SMS segments used */
  segments: number
  /** Media URL for MMS messages */
  media_url: string | null
  /** Link to the automation execution that triggered this SMS */
  automation_execution_id: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

/**
 * Twilio SMS delivery status progression:
 * queued -> sending -> sent -> delivered
 *                           -> failed
 *                           -> undelivered
 */
export type SmsStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered'
