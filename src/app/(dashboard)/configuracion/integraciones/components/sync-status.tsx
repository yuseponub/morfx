'use client'

// ============================================================================
// Phase 11: Sync Status Component
// Displays webhook activity and sync statistics
// ============================================================================

import type { ShopifyIntegration } from '@/lib/shopify/types'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { CheckCircle2, XCircle, Clock, Activity } from 'lucide-react'

interface SyncStatusProps {
  integration: ShopifyIntegration | null
  events: Array<{
    id: string
    external_id: string
    topic: string
    status: string
    error_message: string | null
    created_at: string
    processed_at: string | null
  }>
  stats: {
    total: number
    processed: number
    failed: number
    pending: number
  }
}

export function SyncStatus({ integration, events, stats }: SyncStatusProps) {
  if (!integration) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Configura la integracion para ver el estado de sincronizacion</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="text-center p-2 bg-muted/50 rounded">
          <div className="text-2xl font-bold">{stats.processed}</div>
          <div className="text-xs text-muted-foreground">Procesados</div>
        </div>
        <div className="text-center p-2 bg-muted/50 rounded">
          <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          <div className="text-xs text-muted-foreground">Fallidos</div>
        </div>
      </div>

      {/* Last sync */}
      {integration.last_sync_at && (
        <div className="text-sm">
          <span className="text-muted-foreground">Ultima sincronizacion: </span>
          <span>
            {formatDistanceToNow(new Date(integration.last_sync_at), {
              addSuffix: true,
              locale: es,
            })}
          </span>
        </div>
      )}

      {/* Recent events */}
      <div>
        <h4 className="text-sm font-medium mb-2">Eventos recientes</h4>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay eventos</p>
        ) : (
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {events.map(event => (
                <div
                  key={event.id}
                  className="flex items-start gap-2 p-2 bg-muted/30 rounded text-sm"
                >
                  <StatusIcon status={event.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {event.topic}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(event.created_at), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </div>
                    {event.error_message && (
                      <p className="text-xs text-red-600 mt-1 truncate">
                        {event.error_message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Webhook URL info */}
      <div className="pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          URL del webhook:
        </p>
        <code className="text-xs bg-muted p-1 rounded block mt-1 truncate">
          {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shopify
        </code>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'processed':
      return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-500 flex-shrink-0" />
    default:
      return <Activity className="h-4 w-4 text-muted-foreground flex-shrink-0" />
  }
}
