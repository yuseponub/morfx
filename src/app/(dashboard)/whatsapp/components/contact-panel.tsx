'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, User, ShoppingBag, ExternalLink, Eye, MapPin, ListTodo } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { TagBadge } from '@/components/contacts/tag-badge'
import { WindowIndicator } from './window-indicator'
import { CreateOrderSheet } from './create-order-sheet'
import { CreateContactSheet } from './create-contact-sheet'
import { ViewOrderSheet } from './view-order-sheet'
import { CreateTaskButton } from '@/components/tasks/create-task-button'
import { OrderStageBadge } from './order-status-indicator'
import { createClient } from '@/lib/supabase/client'
import type { ConversationWithDetails } from '@/lib/whatsapp/types'

interface ContactPanelProps {
  conversation: ConversationWithDetails | null
  onClose: () => void
  /** Called when conversation data should be refreshed (e.g., after contact/order creation) */
  onConversationUpdated?: () => void
  /** Called when orders change (e.g., stage change) to refresh emoji indicators */
  onOrdersChanged?: () => Promise<void>
}

/**
 * Right panel showing contact info and recent orders.
 * Shows "unknown contact" state when no contact is linked.
 */
export function ContactPanel({ conversation, onClose, onConversationUpdated, onOrdersChanged }: ContactPanelProps) {
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

  // Auto-refresh orders when conversation is updated.
  // Conversations realtime is PROVEN to work. After timer creates an order,
  // agent-timers.ts touches the conversation → this listener fires → orders refresh.
  // Also catches engine confirmation messages that update last_message_at.
  const contactId = conversation?.contact?.id
  useEffect(() => {
    const conversationId = conversation?.id
    if (!conversationId || !contactId) return

    const supabase = createClient()

    // Primary: conversation UPDATE triggers order refresh
    // (fires after order creation because agent-timers touches conversation post-engine)
    const convChannel = supabase
      .channel(`conv-order-refresh:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => {
          console.log('[ContactPanel] Realtime: conversations UPDATE received, refreshing orders in 1s')
          setTimeout(() => {
            setOrdersRefreshKey(k => k + 1)
          }, 1000)
        }
      )
      .subscribe((status) => {
        console.log('[ContactPanel] conv-order-refresh channel status:', status)
      })

    // Backup: direct orders INSERT listener
    const ordersChannel = supabase
      .channel(`orders-direct:${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          console.log('[ContactPanel] Realtime: orders INSERT received, refreshing orders')
          setOrdersRefreshKey(k => k + 1)
        }
      )
      .subscribe((status) => {
        console.log('[ContactPanel] orders-direct channel status:', status)
      })

    return () => {
      supabase.removeChannel(convChannel)
      supabase.removeChannel(ordersChannel)
    }
  }, [conversation?.id, contactId])
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

                {/* Tags section - dual display */}
                {(conversation.tags.length > 0 || (conversation.contactTags && conversation.contactTags.length > 0)) && (
                  <div className="pt-2 space-y-2">
                    {/* Conversation-specific tags */}
                    {conversation.tags.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Etiquetas de chat</p>
                        <div className="flex flex-wrap gap-1">
                          {conversation.tags.map((tag) => (
                            <TagBadge key={tag.id} tag={tag} size="sm" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contact inherited tags */}
                    {conversation.contactTags && conversation.contactTags.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Etiquetas de contacto</p>
                        <div className="flex flex-wrap gap-1">
                          {conversation.contactTags.map((tag) => (
                            <TagBadge key={tag.id} tag={tag} size="sm" />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Actions row: CRM link and Task button */}
              <div className="flex items-center gap-3">
                <Link
                  href={`/crm/contactos/${contact.id}`}
                  className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver en CRM
                </Link>
                <CreateTaskButton
                  conversationId={conversation.id}
                  conversationPhone={conversation.phone}
                  variant="outline"
                  size="sm"
                />
              </div>
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
            <RecentOrdersList contactId={contact.id} refreshKey={ordersRefreshKey} onStageChanged={onOrdersChanged} />
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
import { getTagsForScope } from '@/app/actions/tags'
import { addOrderTag, removeOrderTag, moveOrderToStage } from '@/app/actions/orders'
import { getPipelines } from '@/app/actions/orders'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Plus, X as XIcon } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { toast } from 'sonner'

interface RecentOrder {
  id: string
  total_value: number | null
  stage: { id: string; name: string; color: string } | null
  stage_id: string
  created_at: string
  tags: Array<{ id: string; name: string; color: string }>
}

interface AvailableTag {
  id: string
  name: string
  color: string
}

interface PipelineStage {
  id: string
  name: string
  color: string
}

interface Pipeline {
  id: string
  name: string
  stages: PipelineStage[]
}

function RecentOrdersList({ contactId, refreshKey, onStageChanged }: { contactId: string; refreshKey?: number; onStageChanged?: () => Promise<void> }) {
  const [orders, setOrders] = useState<RecentOrder[]>([])
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [viewingOrderId, setViewingOrderId] = useState<string | null>(null)
  const [openTagPopover, setOpenTagPopover] = useState<string | null>(null)
  const [openStagePopover, setOpenStagePopover] = useState<string | null>(null)

  // Track current order IDs for polling comparison
  const orderIdsRef = useRef<string>('')

  // Full data fetch (orders + tags + pipelines) - on mount & refreshKey change
  const hasFetchedRef = useRef(false)
  useEffect(() => {
    async function fetchData() {
      // Only show loading spinner on first mount, not on refreshes
      if (!hasFetchedRef.current) setIsLoading(true)
      try {
        const [ordersData, tagsData, pipelinesData] = await Promise.all([
          getRecentOrders(contactId),
          getTagsForScope('orders'),
          getPipelines()
        ])
        setOrders(ordersData)
        orderIdsRef.current = ordersData.map(o => o.id).join(',')
        setAvailableTags(tagsData)
        setPipelines(pipelinesData)
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setIsLoading(false)
        hasFetchedRef.current = true
      }
    }

    fetchData()
  }, [contactId, refreshKey])

  // Polling: check for new orders every 10 seconds (orders-only, lightweight)
  // This is the RELIABLE mechanism. Realtime is a bonus for instant refresh.
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const freshOrders = await getRecentOrders(contactId)
        const freshIds = freshOrders.map(o => o.id).join(',')
        if (freshIds !== orderIdsRef.current) {
          console.log('[RecentOrdersList] Polling detected order change:', {
            old: orderIdsRef.current,
            new: freshIds,
          })
          setOrders(freshOrders)
          orderIdsRef.current = freshIds
        }
      } catch (error) {
        // Silent fail for polling - don't spam console
      }
    }, 30_000) // 30 seconds

    return () => clearInterval(interval)
  }, [contactId])

  const handleAddTag = async (orderId: string, tag: AvailableTag) => {
    // Optimistic update
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        return { ...order, tags: [...order.tags, tag] }
      }
      return order
    }))
    setOpenTagPopover(null)

    const result = await addOrderTag(orderId, tag.id)
    if ('error' in result && result.error) {
      toast.error(result.error)
      // Revert optimistic update
      setOrders(prev => prev.map(order => {
        if (order.id === orderId) {
          return { ...order, tags: order.tags.filter(t => t.id !== tag.id) }
        }
        return order
      }))
    }
  }

  const handleRemoveTag = async (orderId: string, tagId: string) => {
    // Store original tags for revert
    const originalOrders = orders

    // Optimistic update
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        return { ...order, tags: order.tags.filter(t => t.id !== tagId) }
      }
      return order
    }))

    const result = await removeOrderTag(orderId, tagId)
    if ('error' in result && result.error) {
      toast.error(result.error)
      // Revert
      setOrders(originalOrders)
    }
  }

  const handleStageChange = async (orderId: string, newStage: PipelineStage) => {
    // Store original for revert
    const originalOrders = orders

    // Optimistic update
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        return {
          ...order,
          stage_id: newStage.id,
          stage: { id: newStage.id, name: newStage.name, color: newStage.color }
        }
      }
      return order
    }))
    setOpenStagePopover(null)

    const result = await moveOrderToStage(orderId, newStage.id)
    if ('error' in result) {
      toast.error(result.error)
      // Revert
      setOrders(originalOrders)
    } else {
      toast.success(`Pedido movido a ${newStage.name}`)
      // Notify parent to refresh conversations (updates emoji indicator)
      onStageChanged?.()
    }
  }

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
      {orders.map((order) => {
        // Filter out tags already on this order from available options
        const tagsNotOnOrder = availableTags.filter(
          t => !order.tags.some(ot => ot.id === t.id)
        )

        // Get all stages from all pipelines for selector
        const allStages = pipelines.flatMap(p => p.stages)

        return (
          <div
            key={order.id}
            className="p-2 rounded-lg border hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {/* Stage selector */}
                  <Popover
                    open={openStagePopover === order.id}
                    onOpenChange={(open) => setOpenStagePopover(open ? order.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button className="hover:opacity-80 transition-opacity">
                        {order.stage && (
                          <OrderStageBadge stage={order.stage} size="sm" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-48 p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar etapa..." />
                        <CommandList>
                          <CommandEmpty>No hay etapas</CommandEmpty>
                          {pipelines.map((pipeline) => (
                            <CommandGroup key={pipeline.id} heading={pipeline.name}>
                              {pipeline.stages.map((stage) => (
                                <CommandItem
                                  key={stage.id}
                                  onSelect={() => handleStageChange(order.id, stage)}
                                  className={order.stage?.id === stage.id ? 'bg-accent' : ''}
                                >
                                  <span
                                    className="w-3 h-3 rounded-full mr-2"
                                    style={{ backgroundColor: stage.color }}
                                  />
                                  {stage.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Link href={`/crm/pedidos?order=${order.id}`}>
                    <span className="text-sm font-medium hover:underline">
                      {order.total_value
                        ? new Intl.NumberFormat('es-CO', {
                            style: 'currency',
                            currency: 'COP',
                            maximumFractionDigits: 0,
                          }).format(order.total_value)
                        : '-'
                      }
                    </span>
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDistanceToNow(new Date(order.created_at), {
                    addSuffix: true,
                    locale: es,
                  })}
                </p>
              </div>
              <button
                onClick={() => setViewingOrderId(order.id)}
                className="p-1.5 rounded-md hover:bg-accent shrink-0 ml-2"
                title="Ver pedido"
              >
                <Eye className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>

            {/* Order tags */}
            <div className="flex flex-wrap items-center gap-1 mt-2">
              {order.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      handleRemoveTag(order.id, tag.id)
                    }}
                    className="hover:bg-black/10 rounded-full p-0.5"
                  >
                    <XIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {/* Add tag button */}
              {tagsNotOnOrder.length > 0 && (
                <Popover
                  open={openTagPopover === order.id}
                  onOpenChange={(open) => setOpenTagPopover(open ? order.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs border border-dashed hover:bg-muted"
                    >
                      <Plus className="h-3 w-3" />
                      Tag
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar tag..." />
                      <CommandList>
                        <CommandEmpty>No hay tags</CommandEmpty>
                        <CommandGroup>
                          {tagsNotOnOrder.map((tag) => (
                            <CommandItem
                              key={tag.id}
                              onSelect={() => handleAddTag(order.id, tag)}
                            >
                              <span
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: tag.color }}
                              />
                              {tag.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          </div>
        )
      })}

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
