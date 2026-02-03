// ============================================================================
// Order Stage to Phase Mapping
// Maps pipeline stages to simplified display phases for WhatsApp conversation UI
// ============================================================================

/**
 * Simplified order phase for display in conversation list.
 * - pending: Needs attention (missing info, unconfirmed)
 * - confirmed: Ready to ship
 * - transit: In shipping process
 * - lost: Failed/returned order
 * - won: Completed successfully (no indicator shown)
 */
export type OrderPhase = 'pending' | 'confirmed' | 'transit' | 'lost' | 'won'

/**
 * Map stage names to phases.
 * Stage names are case-insensitive (converted to lowercase for lookup).
 *
 * Grouped by business meaning:
 * - Pending: Customer needs to confirm, missing info
 * - Confirmed: Order confirmed, ready for fulfillment
 * - Transit: In shipping process (any carrier status)
 * - Lost: Failed delivery, returned, cancelled
 * - Won: Successfully delivered and paid
 */
export const STAGE_TO_PHASE: Record<string, OrderPhase> = {
  // Pending info group - needs attention
  'nuevo': 'pending',
  'falta info': 'pending',
  'falta confirmar': 'pending',
  'pendiente': 'pending',
  'por confirmar': 'pending',

  // Confirmed group - ready for fulfillment
  'confirmado': 'confirmed',
  'en proceso': 'confirmed',
  'por despachar': 'confirmed',
  'listo para envio': 'confirmed',
  'preparando': 'confirmed',

  // Transit group - in shipping
  'despachado': 'transit',
  'enviado': 'transit',
  'en reparto': 'transit',
  'en camino': 'transit',
  'novedad': 'transit',
  'en transito': 'transit',

  // Lost group - failed
  'perdido': 'lost',
  'devuelto': 'lost',
  'cancelado': 'lost',
  'rechazado': 'lost',
  'no entregado': 'lost',

  // Won group - success
  'ganado': 'won',
  'entregado': 'won',
  'completado': 'won',
}

/**
 * Phase display indicators for the conversation list.
 * Emojis chosen for:
 * - Small visual footprint
 * - Clear meaning at a glance
 * - Subtle, not distracting
 */
export const PHASE_INDICATORS: Record<OrderPhase, { emoji: string; label: string; color: string }> = {
  pending: {
    emoji: '\u23F3',  // Hourglass (waiting/pending)
    label: 'Pendiente',
    color: '#f59e0b', // Amber
  },
  confirmed: {
    emoji: '\u2705',  // Check mark (confirmed)
    label: 'Confirmado',
    color: '#22c55e', // Green
  },
  transit: {
    emoji: '\uD83D\uDE9A',  // Delivery truck
    label: 'En transito',
    color: '#3b82f6', // Blue
  },
  lost: {
    emoji: '\u274C',  // Red X (failed)
    label: 'Perdido',
    color: '#ef4444', // Red
  },
  won: {
    emoji: '',  // No indicator for won orders
    label: '',
    color: '',
  },
}

/**
 * Get the phase for a given stage name.
 * Falls back to 'pending' for unknown stages.
 *
 * @param stageName - The pipeline stage name
 * @returns The order phase
 */
export function getOrderPhase(stageName: string): OrderPhase {
  const normalized = stageName.toLowerCase().trim()
  return STAGE_TO_PHASE[normalized] || 'pending'
}

/**
 * Check if an order phase should show an indicator.
 * Won orders don't show indicators (success = no visual noise).
 */
export function shouldShowIndicator(phase: OrderPhase): boolean {
  return phase !== 'won'
}
