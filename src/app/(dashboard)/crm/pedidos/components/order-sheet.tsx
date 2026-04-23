'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  UserIcon,
  PhoneIcon,
  MapPinIcon,
  PackageIcon,
  TruckIcon,
  CalendarIcon,
  PencilIcon,
  Trash2Icon,
  ExternalLinkIcon,
  LoaderIcon,
  MessageCircleIcon,
  ListTodo,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OrderTagInput } from './order-tag-input'
import { RelatedOrders } from './related-orders'
import { OrderNotesSection } from './order-notes-section'
import { OrderTrackingSection } from './order-tracking-section'
import { CreateTaskButton } from '@/components/tasks/create-task-button'
import { moveOrderToStage, getRelatedOrders } from '@/app/actions/orders'
import { getOrderNotes } from '@/app/actions/order-notes'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { OrderWithDetails, PipelineStage, RelatedOrder, OrderNoteWithUser } from '@/lib/orders/types'

// Format currency in COP
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

// Format date
function formatDate(date: string): string {
  return format(new Date(date), "d 'de' MMMM, yyyy", { locale: es })
}

// Format datetime
function formatDateTime(date: string): string {
  return format(new Date(date), "d MMM yyyy, HH:mm", { locale: es })
}

// Check if tracking number is a valid URL
function isValidTrackingUrl(tracking: string): boolean {
  try {
    new URL(tracking)
    return true
  } catch {
    return false
  }
}

