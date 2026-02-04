'use server'

import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// ============================================================================
// Types
// ============================================================================

export interface SearchableItem {
  type: 'contact' | 'order' | 'conversation'
  id: string
  title: string      // Primary text (name, order #, phone)
  subtitle: string   // Secondary info (phone, amount, last message)
  href: string       // Navigation target
}

// ============================================================================
// Server Action
// ============================================================================

/**
 * Fetch all searchable items for the current workspace.
 * Returns contacts, orders, and conversations formatted for search display.
 */
export async function getSearchableItems(): Promise<SearchableItem[]> {
  const supabase = await createClient()

  // Get workspace from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) return []

  // Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Fetch in parallel
  const [contactsResult, ordersResult, conversationsResult] = await Promise.all([
    supabase
      .from('contacts')
      .select('id, name, phone, city')
      .eq('workspace_id', workspaceId)
      .limit(500),

    supabase
      .from('orders')
      .select('id, total_value, created_at, contact:contacts(name)')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(500),

    supabase
      .from('conversations')
      .select('id, phone, last_message, contact:contacts(name)')
      .eq('workspace_id', workspaceId)
      .order('last_message_at', { ascending: false })
      .limit(500)
  ])

  const items: SearchableItem[] = []

  // Map contacts
  contactsResult.data?.forEach(contact => {
    items.push({
      type: 'contact',
      id: contact.id,
      title: contact.name,
      subtitle: contact.phone || contact.city || 'Sin telefono',
      href: `/crm/contactos/${contact.id}`
    })
  })

  // Map orders - format amount as currency
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ordersResult.data?.forEach((order: any) => {
    const contactName = order.contact?.name || 'Sin cliente'
    const amount = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(order.total_value || 0)

    items.push({
      type: 'order',
      id: order.id,
      title: contactName,
      subtitle: amount,
      href: `/crm/pedidos?order=${order.id}`
    })
  })

  // Map conversations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversationsResult.data?.forEach((conv: any) => {
    const contactName = conv.contact?.name
    items.push({
      type: 'conversation',
      id: conv.id,
      title: contactName || conv.phone,
      subtitle: conv.last_message?.substring(0, 50) || 'Sin mensajes',
      href: `/whatsapp?chat=${conv.id}`
    })
  })

  return items
}
