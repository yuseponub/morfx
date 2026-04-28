'use client'

/**
 * AuditorTab v2 — Plan 05 (agent-forensics-panel).
 *
 * Extiende Plan 04:
 *  - HypothesisInput pre-audit (D-16, opcional, max 2000 chars).
 *  - Chat continuo: tras primer audit, input "Pregunta de seguimiento"
 *    permite refinar (D-16, RESEARCH §6).
 *  - Reset completo al cambiar turnId (Pitfall 9).
 *  - Capture headers X-Audit-Session-Id (lift to body next request) + X-Forensics-Trimmed (warning UI).
 *  - Disable input durante streaming (Pitfall 11).
 *  - Persistencia transparente (server-side via Plan 05 Task 9).
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { toast } from 'sonner'
import { Copy, Play, Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuditMessage } from './audit-message'
import { HypothesisInput } from './hypothesis-input'

interface Props {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}

export function AuditorTab({
  turnId,
  startedAt,
  respondingAgentId,
  conversationId,
}: Props) {
  const [hypothesis, setHypothesis] = useState('')
  const [auditSessionId, setAuditSessionId] = useState<string | null>(null)
  const [trimmedWarning, setTrimmedWarning] = useState<string | null>(null)
  const [followUpInput, setFollowUpInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Refs for fetch wrapper to read latest values without re-creating transport
  const auditSessionIdRef = useRef(auditSessionId)
  const hypothesisRef = useRef(hypothesis)
  useEffect(() => {
    auditSessionIdRef.current = auditSessionId
  }, [auditSessionId])
  useEffect(() => {
    hypothesisRef.current = hypothesis
  }, [hypothesis])

  // Transport — memoized per turn so navigation between turns resets state.
  // Pitfall 9: deps minimos y estables (turnId + identifying string fields, no callbacks).
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent-forensics/audit',
        body: () => ({
          turnId,
          startedAt,
          respondingAgentId,
          conversationId,
          hypothesis:
            auditSessionIdRef.current === null
              ? hypothesisRef.current.trim() || null
              : null, // hypothesis only on first round
          auditSessionId: auditSessionIdRef.current,
        }),
        fetch: async (input, init) => {
          const response = await fetch(input, init)
          const newSessionId = response.headers.get('X-Audit-Session-Id')
          if (newSessionId && !auditSessionIdRef.current) {
            setAuditSessionId(newSessionId)
          }
          const trimmedHeader = response.headers.get('X-Forensics-Trimmed')
          if (trimmedHeader) {
            const [kept, total] = trimmedHeader.split('/')
            setTrimmedWarning(
              `Sesión grande — mostrando últimos ${kept} de ${total} turns previos al auditado`,
            )
          } else {
            setTrimmedWarning(null)
          }
          return response
        },
      }),
    [turnId, startedAt, respondingAgentId, conversationId],
  )

  const { messages, sendMessage, setMessages, status, error } = useChat({
    transport,
  })
  const isStreaming = status === 'streaming' || status === 'submitted'

  // Reset al cambiar turn (Pitfall 9 mitigation + RESEARCH §6)
  useEffect(() => {
    setMessages([])
    setHypothesis('')
    setAuditSessionId(null)
    setTrimmedWarning(null)
    setFollowUpInput('')
  }, [turnId, setMessages])

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  const runAudit = () => {
    if (isStreaming) return
    const text = hypothesis.trim() || 'Auditar'
    sendMessage({ text })
  }

  const sendFollowUp = () => {
    if (isStreaming || !followUpInput.trim()) return
    sendMessage({ text: followUpInput.trim() })
    setFollowUpInput('')
  }

  const lastAssistantText = messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) =>
      (m.parts ?? [])
        .filter((p) => p.type === 'text')
        .map((p: any) => p.text as string),
    )
    .join('\n')

  const copyToClipboard = async () => {
    if (!lastAssistantText) return
    try {
      await navigator.clipboard.writeText(lastAssistantText)
      toast.success('Diagnóstico copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  // Extract per-message text for rendering
  const messagesForRender: Array<{
    id: string
    role: 'user' | 'assistant'
    text: string
  }> = messages
    .map((m) => {
      const text = (m.parts ?? [])
        .filter((p) => p.type === 'text')
        .map((p: any) => p.text as string)
        .join('\n')
      return { id: m.id, role: m.role as 'user' | 'assistant', text }
    })
    .filter((m) => m.text.length > 0)

  const hasMessages = messagesForRender.length > 0

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Top section: hypothesis + audit button (only when no messages yet) */}
      {!hasMessages && (
        <div className="px-3 py-3 border-b flex-shrink-0 space-y-2">
          <HypothesisInput
            value={hypothesis}
            onChange={setHypothesis}
            disabled={isStreaming}
          />
          <Button
            size="sm"
            onClick={runAudit}
            disabled={isStreaming}
            className="w-full h-8"
          >
            {isStreaming ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />{' '}
                Auditando…
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 mr-1.5" /> Auditar sesión
              </>
            )}
          </Button>
        </div>
      )}

      {/* Action bar (only after first audit) */}
      {hasMessages && (
        <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2">
          {lastAssistantText.length > 0 && !isStreaming && (
            <Button
              size="sm"
              variant="outline"
              onClick={copyToClipboard}
              className="h-7"
            >
              <Copy className="w-3.5 h-3.5 mr-1.5" />
              Copiar último
            </Button>
          )}
          {isStreaming && (
            <span className="text-xs text-muted-foreground italic">
              <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
              Analizando…
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {messagesForRender.length} mensaje
            {messagesForRender.length === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {/* Trimmed warning */}
      {trimmedWarning && (
        <div className="px-3 py-1 flex-shrink-0 text-[11px] text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-b">
          ⚠ {trimmedWarning}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 flex-shrink-0">
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            Error: {error.message}
          </div>
        </div>
      )}

      {/* Messages list (scrollable) */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {!hasMessages && !isStreaming && !error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-xs text-muted-foreground italic text-center max-w-sm">
              Escribe una hipótesis (opcional) y click &quot;Auditar
              sesión&quot; para que Claude Sonnet 4.6 analice este turn + los
              turns previos contra la spec del bot.
            </div>
          </div>
        )}
        {messagesForRender.map((m, idx) => (
          <AuditMessage
            key={m.id}
            role={m.role}
            text={m.text}
            isStreaming={
              isStreaming &&
              idx === messagesForRender.length - 1 &&
              m.role === 'assistant'
            }
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Follow-up input (only after first audit completes) */}
      {hasMessages && (
        <div className="border-t bg-background px-3 py-2 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendFollowUp()
                }
              }}
              placeholder="Pregunta de seguimiento (Enter para enviar)…"
              disabled={isStreaming}
              rows={1}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              style={{ minHeight: '36px', maxHeight: '96px' }}
            />
            <Button
              size="sm"
              onClick={sendFollowUp}
              disabled={isStreaming || !followUpInput.trim()}
              className="h-9 w-9 p-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
