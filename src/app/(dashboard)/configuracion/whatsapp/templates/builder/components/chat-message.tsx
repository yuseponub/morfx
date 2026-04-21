'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.2
// UIMessage renderer con branches por part.type (AI SDK v6).
// Clon del builder-message.tsx del automation builder con:
//   1. Labels de las 6 template tools (listExisting, suggestCat/Lang, capture,
//      validate, submit)
//   2. ToolOutput dispatcha patches al TemplateDraftContext cuando arriba un
//      tool-result exitoso (suggestCategory -> { category }, etc.)
//   3. Legacy fallback (!message.parts || !Array.isArray) preservado
//
// Merge semantics (Pitfall documentado en el plan):
//   - suggestCategory / suggestLanguage -> campos escalares, APPLY_AI_PATCH OK.
//   - captureVariableMapping -> objeto variableMapping: usa UPDATE_FIELD con
//     el dict completo mergeado leyendo el estado actual desde el context.
// ============================================================================

import { useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'
import type { TemplateDraft } from '@/lib/config-builder/templates/types'
import { useTemplateDraft } from './template-draft-context'
import { Loader2, Check, ExternalLink } from 'lucide-react'

type PatchAction =
  | { type: 'UPDATE_FIELD'; field: keyof TemplateDraft; value: unknown }
  | { type: 'APPLY_AI_PATCH'; patch: Partial<TemplateDraft> }
  | { type: 'RESET' }

interface ChatMessageProps {
  message: UIMessage
  onDraftPatch: (action: PatchAction) => void
}

// ============================================================================
// Labels de las 6 tools del template builder
// ============================================================================

const TOOL_LABELS: Record<string, string> = {
  listExistingTemplates: 'Consultando templates existentes...',
  suggestCategory: 'Analizando categoria...',
  suggestLanguage: 'Detectando idioma...',
  captureVariableMapping: 'Mapeando variable...',
  updateDraft: 'Actualizando preview...',
  validateTemplateDraft: 'Validando...',
  submitTemplate: 'Enviando a Meta...',
}

// ============================================================================
// Helpers
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

// ============================================================================
// ToolOutput — dispatcha patches al draft context segun el tool output
// ============================================================================

function ToolOutput({
  toolName,
  output,
  onDraftPatch,
}: {
  toolName: string
  output: unknown
  onDraftPatch: ChatMessageProps['onDraftPatch']
}) {
  // Leer el variableMapping actual para hacer merge correcto (el reducer
  // shallow-merge-a, asi que pasamos el dict completo ya mergeado).
  const { draft } = useTemplateDraft()
  const currentMapping = draft.variableMapping

  // Dispatch one-time cuando el output aparece (effect dep includes output ref)
  useEffect(() => {
    if (!output || typeof output !== 'object') return
    const o = output as Record<string, unknown>

    // Solo actuar si success === true (no tocar el draft en errores)
    if ('success' in o && o.success === true) {
      if (toolName === 'suggestCategory' && 'category' in o) {
        onDraftPatch({
          type: 'APPLY_AI_PATCH',
          patch: { category: o.category as TemplateDraft['category'] },
        })
      } else if (toolName === 'suggestLanguage' && 'language' in o) {
        onDraftPatch({
          type: 'APPLY_AI_PATCH',
          patch: { language: o.language as TemplateDraft['language'] },
        })
      } else if (toolName === 'updateDraft' && 'patch' in o && o.patch && typeof o.patch === 'object') {
        onDraftPatch({
          type: 'APPLY_AI_PATCH',
          patch: o.patch as Partial<TemplateDraft>,
        })
      } else if (
        toolName === 'captureVariableMapping' &&
        'varIndex' in o &&
        'path' in o
      ) {
        // Merge: leer el estado actual y pasar el dict completo mergeado
        const merged = {
          ...currentMapping,
          [String(o.varIndex)]: String(o.path),
        }
        onDraftPatch({
          type: 'UPDATE_FIELD',
          field: 'variableMapping',
          value: merged,
        })
      }
    }
    // Nota: no incluimos currentMapping en deps porque no queremos re-ejecutar
    // al cambiar el mapping (evita bucles si el render reuses mismo output).
    // output ref + toolName son suficientes para ejecutar una vez por tool-call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolName, output, onDraftPatch])

  if (!output || typeof output !== 'object') return null
  const o = output as Record<string, unknown>

  // submitTemplate success -> green banner con link
  if (toolName === 'submitTemplate' && 'success' in o && o.success === true && 'templateId' in o) {
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/50">
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="h-4 w-4" />
          Template enviado a Meta
        </div>
        <a
          href="/configuracion/whatsapp/templates"
          className="flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
        >
          <ExternalLink className="h-3 w-3" />
          Ver en templates ({String(o.templateId)})
        </a>
      </div>
    )
  }

  // submitTemplate error
  if (toolName === 'submitTemplate' && 'success' in o && o.success === false && 'error' in o) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-destructive/10 text-xs text-destructive w-fit">
        <span>Error: {String(o.error)}</span>
      </div>
    )
  }

  // validateTemplateDraft con errores
  if (toolName === 'validateTemplateDraft' && 'error' in o && 'errors' in o && Array.isArray(o.errors)) {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-2">
        <div className="text-xs font-medium text-destructive">Validacion fallo:</div>
        <ul className="text-xs text-destructive list-disc list-inside">
          {(o.errors as string[]).map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      </div>
    )
  }

  // updateDraft: chip con los campos que se actualizaron (diagnostico visual)
  if (toolName === 'updateDraft' && 'success' in o && o.success === true && 'patch' in o && o.patch && typeof o.patch === 'object') {
    const fields = Object.keys(o.patch as Record<string, unknown>)
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400 w-fit">
        <Check className="h-3 w-3" />
        <span>Preview actualizado ({fields.join(', ') || 'sin cambios'})</span>
      </div>
    )
  }

  // Tools "silenciosos" (listExisting, suggest*, capture): un check sutil
  if ('success' in o && o.success === true) {
    const label = TOOL_LABELS[toolName] ?? toolName
    const shortLabel = label.replace('...', '').toLowerCase()
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-500/10 text-xs text-emerald-600 dark:text-emerald-400 w-fit">
        <Check className="h-3 w-3" />
        <span>{shortLabel} OK</span>
      </div>
    )
  }

  // Error inesperado
  if ('error' in o) {
    return (
      <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-destructive/10 text-xs text-destructive w-fit">
        <span>Error {toolName}: {String(o.error)}</span>
      </div>
    )
  }

  return null
}

