// ============================================================================
// Domain Layer — Carrier Events (order_carrier_events)
// Tracks shipment status changes polled from carrier APIs (Envia, etc.).
// Uses createAdminClient (bypass RLS, workspace isolation via explicit filters).
// Pattern follows notes.ts (DomainContext + DomainResult, adminClient per call).
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface InsertCarrierEventParams {
  orderId: string
  guia: string
  carrier: string
  estado: string
  codEstado: number
  novedades: unknown
  rawResponse: unknown
}

// ============================================================================
// Result Types
// ============================================================================

export interface CarrierEvent {
  id: string
  workspace_id: string
  order_id: string
  guia: string
  carrier: string
  estado: string
  cod_estado: number
  novedades: unknown
  raw_response: unknown
  created_at: string
}

// ============================================================================
// WRITE
// ============================================================================

/**
 * Insert a new carrier event row (status change detected by polling).
 * Returns the created event id.
 */
export async function insertCarrierEvent(
  ctx: DomainContext,
  params: InsertCarrierEventParams
): Promise<DomainResult<{ id: string }>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('order_carrier_events')
      .insert({
        workspace_id: ctx.workspaceId,
        order_id: params.orderId,
        guia: params.guia,
        carrier: params.carrier,
        estado: params.estado,
        cod_estado: params.codEstado,
        novedades: params.novedades,
        raw_response: params.rawResponse,
      })
      .select('id')
      .single()

    if (error) {
      return { success: false, error: `INSERT carrier event: ${error.message} (${error.code})` }
    }

    return { success: true, data: { id: data.id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// READ
// ============================================================================

/**
 * Get the most recent carrier event for an order (for change detection).
 * Returns null if no events exist yet.
 */
export async function getLastCarrierEvent(
  ctx: DomainContext,
  orderId: string
): Promise<DomainResult<CarrierEvent | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('order_carrier_events')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return { success: false, error: `SELECT carrier event: ${error.message}` }
    }

    return { success: true, data: (data as CarrierEvent | null) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

/**
 * Get all carrier events for an order (for tracking UI).
 * Ordered by created_at DESC (newest first).
 */
export async function getCarrierEventsByOrder(
  ctx: DomainContext,
  orderId: string
): Promise<DomainResult<CarrierEvent[]>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('order_carrier_events')
      .select('*')
      .eq('workspace_id', ctx.workspaceId)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: `SELECT carrier events: ${error.message}` }
    }

    return { success: true, data: (data as CarrierEvent[]) ?? [] }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
