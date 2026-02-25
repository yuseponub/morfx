'use client'

/**
 * History Panel
 * Phase 24: Chat de Comandos UI
 *
 * Right panel showing job history in reverse chronological order.
 * Each job is expandable to show per-item details.
 */

import { useState, useCallback } from 'react'
import { RefreshCw, ChevronDown, ChevronRight, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { getJobItemsForHistory } from '@/app/actions/comandos'
import type { RobotJob, RobotJobItem } from '@/lib/domain/robot-jobs'

interface HistoryPanelProps {
  history: RobotJob[]
  onRefresh: () => void
}

// ---- Status badge colors ----
function StatusBadge({ status }: { status: RobotJob['status'] }) {
  const variants: Record<string, string> = {
    pending: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
    processing: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    completed: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
    failed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  }

  const labels: Record<string, string> = {
    pending: 'Pendiente',
    processing: 'En progreso',
    completed: 'Completado',
    failed: 'Fallido',
  }

  return (
    <Badge variant="outline" className={cn('text-xs', variants[status])}>
      {labels[status] || status}
    </Badge>
  )
}

// ---- Date formatter ----
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HistoryPanel({ history, onRefresh }: HistoryPanelProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)
  const [expandedJobType, setExpandedJobType] = useState<string | null>(null)
  const [expandedItems, setExpandedItems] = useState<RobotJobItem[]>([])
  const [isLoadingItems, setIsLoadingItems] = useState(false)

  const handleToggleExpand = useCallback(
    async (jobId: string, jobType: string | null) => {
      if (expandedJobId === jobId) {
        // Collapse
        setExpandedJobId(null)
        setExpandedJobType(null)
        setExpandedItems([])
        return
      }

      // Expand - fetch items
      setExpandedJobId(jobId)
      setExpandedJobType(jobType)
      setIsLoadingItems(true)

      try {
        const result = await getJobItemsForHistory(jobId)
        if (result.success && result.data) {
          setExpandedItems(result.data)
        } else {
          setExpandedItems([])
        }
      } catch {
        setExpandedItems([])
      } finally {
        setIsLoadingItems(false)
      }
    },
    [expandedJobId]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b bg-card shrink-0">
        <h2 className="text-sm font-semibold">Historial de Jobs</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Job list */}
      <ScrollArea className="flex-1">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Package className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No hay trabajos anteriores</p>
          </div>
        ) : (
          <div className="divide-y">
            {history.map(job => {
              const isExpanded = expandedJobId === job.id

              return (
                <div key={job.id}>
                  {/* Job row (collapsed) */}
                  <button
                    onClick={() => handleToggleExpand(job.id, job.job_type ?? null)}
                    className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(job.created_at)}
                      </span>
                      <StatusBadge status={job.status} />
                      <Badge variant="outline" className="text-[10px]">
                        {({
                          create_shipment: 'Subir ordenes',
                          guide_lookup: 'Buscar guias',
                          ocr_guide_read: 'Leer guias',
                          pdf_guide_inter: 'Guias Inter',
                          pdf_guide_bogota: 'Guias Bogota',
                          excel_guide_envia: 'Excel Envia',
                        } as Record<string, string>)[job.job_type ?? ''] || job.job_type || 'Job'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 pl-5 text-xs text-muted-foreground">
                      <span>{job.total_items} ordenes</span>
                      {job.success_count > 0 && (
                        <span className="text-green-700 dark:text-green-400">
                          {job.success_count} ok
                        </span>
                      )}
                      {job.error_count > 0 && (
                        <span className="text-red-700 dark:text-red-400">
                          {job.error_count} err
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Job row (expanded) */}
                  {isExpanded && (
                    <div className="px-4 pb-3 pl-9">
                      {isLoadingItems ? (
                        <p className="text-xs text-muted-foreground">Cargando detalles...</p>
                      ) : expandedItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin items</p>
                      ) : (
                        <div className="space-y-1.5">
                          {expandedItems.map(item => {
                            const meta = (item.value_sent ?? {}) as Record<string, unknown>
                            return (
                              <ExpandedItemRow
                                key={item.id}
                                item={item}
                                meta={meta}
                                jobType={expandedJobType}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

// ---- Expanded item row (rich details based on job type) ----

function ExpandedItemRow({
  item,
  meta,
  jobType,
}: {
  item: RobotJobItem
  meta: Record<string, unknown>
  jobType: string | null
}) {
  const contactName = (meta.contactName as string | null) ?? null
  const statusColor = item.status === 'success'
    ? 'text-green-700 dark:text-green-400'
    : item.status === 'error'
      ? 'text-red-700 dark:text-red-400'
      : 'text-muted-foreground'
  const borderColor = item.status === 'success'
    ? 'border-green-200 dark:border-green-800'
    : item.status === 'error'
      ? 'border-red-200 dark:border-red-800'
      : ''

  // create_shipment: nombre, pedido#, ciudad, valor
  if (jobType === 'create_shipment') {
    const city = (meta.city as string | null) ?? null
    const dept = (meta.department as string | null) ?? null
    const totalValue = (meta.totalValue as number) ?? 0
    return (
      <div className={cn('text-xs space-y-0.5 border-l-2 pl-2', borderColor, statusColor)}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] px-1.5', borderColor)}>
            {item.status}
          </Badge>
          <span className="font-medium">{contactName || 'Sin nombre'}</span>
          {item.tracking_number && (
            <span className="font-mono text-muted-foreground">#{item.tracking_number}</span>
          )}
        </div>
        <div className="pl-2 text-muted-foreground">
          {[city, dept].filter(Boolean).join(', ')}
          {totalValue > 0 && ` - $${totalValue.toLocaleString('es-CO')}`}
        </div>
        {item.error_message && (
          <div className="pl-2 text-red-600 dark:text-red-400 truncate">{item.error_message}</div>
        )}
      </div>
    )
  }

  // guide_lookup: nombre, pedido# -> guia#
  if (jobType === 'guide_lookup') {
    const pedidoNumber = (meta.pedidoNumber as string) ?? ''
    return (
      <div className={cn('text-xs space-y-0.5 border-l-2 pl-2', borderColor, statusColor)}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] px-1.5', borderColor)}>
            {item.status}
          </Badge>
          <span className="font-medium">{contactName || 'Sin nombre'}</span>
        </div>
        <div className="pl-2 text-muted-foreground">
          Pedido: {pedidoNumber}
          {item.status === 'success' && item.tracking_number && (
            <> &rarr; Guia: {item.tracking_number}</>
          )}
        </div>
        {item.error_message && (
          <div className="pl-2 text-red-600 dark:text-red-400 truncate">{item.error_message}</div>
        )}
      </div>
    )
  }

  // ocr_guide_read: categoria OCR
  if (jobType === 'ocr_guide_read') {
    const ocrCategory = (meta.ocrCategory as string) ?? 'unknown'
    const guideNumber = (meta.guideNumber as string | null) ?? null
    const orderName = (meta.orderName as string | null) ?? null
    return (
      <div className={cn('text-xs space-y-0.5 border-l-2 pl-2', borderColor, statusColor)}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] px-1.5', borderColor)}>
            {item.status}
          </Badge>
          {guideNumber && <span className="font-mono">#{guideNumber}</span>}
          {orderName && <span>&rarr; {orderName}</span>}
          {!guideNumber && !orderName && <span>imagen</span>}
        </div>
        <div className="pl-2 text-muted-foreground">
          {ocrCategory.replace(/_/g, ' ')}
        </div>
      </div>
    )
  }

  // pdf/excel: nombre, valor
  if (jobType?.startsWith('pdf_guide_') || jobType === 'excel_guide_envia') {
    const totalValue = (meta.totalValue as number) ?? 0
    return (
      <div className={cn('text-xs space-y-0.5 border-l-2 pl-2', borderColor, statusColor)}>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn('text-[10px] px-1.5', borderColor)}>
            {item.status}
          </Badge>
          <span className="font-medium">{contactName || item.order_id?.slice(0, 8) || 'item'}</span>
          {totalValue > 0 && (
            <span className="text-muted-foreground">${totalValue.toLocaleString('es-CO')}</span>
          )}
        </div>
        {item.error_message && (
          <div className="pl-2 text-red-600 dark:text-red-400 truncate">{item.error_message}</div>
        )}
      </div>
    )
  }

  // Fallback for unknown job types
  return (
    <div className={cn('flex items-center gap-2 text-xs', statusColor)}>
      <Badge variant="outline" className={cn('text-[10px] px-1.5', borderColor)}>
        {item.status}
      </Badge>
      <span className="font-mono truncate">
        {contactName || (item.order_id?.slice(0, 8) ?? 'item')}
      </span>
      {item.tracking_number && (
        <span className="text-muted-foreground">#{item.tracking_number}</span>
      )}
      {item.error_message && (
        <span className="text-muted-foreground truncate">{item.error_message}</span>
      )}
    </div>
  )
}
