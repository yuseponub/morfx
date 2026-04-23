'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Ban,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TRIGGER_CATALOG } from '@/lib/automations/constants'
import type { Automation, AutomationExecution } from '@/lib/automations/types'
import { ExecutionDetailDialog } from './execution-detail-dialog'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

// ============================================================================
// Status config
// ============================================================================

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline'; icon: typeof CheckCircle2 }
> = {
  success: { label: 'Exitosa', variant: 'default', icon: CheckCircle2 },
  failed: { label: 'Fallida', variant: 'destructive', icon: XCircle },
  running: { label: 'Ejecutando', variant: 'secondary', icon: Loader2 },
  cancelled: { label: 'Cancelada', variant: 'outline', icon: Ban },
}

// ============================================================================
// Helpers
// ============================================================================

function getTriggerLabel(triggerType: string): string {
  const found = TRIGGER_CATALOG.find((t) => t.type === triggerType)
  return found?.label ?? triggerType
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '-'
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSec = seconds % 60
  return `${minutes}m ${remainSec}s`
}

// ============================================================================
// Component
// ============================================================================

interface ExecutionHistoryProps {
  initialData: {
    data: (AutomationExecution & { automation_name: string })[]
    total: number
    page: number
    pageSize: number
  }
  automations: Automation[]
  currentFilters: {
    page: number
    status?: string
    automationId?: string
  }
}