function ContactSection({ contact }: { contact: { id: string; name: string; phone: string; address: string | null; city: string | null } }) {
  const v2 = useDashboardV2()
  const [expanded, setExpanded] = React.useState(false)
  const hasDetails = contact.address || contact.city

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3
          className={cn(
            v2
              ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]'
              : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide'
          )}
          style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
        >
          Cliente
        </h3>
        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={cn(
              'transition-colors',
              v2
                ? 'text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <ChevronDownIcon className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      <div
        className={cn('space-y-2', v2 && 'text-[13px] text-[var(--ink-1)]')}
        style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
      >
        <div className="flex items-center gap-3">
          <UserIcon
            className={cn('h-4 w-4', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
          />
          <Link
            href={`/crm/contactos/${contact.id}`}
            className={cn(
              'hover:underline',
              v2 ? 'text-[var(--ink-1)]' : 'text-primary'
            )}
          >
            {contact.name}
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <PhoneIcon
            className={cn('h-4 w-4', v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground')}
          />
          <Link
            href={`/crm/contactos/${contact.id}`}
            className={cn(
              'hover:underline',
              v2 ? 'text-[var(--ink-1)]' : 'text-primary'
            )}
          >
            {contact.phone}
          </Link>
        </div>
        {expanded && (
          <>
            {contact.address && (
              <div className="flex items-start gap-3">
                <MapPinIcon
                  className={cn(
                    'h-4 w-4 mt-0.5',
                    v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
                  )}
                />
                <span className={v2 ? 'text-[var(--ink-2)]' : undefined}>{contact.address}</span>
              </div>
            )}
            {contact.city && (
              <div className="flex items-center gap-3">
                <MapPinIcon
                  className={cn(
                    'h-4 w-4',
                    v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
                  )}
                />
                <span className={v2 ? 'text-[var(--ink-2)]' : undefined}>{contact.city}</span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

interface OrderSheetProps {
  order: OrderWithDetails | null
  open: boolean
  stages: PipelineStage[]
  /** All orders in the current view (for navigating to related orders) */
  allOrders?: OrderWithDetails[]
  onClose: () => void
  onEdit: (order: OrderWithDetails) => void
  onDelete: (order: OrderWithDetails) => void
  /** Navigate to a different order in the sheet */
  onViewOrder?: (order: OrderWithDetails) => void
  currentUserId?: string
  isAdminOrOwner?: boolean
  availableTags?: Array<{ id: string; name: string; color: string }>
}

/**
 * Side sheet showing full order details.
 * Opens when clicking a card in Kanban or table.
 */
export function OrderSheet({
  order,
  open,
  stages,
  allOrders,
  onClose,
  onEdit,
  onDelete,
  onViewOrder,
  currentUserId,
  isAdminOrOwner,
  availableTags = [],
}: OrderSheetProps) {
  const v2 = useDashboardV2()
  const router = useRouter()
  const [isChangingStage, setIsChangingStage] = React.useState(false)
  const [localTags, setLocalTags] = React.useState<Array<{ id: string; name: string; color: string }>>([])
  const [relatedOrders, setRelatedOrders] = React.useState<RelatedOrder[]>([])
  const [orderNotes, setOrderNotes] = React.useState<OrderNoteWithUser[]>([])
  const [notesLoading, setNotesLoading] = React.useState(false)

  // Sync local tags when order changes
  React.useEffect(() => {
    if (order?.tags) {
      setLocalTags(order.tags)
    }
  }, [order?.id, order?.tags])

  // Fetch related orders when order changes
  React.useEffect(() => {
    if (order?.id) {
      getRelatedOrders(order.id).then(setRelatedOrders).catch(() => setRelatedOrders([]))
    } else {
      setRelatedOrders([])
    }
  }, [order?.id])

  // Fetch notes when order sheet opens
  React.useEffect(() => {
    if (order?.id && open) {
      setNotesLoading(true)
      getOrderNotes(order.id)
        .then(setOrderNotes)
        .catch(() => setOrderNotes([]))
        .finally(() => setNotesLoading(false))
    } else {
      setOrderNotes([])
    }
  }, [order?.id, open])

  if (!order) return null

  const contact = order.contact
  const stage = order.stage
  const pipeline = order.pipeline
  const products = order.products

  // Handle stage change
  const handleStageChange = async (newStageId: string) => {
    if (newStageId === order.stage_id) return

    setIsChangingStage(true)
    try {
      const result = await moveOrderToStage(order.id, newStageId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        const newStage = stages.find(s => s.id === newStageId)
        if (result.data?.warning) {
          toast.warning(result.data.warning)
        } else {
          toast.success(`Movido a ${newStage?.name || 'nueva etapa'}`)
        }
        router.refresh()
      }
    } finally {
      setIsChangingStage(false)
    }
  }

  // Derive prev/next stages for editorial stage-bar advance buttons (v2 only)
  const stageIdx = stages.findIndex((s) => s.id === order.stage_id)
  const prevStage = stageIdx > 0 ? stages[stageIdx - 1] : null
  const nextStage = stageIdx >= 0 && stageIdx < stages.length - 1 ? stages[stageIdx + 1] : null

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent
        key={order.id}
        className="sm:max-w-[500px] p-0 flex flex-col"
        portalContainer={
          v2
            ? (typeof document !== 'undefined'
                ? document.querySelector<HTMLElement>('[data-theme-scope="dashboard-editorial"]')
                : undefined)
            : undefined
        }
      >
        {/* Header */}
        {v2 ? (
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-[var(--ink-1)] space-y-0">
            {/* Top: ID · #XXXX + display h2 + meta row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div
                  className="text-[11px] text-[var(--ink-3)] tracking-[0.02em]"
                  style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
                >
                  Pedido · <span>#{order.id.slice(-4).toUpperCase()}</span>
                </div>
                <SheetTitle asChild>
                  <h2
                    className="mt-1 text-[22px] leading-[1.15] font-semibold tracking-[-0.01em] text-[var(--ink-1)]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {order.name || 'Sin nombre'}
                  </h2>
                </SheetTitle>
                <div
                  className="mt-2 flex flex-wrap gap-3 text-[12px] text-[var(--ink-3)]"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  <span className="inline-flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {formatDateTime(order.created_at)}
                  </span>
                  {order.shipping_city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon className="h-3 w-3" />
                      {order.shipping_city}
                    </span>
                  )}
                  {order.carrier && (
                    <span className="inline-flex items-center gap-1">
                      <TruckIcon className="h-3 w-3" />
                      <span className="capitalize">{order.carrier}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Stage bar — replaces shadcn Select with pill chip + advance buttons */}
            <div className="-mx-6 mt-4 px-6 py-3 border-t border-[var(--border)] bg-[var(--paper-1)] flex items-center gap-3 flex-wrap">
              <span
                className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                Estado actual
              </span>
              <span
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--ink-1)] bg-[var(--paper-0)] text-[12px] font-semibold text-[var(--ink-1)] tracking-[0.02em]"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: stage.color }} />
                {isChangingStage ? (
                  <LoaderIcon className="h-3 w-3 animate-spin" />
                ) : (
                  stage.name
                )}
              </span>
              <div className="flex-1" />
              <div className="flex gap-1.5">
                {prevStage && (
                  <button
                    type="button"
                    onClick={() => handleStageChange(prevStage.id)}
                    disabled={isChangingStage}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] border border-[var(--border)] bg-[var(--paper-0)] text-[var(--ink-2)] text-[11px] font-medium hover:bg-[var(--paper-3)] hover:text-[var(--ink-1)] hover:border-[var(--ink-2)] transition-colors disabled:opacity-50"
                    style={{ fontFamily: 'var(--font-sans)' }}
                    aria-label={`Mover a ${prevStage.name}`}
                  >
                    <ChevronLeftIcon className="h-3 w-3" />
                    {prevStage.name}
                  </button>
                )}
                {nextStage && (
                  <button
                    type="button"
                    onClick={() => handleStageChange(nextStage.id)}
                    disabled={isChangingStage}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[11px] font-semibold hover:bg-[var(--paper-3)] transition-colors disabled:opacity-50"
                    style={{ fontFamily: 'var(--font-sans)' }}
                    aria-label={`Mover a ${nextStage.name}`}
                  >
                    {nextStage.name}
                    <ChevronRightIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Action buttons row */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onEdit(order)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--ink-1)] bg-[var(--paper-0)] text-[var(--ink-1)] text-[12px] font-semibold hover:bg-[var(--paper-3)] transition-colors"
                style={{ fontFamily: 'var(--font-sans)', boxShadow: '0 1px 0 var(--ink-1)' }}
              >
                <PencilIcon className="h-3.5 w-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onDelete(order)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--rubric-2)] bg-[var(--paper-0)] text-[var(--rubric-2)] text-[12px] font-semibold hover:bg-[var(--rubric-2)]/10 transition-colors"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                <Trash2Icon className="h-3.5 w-3.5" />
                Eliminar
              </button>
              {contact?.phone && (
                <Link
                  href={`/whatsapp?phone=${encodeURIComponent(contact.phone)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[3px] border border-[var(--accent-verdigris)] bg-[var(--paper-0)] text-[var(--accent-verdigris)] text-[12px] font-semibold hover:bg-[var(--accent-verdigris)]/10 transition-colors"
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  <MessageCircleIcon className="h-3.5 w-3.5" />
                  WhatsApp
                </Link>
              )}
              <CreateTaskButton
                orderId={order.id}
                orderInfo={`Pedido ${formatCurrency(order.total_value)} - ${contact?.name || 'Sin contacto'}`}
                variant="outline"
                size="sm"
              />
            </div>
          </SheetHeader>
        ) : (
          <SheetHeader className="px-6 pt-6 pb-4 border-b space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <SheetTitle className="text-xl">
                  {order.name || 'Sin nombre'}
                </SheetTitle>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-primary">
                    {formatCurrency(order.total_value)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {pipeline.name}
                </p>
              </div>
            </div>

            {/* Action buttons - Two rows with spacing */}
            <div className="space-y-3">
              {/* Row 1: Editar, Eliminar */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose()
                    onEdit(order)
                  }}
                >
                  <PencilIcon className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    onClose()
                    onDelete(order)
                  }}
                >
                  <Trash2Icon className="h-4 w-4 mr-2" />
                  Eliminar
                </Button>
              </div>

              {/* Row 2: WhatsApp, Fases, Tarea */}
              <div className="flex items-center gap-2">
                {contact?.phone && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-green-600 hover:text-green-700 hover:bg-green-50"
                    asChild
                  >
                    <Link href={`/whatsapp?phone=${encodeURIComponent(contact.phone)}`}>
                      <MessageCircleIcon className="h-4 w-4 mr-2" />
                      WhatsApp
                    </Link>
                  </Button>
                )}
                {/* Stage selector */}
                <Select
                  value={order.stage_id}
                  onValueChange={handleStageChange}
                  disabled={isChangingStage}
                >
                  <SelectTrigger
                    className="w-[150px] h-9"
                    style={{
                      backgroundColor: `${stage.color}15`,
                      borderColor: stage.color,
                    }}
                  >
                    {isChangingStage ? (
                      <LoaderIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color }}
                        />
                        <span className="truncate">{stage.name}</span>
                      </div>
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <CreateTaskButton
                  orderId={order.id}
                  orderInfo={`Pedido ${formatCurrency(order.total_value)} - ${contact?.name || 'Sin contacto'}`}
                  variant="outline"
                  size="sm"
                />
              </div>
            </div>
          </SheetHeader>
        )}

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* Contact info */}
            {contact && (
              <ContactSection contact={contact} />
            )}

            <Separator />

            {/* Products */}
            <section className="space-y-3">
              <h3
                className={cn(
                  v2
                    ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)] mb-2'
                    : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2'
                )}
                style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
              >
                {!v2 && <PackageIcon className="h-4 w-4" />}
                {v2 ? 'Líneas del pedido' : `Productos (${products.length})`}
              </h3>
              {products.length === 0 ? (
                <p
                  className={cn(
                    v2 ? 'text-[13px] text-[var(--ink-3)] italic' : 'text-sm text-muted-foreground'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-display)' } : undefined}
                >
                  Sin productos
                </p>
              ) : v2 ? (
                <>
                  <table
                    className="w-full border-collapse"
                    style={{ fontFamily: 'var(--font-sans)', fontSize: '13px' }}
                  >
                    <thead>
                      <tr>
                        <th className="text-left pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)]">
                          Artículo
                        </th>
                        <th className="text-right pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)] w-12">
                          Cant.
                        </th>
                        <th className="text-right pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)] w-24">
                          Precio
                        </th>
                        <th className="text-right pb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] border-b border-[var(--border)] w-28">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product) => (
                        <tr key={product.id}>
                          <td className="py-2 pr-2 text-[var(--ink-1)] border-b border-[var(--border)] align-top">
                            <div>{product.title}</div>
                            {product.sku && (
                              <span
                                className="block text-[11px] text-[var(--ink-3)] mt-0.5"
                                style={{ fontFamily: 'var(--font-mono)' }}
                              >
                                {product.sku}
                              </span>
                            )}
                          </td>
                          <td
                            className="py-2 text-right text-[var(--ink-2)] border-b border-[var(--border)] align-top"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}
                          >
                            {product.quantity}
                          </td>
                          <td
                            className="py-2 text-right text-[var(--ink-3)] border-b border-[var(--border)] align-top"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 500 }}
                          >
                            {formatCurrency(product.unit_price)}
                          </td>
                          <td
                            className="py-2 text-right text-[var(--ink-1)] border-b border-[var(--border)] align-top"
                            style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600 }}
                          >
                            {formatCurrency(product.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Grand total — mx-display 18px */}
                  <div className="mt-3 pt-3 border-t border-[var(--ink-1)] flex items-baseline justify-between">
                    <span
                      className="text-[14px] font-semibold text-[var(--ink-1)]"
                      style={{ fontFamily: 'var(--font-sans)' }}
                    >
                      Total
                    </span>
                    <span
                      className="text-[18px] font-bold text-[var(--ink-1)] tracking-[-0.005em]"
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {formatCurrency(order.total_value)}
                    </span>
                  </div>
                </>
              ) : (
                <div className="space-y-2">
                  {products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {product.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          SKU: {product.sku} x {product.quantity}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="font-medium text-sm">
                          {formatCurrency(product.subtotal)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(product.unit_price)} c/u
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Total */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="font-semibold">Total</span>
                    <span className="font-bold text-lg text-primary">
                      {formatCurrency(order.total_value)}
                    </span>
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* Shipping */}
            <section className="space-y-3">
              <h3
                className={cn(
                  v2
                    ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]'
                    : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2'
                )}
                style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
              >
                {!v2 && <TruckIcon className="h-4 w-4" />}
                Envío
              </h3>
              {order.shipping_address || order.shipping_city || order.carrier || order.tracking_number ? (
                <div className="space-y-2">
                  {(order.shipping_address || order.shipping_city) && (
                    <div className="flex items-start gap-3">
                      <MapPinIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        {order.shipping_address && <p>{order.shipping_address}</p>}
                        {order.shipping_city && (
                          <p className="text-muted-foreground">
                            {order.shipping_city}
                            {order.shipping_department && `, ${order.shipping_department}`}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {order.carrier && (
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-sm w-24">Transportadora</span>
                      <span className="capitalize">{order.carrier}</span>
                    </div>
                  )}
                  {order.tracking_number && (
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground text-sm w-24">Guia</span>
                      {isValidTrackingUrl(order.tracking_number) ? (
                        <a
                          href={order.tracking_number}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-primary hover:underline flex items-center gap-1"
                        >
                          {order.tracking_number.length > 40
                            ? `${order.tracking_number.substring(0, 40)}...`
                            : order.tracking_number}
                          <ExternalLinkIcon className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="font-mono">{order.tracking_number}</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin informacion de envio
                </p>
              )}
            </section>

            {/* Tracking Envia -- only renders if carrier is envia */}
            {order.carrier && (
              <>
                <Separator />
                <OrderTrackingSection orderId={order.id} carrier={order.carrier} />
              </>
            )}

            {/* Description */}
            {order.description && (
              <>
                <Separator />
                <section className="space-y-3">
                  <h3
                    className={cn(
                      v2
                        ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]'
                        : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide'
                    )}
                    style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                  >
                    Descripción
                  </h3>
                  <p
                    className={cn(
                      'whitespace-pre-wrap',
                      v2 ? 'text-[13px] text-[var(--ink-1)]' : 'text-sm'
                    )}
                    style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                  >
                    {order.description}
                  </p>
                </section>
              </>
            )}

            <Separator />

            {/* Tags */}
            <section className="space-y-3">
              <h3
                className={cn(
                  v2
                    ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]'
                    : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide'
                )}
                style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
              >
                Etiquetas
              </h3>
              <OrderTagInput
                orderId={order.id}
                allTags={availableTags}
                currentTags={localTags}
                onTagAdded={(tag) => {
                  setLocalTags(prev => [...prev, tag])
                  router.refresh()
                }}
                onTagRemoved={(tagId) => {
                  setLocalTags(prev => prev.filter(t => t.id !== tagId))
                  router.refresh()
                }}
              />
            </section>

            {/* Related orders */}
            {relatedOrders.length > 0 && (
              <>
                <Separator />
                <RelatedOrders
                  relatedOrders={relatedOrders}
                  onNavigate={(orderId) => {
                    // Close sheet and navigate — switches pipeline + opens order
                    onClose()
                    router.push(`/crm/pedidos?order=${orderId}`)
                  }}
                />
              </>
            )}

            {/* Order Notes */}
            <Separator />
            <OrderNotesSection
              orderId={order.id}
              initialNotes={orderNotes}
              currentUserId={currentUserId}
              isAdminOrOwner={isAdminOrOwner}
              loading={notesLoading}
            />

            <Separator />

            {/* Timeline / Fechas */}
            <section className="space-y-3">
              <h3
                className={cn(
                  v2
                    ? 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]'
                    : 'text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2'
                )}
                style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
              >
                {!v2 && <CalendarIcon className="h-4 w-4" />}
                Fechas
              </h3>
              <div className={cn('space-y-2', v2 ? 'text-[13px]' : 'text-sm')}>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-24',
                      v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
                    )}
                  >
                    Creado
                  </span>
                  <span className={v2 ? 'text-[var(--ink-1)]' : undefined}>{formatDateTime(order.created_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-24',
                      v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
                    )}
                  >
                    Actualizado
                  </span>
                  <span className={v2 ? 'text-[var(--ink-1)]' : undefined}>{formatDateTime(order.updated_at)}</span>
                </div>
                {order.closing_date && (
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'w-24',
                        v2 ? 'text-[var(--ink-3)]' : 'text-muted-foreground'
                      )}
                    >
                      Cierre
                    </span>
                    <span className={v2 ? 'text-[var(--ink-1)]' : undefined}>{formatDate(order.closing_date)}</span>
                  </div>
                )}
              </div>
            </section>

            {/* Actividad timeline — v2 only (derived from existing dates; no fabrication) */}
            {v2 && (
              <>
                <Separator />
                <section className="space-y-3">
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    Actividad
                  </h3>
                  <div className="flex flex-col gap-2.5">
                    {[
                      { t: formatDateTime(order.created_at), b: 'Pedido creado' },
                      ...(order.updated_at !== order.created_at
                        ? [{ t: formatDateTime(order.updated_at), b: 'Última actualización' }]
                        : []),
                      ...(order.closing_date
                        ? [{ t: formatDate(order.closing_date), b: 'Fecha de cierre planeada' }]
                        : []),
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-[110px_1fr] gap-2 items-baseline text-[13px]"
                      >
                        <span
                          className="text-[11px] text-[var(--ink-3)]"
                          style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}
                        >
                          {item.t}
                        </span>
                        <span
                          className="text-[var(--ink-2)] leading-[1.45]"
                          style={{ fontFamily: 'var(--font-sans)' }}
                        >
                          {item.b}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}
