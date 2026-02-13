'use client'

import {
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  Ban,
  Clock,
  Layers,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { ACTION_CATALOG, TRIGGER_CATALOG } from '@/lib/automations/constants'
import type { ActionLog, AutomationExecution } from '@/lib/automations/types'

// ============================================================================
// Status config
// ============================================================================

const EXECUTION_STATUS: Record<
  string,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  success: { label: 'Exitosa', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
  failed: { label: 'Fallida', color: 'text-red-600 dark:text-red-400', icon: XCircle },
  running: { label: 'Ejecutando', color: 'text-yellow-600 dark:text-yellow-400', icon: Loader2 },
  cancelled: { label: 'Cancelada', color: 'text-muted-foreground', icon: Ban },
}

const ACTION_STATUS: Record<
  string,
  { label: string; color: string; bgColor: string; icon: typeof CheckCircle2 }
> = {
  success: {
    label: 'OK',
    color: 'text-green-700 dark:text-green-300',
    bgColor: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    icon: CheckCircle2,
  },
  failed: {
    label: 'Error',
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    icon: XCircle,
  },
  skipped: {
    label: 'Omitida',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50 border-muted',
    icon: SkipForward,
  },
}

// ============================================================================
// Helpers
// ============================================================================

function getActionLabel(actionType: string): string {
  const found = ACTION_CATALOG.find((a) => a.type === actionType)
  return found?.label ?? actionType
}

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
    second: '2-digit',
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

function formatTriggerEvent(triggerEvent: Record<string, unknown>): string {
  try {
    return JSON.stringify(triggerEvent, null, 2)
  } catch {
    return String(triggerEvent)
  }
}

// ============================================================================
// Component
// ============================================================================

interface ExecutionDetailDialogProps {
  execution: (AutomationExecution & { automation_name: string }) | null
  onClose: () => void
}

export function ExecutionDetailDialog({ execution, onClose }: ExecutionDetailDialogProps) {
  if (!execution) return null

  const execStatus = EXECUTION_STATUS[execution.status] ?? EXECUTION_STATUS.cancelled
  const ExecIcon = execStatus.icon

  // Try to get trigger type from trigger_event
  const triggerType = (execution.trigger_event?.triggerType as string) ?? ''

  return (
    <Dialog open={!!execution} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExecIcon className={`h-5 w-5 ${execStatus.color}`} />
            {execution.automation_name}
          </DialogTitle>
          <DialogDescription>
            Detalle de ejecucion
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Estado</span>
                <p className={`font-medium ${execStatus.color}`}>{execStatus.label}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Duracion</span>
                <p className="font-medium flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDuration(execution.duration_ms)}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Inicio</span>
                <p className="font-medium">{formatDate(execution.started_at)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Fin</span>
                <p className="font-medium">
                  {execution.completed_at ? formatDate(execution.completed_at) : '-'}
                </p>
              </div>
              {triggerType && (
                <div>
                  <span className="text-muted-foreground">Trigger</span>
                  <p className="font-medium">{getTriggerLabel(triggerType)}</p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Layers className="h-3 w-3" />
                  Cascade depth
                </span>
                <p className="font-medium">{execution.cascade_depth}</p>
              </div>
            </div>

            {/* Error message */}
            {execution.error_message && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                <strong>Error:</strong> {execution.error_message}
              </div>
            )}

            <Separator />

            {/* Trigger event data */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Datos del Trigger</h4>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto max-h-48">
                {formatTriggerEvent(execution.trigger_event)}
              </pre>
            </div>

            <Separator />

            {/* Actions timeline */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Acciones ({execution.actions_log?.length ?? 0})</h4>
              <div className="space-y-2">
                {(execution.actions_log ?? []).map((action: ActionLog, idx: number) => {
                  const actionStatus = ACTION_STATUS[action.status] ?? ACTION_STATUS.skipped
                  const ActionIcon = actionStatus.icon

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-md border text-sm ${actionStatus.bgColor}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground font-mono shrink-0">
                            #{action.index + 1}
                          </span>
                          <ActionIcon className={`h-4 w-4 shrink-0 ${actionStatus.color}`} />
                          <span className="font-medium truncate">
                            {getActionLabel(action.type)}
                          </span>
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {actionStatus.label}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDuration(action.duration_ms)}
                        </span>
                      </div>
                      {action.error && (
                        <p className="mt-1.5 text-xs text-red-700 dark:text-red-300 pl-12">
                          {action.error}
                        </p>
                      )}
                      {action.result != null && action.status === 'success' && (
                        <pre className="mt-1.5 text-[10px] text-muted-foreground pl-12 overflow-x-auto max-w-full">
                          {typeof action.result === 'string'
                            ? action.result
                            : JSON.stringify(action.result as Record<string, unknown>, null, 2)}
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
