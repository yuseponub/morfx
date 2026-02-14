'use client'

// ============================================================================
// Phase 19: AI Automation Builder — Custom React Flow Node Components
// Three node types: TriggerNode (violet), ConditionNode (amber), ActionNode (blue).
// Used in the automation preview diagram rendered inline in chat.
// ============================================================================

import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Zap, GitBranch, Play, AlertTriangle, Clock } from 'lucide-react'
import type { DiagramNodeData } from '@/lib/builder/types'

// ============================================================================
// Type Definitions
// ============================================================================

type TriggerNodeType = Node<DiagramNodeData, 'triggerNode'>
type ConditionNodeType = Node<DiagramNodeData, 'conditionNode'>
type ActionNodeType = Node<DiagramNodeData, 'actionNode'>

// ============================================================================
// Shared Components
// ============================================================================

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {category}
    </span>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1 dark:bg-red-950/50">
      <AlertTriangle className="mt-0.5 size-3 shrink-0 text-red-500" />
      <span className="text-[11px] leading-tight text-red-600 dark:text-red-400">
        {message}
      </span>
    </div>
  )
}

function ConfigDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className="font-medium">{label}:</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

// ============================================================================
// TriggerNode — Purple/Violet accent
// ============================================================================

function TriggerNode({ data }: NodeProps<TriggerNodeType>) {
  const borderColor = data.hasError
    ? 'border-red-500'
    : 'border-violet-300 dark:border-violet-700'
  const bgColor = data.hasError
    ? 'bg-red-50 dark:bg-red-950/30'
    : 'bg-violet-50 dark:bg-violet-950'

  // Extract displayable config values
  const configEntries = data.triggerConfig
    ? Object.entries(data.triggerConfig).filter(
        ([, v]) => v !== null && v !== undefined && v !== ''
      )
    : []

  return (
    <div
      className={`rounded-xl border-2 shadow-sm ${borderColor} ${bgColor} min-w-[220px] max-w-[280px] px-4 py-3`}
    >
      <div className="flex items-start gap-2">
        <Zap className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{data.label}</p>
          {data.category && <CategoryBadge category={data.category} />}
        </div>
      </div>

      {configEntries.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {configEntries.slice(0, 3).map(([key, value]) => (
            <ConfigDetail key={key} label={key} value={String(value)} />
          ))}
        </div>
      )}

      {data.hasError && data.errorMessage && (
        <ErrorBanner message={data.errorMessage} />
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-violet-400 !bg-violet-300"
      />
    </div>
  )
}

// ============================================================================
// ConditionNode — Amber/Yellow accent
// ============================================================================

function ConditionNode({ data }: NodeProps<ConditionNodeType>) {
  const count = data.conditionCount ?? 0
  const conditionText =
    count === 1 ? '1 condicion' : `${count} condiciones`

  return (
    <div className="min-w-[220px] max-w-[280px] rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-700 dark:bg-amber-950">
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-amber-400 !bg-amber-300"
      />

      <div className="flex items-start gap-2">
        <GitBranch className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{data.label}</p>
          <p className="text-xs text-muted-foreground">{conditionText}</p>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-amber-400 !bg-amber-300"
      />
    </div>
  )
}

// ============================================================================
// ActionNode — Blue/Sky accent
// ============================================================================

function ActionNode({ data }: NodeProps<ActionNodeType>) {
  const borderColor = data.hasError
    ? 'border-red-500'
    : 'border-sky-300 dark:border-sky-700'
  const bgColor = data.hasError
    ? 'bg-red-50 dark:bg-red-950/30'
    : 'bg-sky-50 dark:bg-sky-950'

  // Format delay text
  const delayText = data.delay
    ? formatDelay(data.delay.amount, data.delay.unit)
    : null

  // Extract key params for display
  const displayParams = extractDisplayParams(data.params ?? {})

  return (
    <div
      className={`rounded-xl border-2 shadow-sm ${borderColor} ${bgColor} min-w-[220px] max-w-[280px] px-4 py-3`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !border-sky-400 !bg-sky-300"
      />

      <div className="flex items-start gap-2">
        <Play className="mt-0.5 size-4 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{data.label}</p>
          {data.category && <CategoryBadge category={data.category} />}
        </div>
      </div>

      {delayText && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <Clock className="size-3" />
          <span>Esperar {delayText}</span>
        </div>
      )}

      {displayParams.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {displayParams.map(({ label, value }) => (
            <ConfigDetail key={label} label={label} value={value} />
          ))}
        </div>
      )}

      {data.hasError && data.errorMessage && (
        <ErrorBanner message={data.errorMessage} />
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !border-sky-400 !bg-sky-300"
      />
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function formatDelay(amount: number, unit: 'minutes' | 'hours' | 'days'): string {
  const unitLabels: Record<string, string> = {
    minutes: amount === 1 ? 'minuto' : 'minutos',
    hours: amount === 1 ? 'hora' : 'horas',
    days: amount === 1 ? 'dia' : 'dias',
  }
  return `${amount} ${unitLabels[unit] ?? unit}`
}

/** Extract human-readable key params for the action node detail display */
function extractDisplayParams(
  params: Record<string, unknown>
): { label: string; value: string }[] {
  const display: { label: string; value: string }[] = []

  // Map known param keys to Spanish labels
  const paramLabels: Record<string, string> = {
    tagName: 'Etiqueta',
    templateName: 'Plantilla',
    pipelineId: 'Pipeline',
    targetPipelineId: 'Pipeline destino',
    stageId: 'Etapa',
    targetStageId: 'Etapa destino',
    assignToUserId: 'Asignar a',
    message: 'Mensaje',
    subject: 'Asunto',
    taskTitle: 'Tarea',
    fieldName: 'Campo',
    fieldValue: 'Valor',
  }

  for (const [key, value] of Object.entries(params)) {
    if (
      value !== null &&
      value !== undefined &&
      value !== '' &&
      paramLabels[key]
    ) {
      display.push({
        label: paramLabels[key],
        value: String(value),
      })
    }
  }

  // Limit to 3 params to avoid overly tall nodes
  return display.slice(0, 3)
}

// ============================================================================
// Custom Node Types Export
// ============================================================================

export const customNodeTypes = {
  triggerNode: TriggerNode,
  conditionNode: ConditionNode,
  actionNode: ActionNode,
}
