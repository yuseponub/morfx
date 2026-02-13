'use client'

import {
  Link2Icon,
  ArrowUpLeftIcon,
  ArrowDownRightIcon,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import type { RelatedOrder } from '@/lib/orders/types'

/** Format currency in COP (Colombian locale) */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
  }).format(value)
}

interface RelatedOrdersProps {
  relatedOrders: RelatedOrder[]
  /** Callback when a related order is clicked (for sheet navigation) */
  onNavigate?: (orderId: string) => void
}

/**
 * Displays related orders (source, derived, siblings) with bidirectional navigation.
 * Hidden when no related orders exist.
 */
export function RelatedOrders({ relatedOrders, onNavigate }: RelatedOrdersProps) {
  if (relatedOrders.length === 0) return null

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <Link2Icon className="h-4 w-4" />
        Ordenes relacionadas ({relatedOrders.length})
      </h3>
      <div className="space-y-2">
        {relatedOrders.map((order) => (
          <button
            key={order.id}
            className="w-full text-left p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onNavigate?.(order.id)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {order.relationship === 'source' ? (
                  <ArrowUpLeftIcon className="h-4 w-4 text-blue-500 shrink-0" />
                ) : (
                  <ArrowDownRightIcon className="h-4 w-4 text-green-500 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-md" style={{
                      backgroundColor: `${order.stage_color}20`,
                      color: order.stage_color,
                      border: `1px solid ${order.stage_color}40`,
                    }}>
                      {order.stage_name}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {order.pipeline_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {order.relationship === 'source' ? 'Orden origen' : 'Orden derivada'}
                    </span>
                    {order.contact_name && (
                      <>
                        <span className="text-xs text-muted-foreground">-</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {order.contact_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-medium">
                  {formatCurrency(order.total_value)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(order.created_at), {
                    addSuffix: true,
                    locale: es,
                  })}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
