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
 *
 * Plan 05 EXTENSION (history dropdown):
 *  - Lista de audits previos para el turn actual (dropdown en header).
 *  - Auto-restore del audit MAS RECIENTE al cambiar de turn (UX: no perder
 *    contexto al refrescar). Bloqueado por flag autoRestoredRef tras click
 *    "Nuevo audit" para no re-cargarlo despues de un reset explicito.
 *  - Boton "Nuevo audit" que limpia el state y permite empezar fresh.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { toast } from 'sonner'
import {
  Copy,
  Play,
  Loader2,
  Send,
  History,
  Plus,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AuditMessage } from './audit-message'
import { HypothesisInput } from './hypothesis-input'
import {
  listAuditSessionsAction,
  loadAuditSessionAction,
} from '@/app/actions/observability'

interface AuditSessionSummaryUI {
  id: string
  hypothesis: string | null
  messageCount: number
  costUsd: number
  totalTurnsInContext: number
  trimmedCount: number
  createdAt: string
  updatedAt: string
}

function formatRelativeBogota(iso: string): string {
  try {
    const ts = new Date(iso).getTime()
    if (!Number.isFinite(ts)) return iso
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000))
    if (diffSec < 60) return `hace ${diffSec}s`
    if (diffSec < 3600) return `hace ${Math.round(diffSec / 60)}m`
    if (diffSec < 86_400) return `hace ${Math.round(diffSec / 3600)}h`
    if (diffSec < 86_400 * 7) return `hace ${Math.round(diffSec / 86_400)}d`
    return new Date(iso).toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
    })
  } catch {
    return iso
  }
}

