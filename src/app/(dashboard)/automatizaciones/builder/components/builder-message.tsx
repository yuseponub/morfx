'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Message
// Renders a single chat message with AI SDK v6 parts.
// Handles text parts, dynamic tool invocations (loading/result states),
// and inline AutomationPreview diagrams for generatePreview results.
// ============================================================================

import { cn } from '@/lib/utils'
import dynamic from 'next/dynamic'
import type { UIMessage } from 'ai'
import type { AutomationPreviewData } from '@/lib/builder/types'
import { Loader2, Check, ExternalLink } from 'lucide-react'

// Dynamically import AutomationPreview (requires browser APIs for React Flow)
const AutomationPreview = dynamic(
  () => import('./automation-preview').then((mod) => mod.AutomationPreview),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-48 rounded-lg border animate-pulse bg-muted" />
    ),
  }
)

// ============================================================================
// Props
// ============================================================================

interface BuilderMessageProps {
  message: UIMessage
  onConfirmPreview: (data: AutomationPreviewData) => void
  onModifyRequest: () => void
}

// ============================================================================
// Tool name translations for Spanish UI
// ============================================================================

const TOOL_LABELS: Record<string, string> = {
  listPipelines: 'Consultando pipelines...',
  listPipelineStages: 'Consultando etapas...',
  listTags: 'Consultando tags...',
  listTemplates: 'Consultando templates...',
  listCustomFields: 'Consultando campos personalizados...',
  listAutomations: 'Consultando automatizaciones...',
  listWorkspaceMembers: 'Consultando miembros...',
  getAutomation: 'Cargando automatizacion...',
  generatePreview: 'Generando preview...',
  createAutomation: 'Creando automatizacion...',
  updateAutomation: 'Actualizando automatizacion...',
}

// ============================================================================
// Helper sub-components
// ============================================================================

function ToolLoading({ toolName }: { toolName: string }) {
  const label = TOOL_LABELS[toolName] ?? `Ejecutando ${toolName}...`

  return (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/50 text-xs text-muted-foreground w-fit">
      <Loader2 className="h-3 w-3 animate-spin" />
      <span>{label}</span>
    </div>
  )
}

function CreateAutomationResult({ output }: { output: unknown }) {
  const result = output as
    | { success: true; automationId: string }
    | { success: false; error: string }
    | null

  if (!result) return null

  if ('success' in result && result.success && 'automationId' in result) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          Automatizacion creada (desactivada)
        </div>
        <a
          href={`/automatizaciones`}
          className="flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
        >
          <ExternalLink className="h-3 w-3" />
          Ver en automatizaciones
        </a>
      </div>
    )
  }

  if ('success' in result && !result.success && 'error' in result) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-destructive/10 text-xs text-destructive w-fit">
        <span>Error: {result.error}</span>
      </div>
    )
  }

  return null
}

function UpdateAutomationResult({ output }: { output: unknown }) {
  const result = output as
    | { success: true; automationId: string }
    | { success: false; error: string }
    | null

  if (!result) return null

  if ('success' in result && result.success) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          Automatizacion actualizada
        </div>
        <a
          href={`/automatizaciones`}
          className="flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
        >
          <ExternalLink className="h-3 w-3" />
          Ver en automatizaciones
        </a>
      </div>
    )
  }

  if ('success' in result && !result.success && 'error' in result) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-destructive/10 text-xs text-destructive w-fit">
        <span>Error: {result.error}</span>
      </div>
    )
  }

  return null
}

function ToolResult({ toolName }: { toolName: string }) {
  const labels: Record<string, string> = {
    generatePreview: 'Preview generado',
  }

  // Only show for tools not handled by their own result components
  if (!labels[toolName]) return null

  return (
    <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 w-fit">
      <Check className="h-3 w-3" />
      <span>{labels[toolName]}</span>
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

export function BuilderMessage({
  message,
  onConfirmPreview,
  onModifyRequest,
}: BuilderMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 space-y-2',
          isUser
            ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]'
            : 'bg-muted mr-auto max-w-[90%]'
        )}
      >
        {(!message.parts || !Array.isArray(message.parts)) ? (
          // Fallback for corrupted/legacy messages without .parts (e.g. ModelMessage format)
          <div className="text-sm whitespace-pre-wrap break-words">
            {typeof (message as unknown as { content: string }).content === 'string'
              ? (message as unknown as { content: string }).content
              : ''}
          </div>
        ) : message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return (
                <div
                  key={i}
                  className={cn(
                    'text-sm whitespace-pre-wrap break-words',
                    !isUser && 'prose prose-sm dark:prose-invert max-w-none'
                  )}
                >
                  {part.text}
                </div>
              )

            case 'dynamic-tool': {
              // Tool invocation states in AI SDK v6:
              // input-streaming / input-available -> loading
              // output-available -> result
              // output-error -> error (show as result)
              const { toolName, state } = part

              if (state === 'input-streaming' || state === 'input-available') {
                return <ToolLoading key={i} toolName={toolName} />
              }

              if (state === 'output-available') {
                // generatePreview: render full diagram preview inline
                if (toolName === 'generatePreview') {
                  const previewData = part.output as AutomationPreviewData | null
                  if (previewData && previewData.diagram) {
                    return (
                      <div key={i} className="w-full -mx-1">
                        <AutomationPreview
                          data={previewData}
                          onConfirm={() => onConfirmPreview(previewData)}
                          onModify={onModifyRequest}
                        />
                      </div>
                    )
                  }
                  // Fallback if output is unexpected
                  return <ToolResult key={i} toolName={toolName} />
                }

                // createAutomation: success indicator with link
                if (toolName === 'createAutomation') {
                  return (
                    <CreateAutomationResult key={i} output={part.output} />
                  )
                }

                // updateAutomation: success indicator with link
                if (toolName === 'updateAutomation') {
                  return (
                    <UpdateAutomationResult key={i} output={part.output} />
                  )
                }

                // Other tools: no visible result (lookup/read-only)
                return null
              }

              if (state === 'output-error') {
                return (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-destructive/10 text-xs text-destructive w-fit"
                  >
                    <span>Error en {toolName}</span>
                  </div>
                )
              }

              return null
            }

            default:
              return null
          }
        })}
      </div>
    </div>
  )
}
