'use client'

// ============================================================================
// Standalone: whatsapp-template-ai-builder — Plan 04 Task 4.2
// Streaming chat UI con AI SDK v6 (useChat + DefaultChatTransport).
// Clon adaptado de /automatizaciones/builder/components/builder-chat.tsx:
//   1. Transport api: '/api/config-builder/templates/chat' (Plan 03)
//   2. Rende ChatMessage (no BuilderMessage)
//   3. Remueve AutomationPreviewData; confirmPreview envia mensaje pidiendo submit
//   4. Empty-state en español para templates
//   5. X-Session-Id capture identico al analog (onSessionCreated)
//
// Las salidas de las tools fluyen a PreviewPane via dispatch al
// TemplateDraftContext (onDraftPatch), no via props locales.
// ============================================================================

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { toast } from 'sonner'
import { useTemplateDraft } from './template-draft-context'
import { ChatMessage } from './chat-message'
import { SuggestedActionChips, type SuggestedChip } from './suggested-action-chips'
import { BuilderInput } from '@/app/(dashboard)/automatizaciones/builder/components/builder-input'
import { Sparkles, ImagePlus, Loader2 } from 'lucide-react'
import type { TemplateDraft } from '@/lib/config-builder/templates/types'
import {
  deriveStage,
  mergeChips,
  extractAiActions,
  STARTER_CHIPS,
} from '@/lib/config-builder/templates/suggested-actions'

interface ChatPaneProps {
  sessionId: string | null
  onSessionCreated: (id: string) => void
  initialMessages?: UIMessage[]
  onNewSession: () => void
}

