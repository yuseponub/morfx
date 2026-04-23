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
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

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
  v2?: boolean
}

export function SyncStatus({ integration, events, stats, v2: v2Prop }: SyncStatusProps) {
  const v2Hook = useDashboardV2()
  const v2 = v2Prop ?? v2Hook

  if (!integration) {
    if (v2) {
      return (
        <div className="text-center py-8 flex flex-col items-center gap-3">
          <Activity className="h-8 w-8 text-[var(--ink-3)] opacity-50" />
          <p className="text-[13px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>
            Configura la integracion para ver el estado de sincronizacion
          </p>
          <p className="mx-rule-ornament">· · ·</p>
        </div>
      )
    }
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Configura la integracion para ver el estado de sincronizacion</p>
      </div>
    )
  }

  if (v2) {
    return (
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="text-center p-2 bg-[var(--paper-1)] border border-[var(--border)] rounded-[var(--radius-3)]">
            <div className="text-[24px] font-bold text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-display)' }}>{stats.processed}</div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>Procesados</div>
          </div>
          <div className="text-center p-2 bg-[var(--paper-1)] border border-[var(--border)] rounded-[var(--radius-3)]">
            <div className="text-[24px] font-bold text-[oklch(0.45_0.14_28)]" style={{ fontFamily: 'var(--font-display)' }}>{stats.failed}</div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>Fallidos</div>
          </div>
        </div>

        {/* Last sync */}
        {integration.last_sync_at && (
          <div className="text-[13px] border border-[var(--border)] bg-[var(--paper-1)] rounded-[var(--radius-3)] px-3 py-2">
            <span className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold block mb-0.5" style={{ fontFamily: 'var(--font-sans)' }}>Ultima sincronizacion</span>
            <span className="text-[var(--ink-1)]" style={{ fontFamily: 'var(--font-sans)' }}>
              {formatDistanceToNow(new Date(integration.last_sync_at), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>
        )}

        {/* Recent events */}
        <div>
          <h4 className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold mb-2 px-1" style={{ fontFamily: 'var(--font-sans)' }}>Eventos recientes</h4>
          {events.length === 0 ? (
            <div className="text-center py-6 flex flex-col items-center gap-2">
              <p className="text-[13px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-sans)' }}>Sin eventos registrados</p>
              <p className="mx-rule-ornament">· · ·</p>
            </div>
          ) : (
            <ScrollArea className="h-[200px] border border-[var(--border)] rounded-[var(--radius-3)] bg-[var(--paper-0)]">
              <table className="w-full border-collapse">
                <tbody>
                  {events.map(event => (
                    <tr key={event.id} className="hover:bg-[var(--paper-1)]">
                      <td className="px-3 py-2 border-b border-[var(--border)] align-top">
                        <div className="flex items-start gap-2 text-[13px]">
                          <StatusIcon status={event.status} v2 />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-semibold uppercase tracking-[0.04em] px-[8px] py-[2px] rounded-full border border-[var(--border)] text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-sans)' }}>
                                {event.topic}
                              </span>
                              <span className="text-[10px] text-[var(--ink-3)]" style={{ fontFamily: 'var(--font-mono)' }}>
                                {formatDistanceToNow(new Date(event.created_at), {
                                  addSuffix: true,
                                  locale: es,
                                })}
                              </span>
                              <span className={cn(
                                'mx-tag ml-auto',
                                event.status === 'processed' ? 'mx-tag--verdigris' :
                                event.status === 'failed' ? 'mx-tag--rubric' :
                                event.status === 'pending' ? 'mx-tag--gold' :
                                'mx-tag--ink'
                              )}>
                                {event.status}
                              </span>
                            </div>
                            {event.error_message && (
                              <p className="text-[11px] text-[oklch(0.45_0.14_28)] mt-1" style={{ fontFamily: 'var(--font-sans)' }}>
                                {event.error_message}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </div>

        {/* Webhook URL info */}
        <div className="pt-2 border-t border-[var(--border)]">
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)] font-semibold" style={{ fontFamily: 'var(--font-sans)' }}>
            URL del webhook
          </p>
          <code className="text-[11px] bg-[var(--paper-2)] border border-[var(--border)] p-1.5 rounded-[var(--radius-2)] block mt-1 truncate text-[var(--ink-2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/shopify
          </code>
        </div>
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

function StatusIcon({ status, v2 = false }: { status: string; v2?: boolean }) {
  if (v2) {
    switch (status) {
      case 'processed':
        return <CheckCircle2 className="h-4 w-4 text-[oklch(0.55_0.14_150)] flex-shrink-0 mt-0.5" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-[oklch(0.55_0.18_28)] flex-shrink-0 mt-0.5" />
      case 'pending':
        return <Clock className="h-4 w-4 text-[oklch(0.60_0.12_70)] flex-shrink-0 mt-0.5" />
      default:
        return <Activity className="h-4 w-4 text-[var(--ink-3)] flex-shrink-0 mt-0.5" />
    }
  }
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
