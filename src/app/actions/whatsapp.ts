'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

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
