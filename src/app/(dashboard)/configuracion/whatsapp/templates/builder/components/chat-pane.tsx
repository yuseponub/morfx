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

import { useRef, useEffect, useCallback, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import { useTemplateDraft } from './template-draft-context'
import { ChatMessage } from './chat-message'
import { BuilderInput } from '@/app/(dashboard)/automatizaciones/builder/components/builder-input'
import { Sparkles } from 'lucide-react'

interface ChatPaneProps {
  sessionId: string | null
  onSessionCreated: (id: string) => void
  initialMessages?: UIMessage[]
}

export function ChatPane({ sessionId, onSessionCreated, initialMessages }: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef(sessionId)

  // Keep ref in sync para el fetch wrapper
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const { dispatch } = useTemplateDraft()

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

  // Reset messages cuando se inicia nueva sesion
  useEffect(() => {
    if (sessionId === null) {
      setMessages([])
    }
  }, [sessionId, setMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

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
          <BuilderInput
            ref={inputRef}
            onSubmit={handleSubmit}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  )
}