export function ExecutionHistory({
  initialData,
  automations,
  currentFilters,
}: ExecutionHistoryProps) {
  const v2 = useDashboardV2()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [selectedExecution, setSelectedExecution] = useState<
    (AutomationExecution & { automation_name: string }) | null
  >(null)

  const totalPages = Math.ceil(initialData.total / initialData.pageSize)

  function updateFilters(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(updates)) {
      if (value && value !== 'all') {
        params.set(key, value)
      } else {
        params.delete(key)
      }
    }

    // Reset to page 1 when filters change (unless we're only changing page)
    if (!('page' in updates)) {
      params.delete('page')
    }

    router.push(`/automatizaciones/historial?${params.toString()}`)
  }

  // v2: map status -> mx-tag--* token + dot color (per mock .run-row + D-DASH-15)
  const V2_STATUS_TAG: Record<string, string> = {
    success: 'mx-tag--verdigris',
    failed: 'mx-tag--rubric',
    running: 'mx-tag--gold',
    cancelled: 'mx-tag--ink',
  }
  const V2_STATUS_DOT: Record<string, string> = {
    success: 'bg-[var(--semantic-success)]',
    failed: 'bg-[var(--rubric-2)]',
    running: 'bg-[var(--accent-gold)]',
    cancelled: 'bg-[var(--ink-4)]',
  }

  return (
    <>
      {/* Back link + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className={cn(
            'mr-auto',
            v2 && 'text-[12px] text-[var(--ink-3)] hover:text-[var(--ink-1)] hover:bg-[var(--paper-3)]'
          )}
          style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
        >
          <Link href="/automatizaciones">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Automatizaciones
          </Link>
        </Button>
        <div className="flex gap-2 w-full sm:w-auto">
          <Select
            value={currentFilters.status ?? 'all'}
            onValueChange={(value) => updateFilters({ status: value })}
          >
            <SelectTrigger
              className={cn(
                'w-[160px]',
                v2 && 'bg-[var(--paper-0)] border-[var(--border)] text-[12px] text-[var(--ink-1)] focus-visible:ring-[var(--ink-1)]'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="success">Exitosa</SelectItem>
              <SelectItem value="failed">Fallida</SelectItem>
              <SelectItem value="running">Ejecutando</SelectItem>
              <SelectItem value="cancelled">Cancelada</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={currentFilters.automationId ?? 'all'}
            onValueChange={(value) => updateFilters({ automationId: value })}
          >
            <SelectTrigger
              className={cn(
                'w-[200px]',
                v2 && 'bg-[var(--paper-0)] border-[var(--border)] text-[12px] text-[var(--ink-1)] focus-visible:ring-[var(--ink-1)]'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              <SelectValue placeholder={v2 ? 'Automatización' : 'Automatizacion'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {automations.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {initialData.data.length === 0 ? (
        v2 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
            <p className="mx-h3">Sin ejecuciones.</p>
            <p className="mx-caption">
              No hay ejecuciones registradas con los filtros seleccionados.
            </p>
            <p className="mx-rule-ornament">· · ·</p>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No hay ejecuciones registradas con los filtros seleccionados
          </div>
        )
      ) : (
        <div
          className={cn(
            v2
              ? 'border border-[var(--ink-1)] bg-[var(--paper-0)] shadow-[0_1px_0_var(--ink-1)]'
              : 'rounded-md border'
          )}
        >
          <Table>
            <TableHeader>
              <TableRow
                className={cn(
                  v2 && 'border-b border-[var(--ink-1)] bg-[var(--paper-2)] hover:bg-[var(--paper-2)]'
                )}
              >
                <TableHead
                  className={cn(
                    v2 && 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                >
                  Fecha
                </TableHead>
                <TableHead
                  className={cn(
                    v2 && 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                >
                  {v2 ? 'Automatización' : 'Automatizacion'}
                </TableHead>
                <TableHead
                  className={cn(
                    'hidden md:table-cell',
                    v2 && 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                >
                  Trigger
                </TableHead>
                <TableHead
                  className={cn(
                    v2 && 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                >
                  Estado
                </TableHead>
                <TableHead
                  className={cn(
                    'hidden sm:table-cell',
                    v2 && 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                >
                  {v2 ? 'Duración' : 'Duracion'}
                </TableHead>
                <TableHead
                  className={cn(
                    'hidden sm:table-cell text-right',
                    v2 && 'text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ink-3)]'
                  )}
                  style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                >
                  Acciones
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {initialData.data.map((execution) => {
                const statusCfg = STATUS_CONFIG[execution.status] ?? STATUS_CONFIG.cancelled
                const StatusIcon = statusCfg.icon

                // Get trigger type from parent automation or trigger_event
                const parentAutomation = automations.find(
                  (a) => a.id === execution.automation_id
                )
                const triggerType = parentAutomation?.trigger_type ?? ''
                const actionsCount = execution.actions_log?.length ?? 0
                const failedCount =
                  execution.actions_log?.filter((a) => a.status === 'failed').length ?? 0

                return (
                  <TableRow
                    key={execution.id}
                    className={cn(
                      'cursor-pointer',
                      v2
                        ? 'border-b border-dotted border-[var(--border)] hover:bg-[var(--paper-3)]'
                        : 'hover:bg-muted/50'
                    )}
                    onClick={() => setSelectedExecution(execution)}
                  >
                    <TableCell
                      className={cn(
                        'text-xs whitespace-nowrap',
                        v2 && 'text-[11px] text-[var(--ink-3)]'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
                    >
                      {formatDate(execution.started_at)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'max-w-[200px] truncate',
                        v2
                          ? 'text-[13px] font-semibold text-[var(--ink-1)]'
                          : 'font-medium text-sm'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
                    >
                      {execution.automation_name}
                      {v2 && (
                        <div
                          className="text-[10px] text-[var(--ink-3)] mt-0.5"
                          style={{ fontFamily: 'var(--font-mono)' }}
                        >
                          #{execution.id.slice(0, 8)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'hidden md:table-cell',
                        v2
                          ? 'text-[11px] italic text-[var(--ink-3)]'
                          : 'text-xs text-muted-foreground'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
                    >
                      {triggerType ? getTriggerLabel(triggerType) : '-'}
                    </TableCell>
                    <TableCell>
                      {v2 ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className={cn('h-2 w-2 rounded-full shrink-0', V2_STATUS_DOT[execution.status] ?? V2_STATUS_DOT.cancelled)}
                            aria-hidden
                          />
                          <span
                            className={cn(
                              'mx-tag text-[10px]',
                              V2_STATUS_TAG[execution.status] ?? 'mx-tag--ink'
                            )}
                            style={{ fontFamily: 'var(--font-sans)' }}
                          >
                            {statusCfg.label}
                          </span>
                        </span>
                      ) : (
                        <Badge variant={statusCfg.variant} className="gap-1">
                          <StatusIcon className="h-3 w-3" />
                          {statusCfg.label}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'hidden sm:table-cell',
                        v2
                          ? 'text-[11px] tabular-nums text-[var(--ink-2)]'
                          : 'text-xs text-muted-foreground'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
                    >
                      {formatDuration(execution.duration_ms)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'hidden sm:table-cell text-right',
                        v2
                          ? 'text-[11px] tabular-nums text-[var(--ink-3)]'
                          : 'text-xs text-muted-foreground'
                      )}
                      style={v2 ? { fontFamily: 'var(--font-mono)' } : undefined}
                    >
                      {actionsCount} acci{actionsCount !== 1 ? 'ones' : 'ón'}
                      {failedCount > 0 && (
                        <span
                          className={cn('ml-1', v2 ? 'text-[var(--rubric-2)]' : 'text-destructive')}
                        >
                          ({failedCount} fallida{failedCount !== 1 ? 's' : ''})
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p
            className={cn(
              v2 ? 'text-[11px] italic text-[var(--ink-3)]' : 'text-sm text-muted-foreground'
            )}
            style={v2 ? { fontFamily: 'var(--font-serif)' } : undefined}
          >
            {v2 ? 'Página' : 'Pagina'} {initialData.page} de {totalPages} ({initialData.total}{' '}
            resultados)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={initialData.page <= 1}
              onClick={() => updateFilters({ page: String(initialData.page - 1) })}
              className={cn(
                v2 &&
                  'bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={initialData.page >= totalPages}
              onClick={() => updateFilters({ page: String(initialData.page + 1) })}
              className={cn(
                v2 &&
                  'bg-transparent text-[var(--ink-1)] border border-[var(--ink-1)] hover:bg-[var(--paper-3)] text-[11px] font-semibold uppercase tracking-[0.08em]'
              )}
              style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
            >
              Siguiente
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail dialog */}
      <ExecutionDetailDialog
        execution={selectedExecution}
        onClose={() => setSelectedExecution(null)}
      />
    </>
  )
}
