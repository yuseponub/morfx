'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import type { OrderSummary } from '@/lib/whatsapp/types'
import { getOrderPhase } from '@/lib/orders/stage-phases'

// ============================================================================
// ORDERS FOR CONTACT PANEL
// ============================================================================

interface RecentOrder {
  id: string
  total_value: number | null
  stage: { name: string; color: string } | null
  created_at: string
}

/**
 * Get recent orders for a contact.
 * Used in the WhatsApp contact panel to show order history.
 *
 * @param contactId - Contact UUID
 * @param limit - Maximum number of orders (default 5)
 */
export async function getRecentOrders(
  contactId: string,
  limit: number = 5
): Promise<RecentOrder[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      total_value,
      created_at,
      stage:pipeline_stages(name, color)
    `)
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching recent orders:', error)
    return []
  }

  return (data || []).map((order) => {
    // Supabase returns single relation as object, but TypeScript thinks it could be array
    const stage = order.stage as unknown
    const stageData = Array.isArray(stage) ? stage[0] : stage

    return {
      id: order.id,
      total_value: order.total_value,
      stage: stageData as { name: string; color: string } | null,
      created_at: order.created_at,
    }
  })
}

// ============================================================================
// ORDER FETCHING FOR WHATSAPP CONTEXT (PHASE 9)
// ============================================================================

/**
 * Get all orders for a contact with stage information.
 * Used for order indicators in conversation list and contact panel.
 *
 * @param contactId - The contact ID to fetch orders for
 * @param limit - Maximum number of orders to return (default: 10)
 */
export async function getContactOrders(
  contactId: string,
  limit: number = 10
): Promise<OrderSummary[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      total_value,
      created_at,
      updated_at,
      stage:pipeline_stages(id, name, color, is_closed),
      pipeline:pipelines(id, name)
    `)
    .eq('workspace_id', workspaceId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching contact orders:', error)
    return []
  }

  // Transform to OrderSummary format
  return (data || []).map((order) => {
    const stage = order.stage as unknown
    const stageData = Array.isArray(stage) ? stage[0] : stage
    const pipeline = order.pipeline as unknown
    const pipelineData = Array.isArray(pipeline) ? pipeline[0] : pipeline

    return {
      id: order.id,
      total_value: order.total_value,
      stage: stageData as OrderSummary['stage'],
      pipeline: pipelineData as OrderSummary['pipeline'],
      created_at: order.created_at,
      updated_at: order.updated_at,
    }
  }).filter(order => order.stage !== null)
}

/**
 * Get active (non-won) orders for a contact.
 * Used for order status indicators in conversation list.
 * Active = stage phase is not 'won'
 */
export async function getActiveContactOrders(
  contactId: string,
  limit: number = 5
): Promise<OrderSummary[]> {
  const orders = await getContactOrders(contactId, limit * 2) // Fetch more to filter

  // Filter out won orders
  return orders
    .filter(order => {
      const phase = getOrderPhase(order.stage.name)
      return phase !== 'won'
    })
    .slice(0, limit)
}

/**
 * Get orders for multiple contacts in batch.
 * Used for efficiently loading order indicators in conversation list.
 *
 * @param contactIds - Array of contact IDs
 * @returns Map of contactId -> OrderSummary[]
 */
export async function getOrdersForContacts(
  contactIds: string[]
): Promise<Map<string, OrderSummary[]>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Map()
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return new Map()
  }

  if (contactIds.length === 0) {
    return new Map()
  }

  const { data, error } = await supabase
    .from('orders')
    .select(`
      id,
      contact_id,
      total_value,
      created_at,
      updated_at,
      stage:pipeline_stages(id, name, color, is_closed),
      pipeline:pipelines(id, name)
    `)
    .eq('workspace_id', workspaceId)
    .in('contact_id', contactIds)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching orders for contacts:', error)
    return new Map()
  }

  // Group by contact_id
  const ordersByContact = new Map<string, OrderSummary[]>()

  for (const order of data || []) {
    const stage = order.stage as unknown
    const stageData = Array.isArray(stage) ? stage[0] : stage
    const pipeline = order.pipeline as unknown
    const pipelineData = Array.isArray(pipeline) ? pipeline[0] : pipeline

    if (!stageData || !order.contact_id) continue

    const contactId = order.contact_id as string
    const existing = ordersByContact.get(contactId) || []
    existing.push({
      id: order.id,
      total_value: order.total_value,
      stage: stageData as OrderSummary['stage'],
      pipeline: pipelineData as OrderSummary['pipeline'],
      created_at: order.created_at,
      updated_at: order.updated_at,
    })
    ordersByContact.set(contactId, existing)
  }

  return ordersByContact
}
