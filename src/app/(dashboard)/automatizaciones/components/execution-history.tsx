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

  return (
    <>
      {/* Back link + Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="mr-auto">
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
            <SelectTrigger className="w-[160px]">
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
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Automatizacion" />
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
        <div className="text-center py-12 text-muted-foreground">
          No hay ejecuciones registradas con los filtros seleccionados
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Automatizacion</TableHead>
                <TableHead className="hidden md:table-cell">Trigger</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="hidden sm:table-cell">Duracion</TableHead>
                <TableHead className="hidden sm:table-cell text-right">Acciones</TableHead>
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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedExecution(execution)}
                  >
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(execution.started_at)}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[200px] truncate">
                      {execution.automation_name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {triggerType ? getTriggerLabel(triggerType) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusCfg.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {statusCfg.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {formatDuration(execution.duration_ms)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-right text-xs text-muted-foreground">
                      {actionsCount} accion{actionsCount !== 1 ? 'es' : ''}
                      {failedCount > 0 && (
                        <span className="text-destructive ml-1">
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
          <p className="text-sm text-muted-foreground">
            Pagina {initialData.page} de {totalPages} ({initialData.total} resultados)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={initialData.page <= 1}
              onClick={() => updateFilters({ page: String(initialData.page - 1) })}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={initialData.page >= totalPages}
              onClick={() => updateFilters({ page: String(initialData.page + 1) })}
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
