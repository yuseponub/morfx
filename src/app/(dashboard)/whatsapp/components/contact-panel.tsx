'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, User, ShoppingBag, ExternalLink, Eye, MapPin } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TagBadge } from '@/components/contacts/tag-badge'
import { WindowIndicator } from './window-indicator'
import { CreateOrderSheet } from './create-order-sheet'
import { CreateContactSheet } from './create-contact-sheet'
import { ViewOrderSheet } from './view-order-sheet'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

interface ContactPanelProps {
  conversation: ConversationWithDetails | null
  onClose: () => void
  /** Called when conversation data should be refreshed (e.g., after contact/order creation) */
  onConversationUpdated?: () => void
}

/**
 * Right panel showing contact info and recent orders.
 * Shows "unknown contact" state when no contact is linked.
 */
export function ContactPanel({ conversation, onClose, onConversationUpdated }: ContactPanelProps) {
  const router = useRouter()
  const [orderSheetOpen, setOrderSheetOpen] = useState(false)
  const [contactSheetOpen, setContactSheetOpen] = useState(false)
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0)

  // Handler for when order is created - refresh data
  const handleOrderCreated = () => {
    setOrdersRefreshKey(k => k + 1)
    router.refresh()
    onConversationUpdated?.()
  }

  // Handler for when contact is created - refresh conversation to show linked contact
  const handleContactCreated = () => {
    router.refresh()
    onConversationUpdated?.()
  }
  // Empty state
  if (!conversation) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-14 px-4 border-b flex items-center justify-between">
          <span className="font-medium">Contacto</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <p className="text-sm text-muted-foreground text-center">
            Selecciona una conversacion para ver la informacion del contacto
          </p>
        </div>
      </div>
    )
  }

  const contact = conversation.contact
  const hasContact = !!contact

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-14 px-4 border-b flex items-center justify-between">
        <span className="font-medium">Contacto</span>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Window indicator */}
        <WindowIndicator lastCustomerMessageAt={conversation.last_customer_message_at} />

        {/* Contact info */}
        <div className="p-4">
          {hasContact ? (
            <div className="space-y-4">
              {/* Contact details */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                    <User className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    <p className="text-sm text-muted-foreground">{contact.phone}</p>
                  </div>
                </div>

                {(contact.address || contact.city) && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <div>
                      {contact.address && <p>{contact.address}</p>}
                      {contact.city && <p>{contact.city}</p>}
                    </div>
                  </div>
                )}

                {/* Tags */}
                {conversation.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {conversation.tags.map((tag) => (
                      <TagBadge key={tag.id} tag={tag} size="sm" />
                    ))}
                  </div>
                )}
              </div>

              {/* View in CRM link */}
              <Link
                href={`/crm/contactos/${contact.id}`}
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Ver en CRM
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Unknown contact */}
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="font-medium">{conversation.profile_name || conversation.phone}</p>
                  {conversation.profile_name && (
                    <p className="text-sm text-muted-foreground">{conversation.phone}</p>
                  )}
                  <p className="text-sm text-muted-foreground">Contacto desconocido</p>
                </div>
              </div>

              {/* Create contact button */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setContactSheetOpen(true)}
              >
                Crear contacto
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Recent orders section */}
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Pedidos recientes</span>
          </div>

          {hasContact ? (
            <RecentOrdersList contactId={contact.id} refreshKey={ordersRefreshKey} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Vincula un contacto para ver sus pedidos
            </p>
          )}
        </div>

        <Separator />

        {/* Create order button */}
        <div className="p-4">
          <Button className="w-full" onClick={() => setOrderSheetOpen(true)}>
            Crear pedido
          </Button>
        </div>
      </div>

      {/* Create order sheet */}
      <CreateOrderSheet
        open={orderSheetOpen}
        onOpenChange={setOrderSheetOpen}
        defaultContactId={contact?.id}
        defaultPhone={conversation.phone}
        defaultName={conversation.profile_name || undefined}
        conversationId={conversation.id}
        onSuccess={handleOrderCreated}
      />

      {/* Create contact sheet */}
      <CreateContactSheet
        open={contactSheetOpen}
        onOpenChange={setContactSheetOpen}
        defaultPhone={conversation.phone}
        defaultName={conversation.profile_name || undefined}
        conversationId={conversation.id}
        onSuccess={handleContactCreated}
      />
    </div>
  )
}

// ============================================================================
// Recent Orders List (Client Component)
// ============================================================================

import { getRecentOrders } from '@/app/actions/whatsapp'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

interface RecentOrder {
  id: string
  total_value: number | null
  stage: { name: string; color: string } | null
  created_at: string
}

function RecentOrdersList({ contactId, refreshKey }: { contactId: string; refreshKey?: number }) {
  const [orders, setOrders] = useState<RecentOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchOrders() {
      setIsLoading(true)
      try {
        const data = await getRecentOrders(contactId)
        setOrders(data)
      } catch (error) {
        console.error('Error fetching orders:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrders()
  }, [contactId, refreshKey])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay pedidos recientes
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {orders.map((order) => (
        <div
          key={order.id}
          className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <Link
              href={`/crm/pedidos?order=${order.id}`}
              className="flex-1 min-w-0"
            >
              <div className="flex items-center gap-2">
                {order.stage && (
                  <span
                    className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      backgroundColor: order.stage.color + '20',
                      color: order.stage.color,
                    }}
                  >
                    {order.stage.name}
                  </span>
                )}
                <span className="text-sm font-medium">
                  {order.total_value
                    ? new Intl.NumberFormat('es-CO', {
                        style: 'currency',
                        currency: 'COP',
                        maximumFractionDigits: 0,
                      }).format(order.total_value)
                    : '-'
                  }
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(order.created_at), {
                  addSuffix: true,
                  locale: es,
                })}
              </p>
            </Link>
            <button
              onClick={() => setViewingOrderId(order.id)}
              className="p-1.5 rounded-md hover:bg-accent shrink-0 ml-2"
              title="Ver pedido"
            >
              <Eye className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      ))}

      <Link
        href={`/crm/contactos/${contactId}`}
        className="block text-center text-sm text-primary hover:underline pt-2"
      >
        Ver todos
      </Link>

      {/* View order sheet */}
      <ViewOrderSheet
        orderId={viewingOrderId}
        open={!!viewingOrderId}
        onOpenChange={(open) => !open && setViewingOrderId(null)}
      />
    </div>
  )
}
