'use client'

// ============================================================================
// Phase 19: AI Automation Builder - Builder Chat
// Chat container using AI SDK v6 useChat hook with DefaultChatTransport.
// Renders messages, handles streaming, auto-scrolls, and shows errors.
// Wires confirm/modify callbacks for the preview-confirm-create flow.
// ============================================================================

import { useRef, useEffect, useCallback, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
import type { AutomationPreviewData } from '@/lib/builder/types'
import { BuilderMessage } from './builder-message'
import { BuilderInput } from './builder-input'
import { Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardV2 } from '@/components/layout/dashboard-v2-context'

interface BuilderChatProps {
  sessionId: string | null
  onSessionCreated: (id: string) => void
  initialMessages?: UIMessage[]
}

export function BuilderChat({ sessionId, onSessionCreated, initialMessages }: BuilderChatProps) {
  const v2 = useDashboardV2()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef(sessionId)

  // Keep ref in sync for use in fetch wrapper
  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  // Custom transport with fetch wrapper to capture X-Session-Id header
  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/builder/chat',
        body: () => ({
          sessionId: sessionIdRef.current,
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init)

          // Extract session ID from response header on first message
          const newSessionId = response.headers.get('X-Session-Id')
          if (newSessionId && !sessionIdRef.current) {
            onSessionCreated(newSessionId)
          }

          return response
        },
      })
  )

  const {
    messages,
    sendMessage,
    status,
    error,
    setMessages,
  } = useChat({ transport, messages: initialMessages })

  // Auto-scroll to bottom when messages change or status changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  // Reset messages when starting a new session (sessionId becomes null)
  useEffect(() => {
    if (sessionId === null) {
      setMessages([])
    }
  }, [sessionId, setMessages])

  const isLoading = status === 'submitted' || status === 'streaming'

  // Handle form submission
  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) return
      sendMessage({ text: text.trim() })
    },
    [sendMessage, isLoading]
  )

  // Handle preview confirmation — sends a message that the agent will see
  const handleConfirmPreview = useCallback(
    (_previewData: AutomationPreviewData) => {
      sendMessage({ text: 'Confirmo. Crea la automatizacion.' })
    },
    [sendMessage]
  )

  // Handle modify request — focuses the input for the user to describe changes
  const handleModifyRequest = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <div className={cn('flex flex-col h-full', v2 && 'bg-[var(--paper-1)]')}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
            {v2 ? (
              <>
                <div className="flex h-14 w-14 items-center justify-center bg-[var(--paper-0)] border border-[var(--ink-1)] shadow-[0_1px_0_var(--ink-1)]">
                  <Bot className="h-6 w-6 text-[var(--rubric-2)]" />
                </div>
                <div className="max-w-md space-y-2">
                  <span
                    className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--rubric-2)]"
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    Builder · IA
                  </span>
                  <h2
                    className="text-[22px] font-semibold tracking-[-0.015em] text-[var(--ink-1)]"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    AI Automation Builder
                  </h2>
                  <p
                    className="text-[13px] italic text-[var(--ink-3)] leading-snug"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    Describe la automatización que quieres crear. Por ejemplo:
                    «Cuando un pedido llegue a la etapa Confirmado, asigna el
                    tag VIP al contacto».
                  </p>
                  <p className="mx-rule-ornament">· · ·</p>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-full bg-muted p-4">
                  <Bot className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="max-w-md space-y-2">
                  <h2 className="text-lg font-semibold">AI Automation Builder</h2>
                  <p className="text-sm text-muted-foreground">
                    Describe la automatizacion que quieres crear. Por ejemplo:
                    &ldquo;Cuando un pedido llegue a la etapa Confirmado, asigna el
                    tag VIP al contacto&rdquo;
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message: UIMessage) => (
              <BuilderMessage
                key={message.id}
                message={message}
                onConfirmPreview={handleConfirmPreview}
                onModifyRequest={handleModifyRequest}
              />
            ))}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="px-4 pb-2">
          <div
            className={cn(
              'px-4 py-2',
              v2
                ? 'bg-[color-mix(in_oklch,var(--rubric-2)_8%,var(--paper-0))] border border-[var(--rubric-2)] text-[11px] text-[var(--rubric-2)]'
                : 'rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive'
            )}
            style={v2 ? { fontFamily: 'var(--font-sans)' } : undefined}
          >
            Error: {error.message}
          </div>
        </div>
      )}

      {/* Input area */}
      <div
        className={cn(
          'px-4 py-3 shrink-0',
          v2 ? 'border-t border-[var(--ink-1)] bg-[var(--paper-1)]' : 'border-t bg-background'
        )}
      >
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