function previewHypothesis(h: string | null): string {
  if (!h) return '(sin hipótesis)'
  const trimmed = h.trim()
  if (trimmed.length <= 50) return trimmed
  return `${trimmed.slice(0, 50)}…`
}

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

  // Plan 05 EXTENSION — history dropdown state
  const [previousAudits, setPreviousAudits] = useState<AuditSessionSummaryUI[]>(
    [],
  )
  const [previousAuditsLoading, setPreviousAuditsLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  // Tracks whether the auto-restore-most-recent effect has run for the
  // current turnId. Reset on turnId change OR on "Nuevo audit" click so:
  //   - changing turn re-arms auto-restore for that new turn
  //   - clicking "Nuevo audit" disables auto-restore for the rest of this
  //     mount of the current turn (until the user navigates away & back)
  const autoRestoredRef = useRef(false)

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
    // Re-arm auto-restore for the new turn — every fresh turnId gets one
    // shot at auto-loading its most-recent audit.
    autoRestoredRef.current = false
    setPreviousAudits([])
  }, [turnId, setMessages])

  // Plan 05 EXTENSION — load history list when turn changes.
  useEffect(() => {
    let cancelled = false
    setPreviousAuditsLoading(true)
    listAuditSessionsAction(turnId)
      .then((data) => {
        if (cancelled) return
        setPreviousAudits(data)
      })
      .catch(() => {
        if (cancelled) return
        setPreviousAudits([])
      })
      .finally(() => {
        if (cancelled) return
        setPreviousAuditsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [turnId])

  // Plan 05 EXTENSION — auto-restore the most recent audit ONCE per turn,
  // unless the user clicked "Nuevo audit" (which sets autoRestoredRef.current
  // = true to skip this effect for the rest of the current turn mount).
  useEffect(() => {
    if (autoRestoredRef.current) return
    if (previousAuditsLoading) return
    if (previousAudits.length === 0) return
    if (messages.length > 0) return // user is mid-audit — don't clobber
    if (isStreaming) return
    autoRestoredRef.current = true
    const mostRecent = previousAudits[0]
    setRestoring(true)
    loadAuditSessionAction(mostRecent.id)
      .then((full) => {
        if (!full) {
          toast.error('Audit no disponible (posiblemente purgado)')
          return
        }
        setMessages(full.messages as UIMessage[])
        setAuditSessionId(full.id)
        setHypothesis(full.hypothesis ?? '')
        setTrimmedWarning(
          full.trimmedCount > 0
            ? `Sesión grande — mostrando últimos ${full.totalTurnsInContext} de ${full.totalTurnsInContext + full.trimmedCount} turns previos al auditado`
            : null,
        )
      })
      .catch(() => {
        toast.error('No se pudo restaurar el audit previo')
      })
      .finally(() => setRestoring(false))
  }, [
    previousAudits,
    previousAuditsLoading,
    messages.length,
    isStreaming,
    setMessages,
  ])

  /**
   * Plan 05 EXTENSION — handler invoked when user clicks an item in the
   * history dropdown. Loads the full audit and overwrites the current state
   * (hypothesis, messages, auditSessionId, trimmedWarning).
   */
  const restoreAuditById = async (id: string) => {
    if (isStreaming) return
    setRestoring(true)
    try {
      const full = await loadAuditSessionAction(id)
      if (!full) {
        toast.error('Audit no disponible (posiblemente purgado)')
        // Drop it from the list so the user does not click it again
        setPreviousAudits((prev) => prev.filter((a) => a.id !== id))
        return
      }
      setMessages(full.messages as UIMessage[])
      setAuditSessionId(full.id)
      setHypothesis(full.hypothesis ?? '')
      setTrimmedWarning(
        full.trimmedCount > 0
          ? `Sesión grande — mostrando últimos ${full.totalTurnsInContext} de ${full.totalTurnsInContext + full.trimmedCount} turns previos al auditado`
          : null,
      )
      // Mark auto-restore as already-done so we don't fight a manual choice.
      autoRestoredRef.current = true
    } catch {
      toast.error('No se pudo cargar el audit')
    } finally {
      setRestoring(false)
    }
  }

  /**
   * Plan 05 EXTENSION — "Nuevo audit" button: full reset to a clean
   * HypothesisInput. Disables auto-restore for the remainder of this turn
   * mount (autoRestoredRef.current = true) so the user is not surprised by
   * the most-recent audit reappearing.
   */
  const startNewAudit = () => {
    if (isStreaming) return
    setMessages([])
    setHypothesis('')
    setAuditSessionId(null)
    setTrimmedWarning(null)
    setFollowUpInput('')
    autoRestoredRef.current = true
  }

  /**
   * Plan 05 EXTENSION — refresh the dropdown list AFTER a new audit's
   * onFinish persists, so the user immediately sees count "(N+1)". Triggered
   * when auditSessionId transitions from null → string AND status drops out
   * of streaming (i.e. the round finished).
   */
  useEffect(() => {
    if (!auditSessionId) return
    if (isStreaming) return
    // Cheap re-fetch of the metadata projection. Idempotent — adds the new
    // audit if it wasn't there yet, or refreshes message_count for follow-ups.
    listAuditSessionsAction(turnId)
      .then((data) => setPreviousAudits(data))
      .catch(() => {
        /* ignore: the dropdown is best-effort */
      })
  }, [auditSessionId, isStreaming, turnId])

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

  // Plan 05 EXTENSION — dropdown trigger label.
  const previousAuditsCount = previousAudits.length
  const showHistoryDropdown = previousAuditsCount > 0

  return (
    <div className="h-full flex flex-col min-h-0 min-w-0 overflow-hidden">
      {/* Plan 05 EXTENSION — history dropdown + "Nuevo audit" bar (always
          visible when there is at least one previous audit). Renders ABOVE
          the hypothesis input (no-messages mode) and the action bar (post-
          audit mode) so it is always reachable. */}
      {showHistoryDropdown && (
        <div className="px-3 py-1.5 border-b flex-shrink-0 flex items-center gap-2 bg-muted/30">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={restoring || isStreaming}
              >
                <History className="w-3.5 h-3.5 mr-1.5" />
                Audits previos ({previousAuditsCount})
                <ChevronDown className="w-3 h-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[360px]">
              <DropdownMenuLabel className="text-xs">
                Audits guardados para este turn
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {previousAudits.map((a) => {
                const isCurrent = a.id === auditSessionId
                return (
                  <DropdownMenuItem
                    key={a.id}
                    onSelect={() => restoreAuditById(a.id)}
                    disabled={isStreaming}
                    className="flex flex-col items-start gap-0.5 py-2"
                  >
                    <div className="flex items-center justify-between w-full text-xs">
                      <span className="font-medium truncate max-w-[200px]">
                        {previewHypothesis(a.hypothesis)}
                      </span>
                      <span className="text-muted-foreground font-mono ml-2">
                        {formatRelativeBogota(a.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                      <span>
                        {a.messageCount} msg
                        {a.messageCount === 1 ? '' : 's'}
                      </span>
                      <span>·</span>
                      <span>${a.costUsd.toFixed(4)}</span>
                      {a.trimmedCount > 0 && (
                        <>
                          <span>·</span>
                          <span className="text-amber-600">
                            trimmed {a.trimmedCount}
                          </span>
                        </>
                      )}
                      {isCurrent && (
                        <>
                          <span>·</span>
                          <span className="text-primary">cargado</span>
                        </>
                      )}
                    </div>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>

          {hasMessages && (
            <Button
              size="sm"
              variant="outline"
              onClick={startNewAudit}
              disabled={isStreaming || restoring}
              className="h-7 text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Nuevo audit
            </Button>
          )}

          {restoring && (
            <span className="text-[11px] text-muted-foreground italic">
              <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
              Cargando audit…
            </span>
          )}
        </div>
      )}

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
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 px-3 py-3">
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
