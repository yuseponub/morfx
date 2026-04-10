'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
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
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Get workspace_id from cookie
    const cookieStore = await cookies()
    const workspaceId = cookieStore.get('morfx_workspace')?.value
    if (!workspaceId) return []

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