// ============================================================================
// Main component
// ============================================================================

export function ChatMessage({ message, onDraftPatch }: ChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-2xl px-4 py-2.5 space-y-2',
          isUser
            ? 'bg-primary text-primary-foreground ml-auto max-w-[80%]'
            : 'bg-muted mr-auto max-w-[90%]'
        )}
      >
        {(!message.parts || !Array.isArray(message.parts)) ? (
          // Legacy fallback para mensajes corruptos/legacy sin .parts (ModelMessage format)
          <div className="text-sm whitespace-pre-wrap break-words">
            {typeof (message as unknown as { content: string }).content === 'string'
              ? (message as unknown as { content: string }).content
              : ''}
          </div>
        ) : (
          message.parts.map((part, i) => {
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
                // AI SDK v6 tool states:
                //   input-streaming / input-available -> loading
                //   output-available -> ToolOutput (renders + dispatches patch)
                //   output-error -> red badge
                const { toolName, state } = part

                if (state === 'input-streaming' || state === 'input-available') {
                  return <ToolLoading key={i} toolName={toolName} />
                }

                if (state === 'output-available') {
                  return (
                    <ToolOutput
                      key={i}
                      toolName={toolName}
                      output={part.output}
                      onDraftPatch={onDraftPatch}
                    />
                  )
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
          })
        )}
      </div>
    </div>
  )
}
