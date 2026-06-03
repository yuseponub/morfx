'use server'

import { getRequestAuth } from '@/lib/auth/request-auth'
import { getCarrierEventsByOrder } from '@/lib/domain/carrier-events'
import type { DomainContext } from '@/lib/domain/types'

// ============================================================================
// Carrier Tracking Events — Server Actions
// ============================================================================

export interface TrackingEvent {
  id: string
  estado: string
  cod_estado: number
  novedades: any[]
  created_at: string
}

/**
 * Get all carrier tracking events for an order.
 * Returns events sorted by created_at DESC (newest first).
 */
export async function getOrderTrackingEvents(orderId: string): Promise<TrackingEvent[]> {
  try {
    const auth = await getRequestAuth()
    if (!auth) return []
    const workspaceId = auth.workspaceId

    // Delegate to domain layer
    const ctx: DomainContext = { workspaceId, source: 'server-action' }
    const result = await getCarrierEventsByOrder(ctx, orderId)

    if (!result.success) {
      console.error('Error fetching carrier events:', result.error)
      return []
    }

    return (result.data ?? []) as TrackingEvent[]
  } catch (error) {
    console.error('Error in getOrderTrackingEvents:', error)
    return []
  }
}