export function ChatPane({ sessionId, onSessionCreated, initialMessages, onNewSession }: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef(sessionId)

  // Keep ref in sync para el fetch wrapper
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const { dispatch, draft } = useTemplateDraft()
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const processedPartsRef = useRef<Set<string>>(new Set())

  // Custom transport que captura X-Session-Id para lift al parent
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/config-builder/templates/chat',
        body: () => ({
          sessionId: sessionIdRef.current,
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          const newSessionId = response.headers.get('X-Session-Id')
          if (newSessionId && !sessionIdRef.current) {
            onSessionCreated(newSessionId)
          }
          return response
        },
      })
  )

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    messages: initialMessages,
  })

  // Auto-scroll al bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  // Parent-level sync del preview: escanea messages cada vez que cambian y
  // dispatcha patches de cualquier tool-result nuevo (updateDraft / suggestCategory /
  // suggestLanguage). Fallback robusto al effect por-componente de ChatMessage,
  // que puede no disparar consistentemente con stream re-renders.
  useEffect(() => {
    for (const msg of messages) {
      if (!msg.parts || !Array.isArray(msg.parts)) continue
      for (let i = 0; i < msg.parts.length; i++) {
        const part = msg.parts[i] as {
          type?: string
          state?: string
          toolName?: string
          output?: unknown
        }
        if (!part.type || part.state !== 'output-available') continue
        // AI SDK v6: statically-typed tools emit 'tool-{toolName}', dynamic tools emit 'dynamic-tool'
        const isDynamic = part.type === 'dynamic-tool'
        const isStatic = part.type.startsWith('tool-')
        if (!isDynamic && !isStatic) continue
        const toolName = isDynamic ? part.toolName : part.type.slice('tool-'.length)
        if (!toolName) continue

        const key = `${msg.id}:${i}`
        if (processedPartsRef.current.has(key)) continue
        const out = part.output
        if (!out || typeof out !== 'object') continue
        const o = out as Record<string, unknown>
        if (!('success' in o) || o.success !== true) continue

        if (toolName === 'updateDraft' && 'patch' in o && o.patch && typeof o.patch === 'object') {
          dispatch({ type: 'APPLY_AI_PATCH', patch: o.patch as Partial<TemplateDraft> })
          processedPartsRef.current.add(key)
        } else if (toolName === 'suggestCategory' && 'category' in o) {
          dispatch({
            type: 'APPLY_AI_PATCH',
            patch: { category: o.category as TemplateDraft['category'] },
          })
          processedPartsRef.current.add(key)
        } else if (toolName === 'suggestLanguage' && 'language' in o) {
          dispatch({
            type: 'APPLY_AI_PATCH',
            patch: { language: o.language as TemplateDraft['language'] },
          })
          processedPartsRef.current.add(key)
        }
      }
    }
  }, [messages, dispatch])

  // Reset processed set cuando cambia sesion (nueva conversacion)
  useEffect(() => {
    if (sessionId === null) {
      processedPartsRef.current = new Set()
    }
  }, [sessionId])

  // Upload de imagen directo desde el chat
  async function handleChatImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const MAX_BYTES = 5 * 1024 * 1024
    if (file.size > MAX_BYTES) {
      toast.error(`Archivo muy grande: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximo 5 MB.`)
      return
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Solo se aceptan imagenes JPG o PNG')
      return
    }

    // Preview inmediato + headerFormat=IMAGE
    if (draft.headerImageLocalUrl) {
      URL.revokeObjectURL(draft.headerImageLocalUrl)
    }
    const localUrl = URL.createObjectURL(file)
    dispatch({ type: 'UPDATE_FIELD', field: 'headerFormat', value: 'IMAGE' })
    dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: localUrl })
    dispatch({ type: 'UPDATE_FIELD', field: 'headerImageStoragePath', value: null })

    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/config-builder/templates/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        toast.error(err.error || 'Error subiendo imagen')
        URL.revokeObjectURL(localUrl)
        dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
        return
      }
      const data = (await res.json()) as { storagePath: string }
      dispatch({
        type: 'UPDATE_FIELD',
        field: 'headerImageStoragePath',
        value: data.storagePath,
      })
      toast.success('Imagen lista. Ya aparece en el preview del template.')
      // Avisar a la IA para que siga el flujo sabiendo que hay imagen
      sendMessage({
        text: `[Subi una imagen para el header del template. Ya esta lista en storage: ${data.storagePath}. Continua con el flujo normal considerando que el header.format es IMAGE.]`,
      })
    } catch (err) {
      toast.error(`Error inesperado: ${err instanceof Error ? err.message : 'unknown'}`)
      URL.revokeObjectURL(localUrl)
      dispatch({ type: 'UPDATE_FIELD', field: 'headerImageLocalUrl', value: null })
    } finally {
      setUploadingImage(false)
    }
  }

  // Reset messages cuando se inicia nueva sesion
  useEffect(() => {
    if (sessionId === null) {
      setMessages([])
    }
  }, [sessionId, setMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

  const router = useRouter()

  // Chips: derivación pura desde draft + messages (D-01). useMemo, no side-effects.
  // Fuente ÚNICA (Pitfall 5): cero useState para chips, cero dispatches nuevos.
  const mergedChips = useMemo(() => {
    const { chips: deterministic } = deriveStage(draft, messages)
    const ai = extractAiActions(messages)
    return mergeChips(deterministic, ai, 4)
  }, [draft, messages])

  // Click handler híbrido (D-04 mensaje / D-05 acciones locales) con doble guard D-06.
  // Recibe SuggestedChip (super-tipo estructural de Chip) para que el callback sea
  // asignable al prop onChipClick del componente presentacional portable.
  const handleChipClick = useCallback(
    (chip: SuggestedChip) => {
      if (isLoading) return // D-06: no-op mientras el turno corre
      if (chip.action === 'upload-image') {
        fileInputRef.current?.click() // el onChange existente hace todo (validación/upload/aviso)
        return
      }
      if (chip.action === 'navigate-templates') {
        router.push('/configuracion/whatsapp/templates')
        return
      }
      if (chip.action === 'new-session') {
        onNewSession()
        return
      }
      if (chip.message.trim()) {
        sendMessage({ text: chip.message }) // D-04: burbuja visible del usuario
      }
    },
    [isLoading, router, onNewSession, sendMessage]
  )

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return
      sendMessage({ text: text.trim() })
    },
    [sendMessage, isLoading]
  )

  // Callback para que ChatMessage dispatche patches al draft context
  const handleDraftPatch = useCallback(
    (patch: Parameters<typeof dispatch>[0]) => {
      dispatch(patch)
    },
    [dispatch]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            <div className="rounded-full bg-muted p-4">
              <Sparkles className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="max-w-md space-y-2">
              <h2 className="text-lg font-semibold">Template Builder con IA</h2>
              <p className="text-sm text-muted-foreground">
                Describe el template que quieres crear. Por ejemplo:
                &ldquo;Un mensaje para confirmar pedidos que diga hola, tu pedido
                llega manana&rdquo;.
              </p>
            </div>
            {/* Starter-chips D-08/D-09: el click envía el prompt pre-armado */}
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              <SuggestedActionChips chips={STARTER_CHIPS} disabled={isLoading} onChipClick={handleChipClick} />
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message: UIMessage) => (
              <ChatMessage
                key={message.id}
                message={message}
                onDraftPatch={handleDraftPatch}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Chips de acción sugerida (D-06: solo con turno terminado) */}
      {status === 'ready' && messages.length > 0 && mergedChips.length > 0 && (
        <div className="px-4 pb-1">
          <div className="max-w-3xl mx-auto">
            <SuggestedActionChips chips={mergedChips} onChipClick={handleChipClick} />
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-4 pb-2">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-2 text-sm text-destructive">
            Error: {error.message}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t bg-background px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-start gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingImage || isLoading}
              className="h-9 w-9 shrink-0 rounded-lg border bg-background flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Subir imagen para header (JPG/PNG, max 5 MB)"
            >
              {uploadingImage ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <ImagePlus className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleChatImageUpload}
              className="hidden"
            />
            <div className="flex-1 min-w-0">
              <BuilderInput
                ref={inputRef}
                onSubmit={handleSubmit}
                isLoading={isLoading}
              />
            </div>
          </div>
          {draft.headerImageLocalUrl && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.headerImageLocalUrl}
                alt="Imagen adjunta"
                className="h-8 w-8 rounded object-cover border"
              />
              <span>
                Imagen adjunta{' '}
                {draft.headerImageStoragePath ? '(lista)' : '(subiendo...)'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
