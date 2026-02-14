'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Message
// Renders a single chat message with AI SDK v6 parts.
// Handles text parts, dynamic tool invocations (loading/result states),
// and preview placeholders for the diagram generator.
// ============================================================================

import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'
import { Loader2, Check, Workflow } from 'lucide-react'

interface BuilderMessageProps {
  message: UIMessage
}

// ============================================================================
// Tool name translations for Spanish UI
// ============================================================================

const TOOL_LABELS: Record<string, string> = {
  listPipelines: 'Consultando pipelines...',
  listPipelineStages: 'Consultando etapas...',
  listTags: 'Consultando tags...',
  listCustomFields: 'Consultando campos personalizados...',
  listAutomations: 'Consultando automatizaciones...',
  getAutomationDetail: 'Cargando automatizacion...',
  generatePreview: 'Generando preview...',
  createAutomation: 'Creando automatizacion...',
  updateAutomation: 'Actualizando automatizacion...',
}

// Tools whose results should show a visible indicator (write operations)
const VISIBLE_RESULT_TOOLS = new Set([
  'createAutomation',
  'updateAutomation',
  'generatePreview',
])

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

function ToolResult({ toolName }: { toolName: string }) {
  // Hide result indicators for read-only/lookup tools
  if (!VISIBLE_RESULT_TOOLS.has(toolName)) {
    return null
  }

  const labels: Record<string, string> = {
    createAutomation: 'Automatizacion creada',
    updateAutomation: 'Automatizacion actualizada',
    generatePreview: 'Preview generado',
  }

  return (
    <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 w-fit">
      <Check className="h-3 w-3" />
      <span>{labels[toolName] ?? toolName}</span>
    </div>
  )
}

function PreviewPlaceholder({ data }: { data: unknown }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
      <Workflow className="h-5 w-5" />
      <span>Preview del diagrama</span>
    </div>
  )
}

// ============================================================================
// Main component
// ============================================================================

export function BuilderMessage({ message }: BuilderMessageProps) {
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
            : 'bg-muted mr-auto max-w-[80%]'
        )}
      >
        {message.parts.map((part, i) => {
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
                if (toolName === 'generatePreview') {
                  return <PreviewPlaceholder key={i} data={part.output} />
                }
                return <ToolResult key={i} toolName={toolName} />
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
