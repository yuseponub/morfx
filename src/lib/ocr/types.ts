/**
 * Phase 27: Robot OCR de Guias — Type Definitions
 *
 * Types for OCR extraction results, matching algorithm, and order candidates.
 */

/** Carrier identifiers detected by OCR from guide images */
export type DetectedCarrier = 'ENVIA' | 'INTER' | 'COORDINADORA' | 'SERVIENTREGA' | 'DESCONOCIDA'

/** Structured data extracted from a shipping guide image by Claude Vision */
export interface GuideOcrResult {
  numeroGuia: string | null
  destinatario: string | null
  direccion: string | null
  ciudad: string | null
  telefono: string | null
  remitente: string | null
  transportadora: DetectedCarrier
  /** OCR confidence 0-100. Reflects readability and data certainty. */
  confianza: number
}

/** Order data needed by the matching algorithm (pre-fetched from DB) */
export interface OrderForMatching {
  id: string
  name: string | null
  contactPhone: string | null
  contactName: string | null
  shippingCity: string | null
  shippingAddress: string | null
  contactId: string | null
}

/** Result of matching a guide against eligible orders */
export interface MatchResult {
  orderId: string
  orderName: string | null
  contactId: string | null
  contactName: string | null
  contactPhone: string | null
  shippingCity: string | null
  /** Overall match confidence 0-100 */
  confidence: number
  /** Which criterion produced the match */
  matchedBy: 'phone' | 'name' | 'city' | 'address'
}

/** Per-image processing result used by the orchestrator */
export interface OcrItemResult {
  itemId: string
  fileName: string
  ocrData: GuideOcrResult | null
  match: MatchResult | null
  /** true if auto-assigned (confidence >= 70), false if pending confirmation */
  autoAssigned: boolean
  /** Error message if OCR failed entirely */
  error?: string
}
