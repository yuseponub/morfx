'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { ActivityIcon, LoaderIcon } from 'lucide-react'
import { getOrderTrackingEvents, type TrackingEvent } from '@/app/actions/order-tracking'

// ============================================================================
// OrderTrackingSection — Vertical timeline of Envia carrier events
// ============================================================================

interface OrderTrackingSectionProps {
  orderId: string
  carrier: string | null
}

export function OrderTrackingSection({ orderId, carrier }: OrderTrackingSectionProps) {
  // Only render for envia carrier
  if (!carrier || !carrier.toLowerCase().includes('envia')) {
    return null
  }

  return <TrackingContent orderId={orderId} />
}

function TrackingContent({ orderId }: { orderId: string }) {
  const [events, setEvents] = React.useState<TrackingEvent[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false

    async function fetchEvents() {
      try {
        const data = await getOrderTrackingEvents(orderId)
        if (!cancelled) {
          setEvents(data)
        }
      } catch {
        // Silently fail — empty state is fine
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchEvents()
    return () => { cancelled = true }
  }, [orderId])

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
        <ActivityIcon className="h-4 w-4" />
        Tracking Envia
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
          Cargando tracking...
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin eventos de tracking aun</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="flex items-start gap-3 text-sm">
              <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{event.estado}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatEventDate(event.created_at)}
                  </span>
                </div>
                {event.novedades?.length > 0 && (
                  <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                    {event.novedades.map((n: any, i: number) => (
                      <li key={i}>- {n.novedad ?? n.descripcion ?? JSON.stringify(n)}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function formatEventDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'd MMM yyyy, HH:mm', { locale: es })
  } catch {
    return dateStr
  }
}
