'use client'

/**
 * AuditorTab — Plan 04 (agent-forensics-panel) Task 4.
 *
 * Tab que orquesta el auditor AI contra `/api/agent-forensics/audit`:
 * - Boton "Auditar sesion" (D-03 manual invocation).
 * - useChat + DefaultChatTransport (AI SDK v6) — streaming SSE.
 * - ReactMarkdown + remarkGfm renderiza el diagnostico (D-09 markdown).
 * - Boton "Copiar al portapapeles" con sonner toast (pegable a Claude Code — D-13).
 *
 * Pitfall 4 mitigado: react-markdown sin rehype-raw ni dangerouslySetInnerHTML
 * (safe-by-default contra XSS via HTML tags en el output del LLM).
 */

import { useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { toast } from 'sonner'
import { Copy, Play, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
  // Transport — memoized per turn so navigation between turns resets state.
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/agent-forensics/audit',
        body: () => ({ turnId, startedAt, respondingAgentId, conversationId }),
      }),
    [turnId, startedAt, respondingAgentId, conversationId],
  )

  const { messages, sendMessage, status, error } = useChat({ transport })

  const isStreaming = status === 'streaming' || status === 'submitted'

  const runAudit = () => {
    if (isStreaming) return
    // Server ignores the text — real context comes from the body override.
    sendMessage({ text: 'Auditar' })
  }

  // Extract assistant markdown by concatenating all text parts.
  // AI SDK v6 UIMessage.parts = { type: 'text', text: string } | ...
  const assistantText = messages
    .filter((m) => m.role === 'assistant')
    .flatMap((m) =>
      (m.parts ?? [])
        .filter((p) => p.type === 'text')
        .map((p: any) => p.text as string),
    )
    .join('\n')

  const copyToClipboard = async () => {
    if (!assistantText) return
    try {
      await navigator.clipboard.writeText(assistantText)
      toast.success('Diagnostico copiado al portapapeles — pegar en Claude Code')
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header — action bar */}
      <div className="px-3 py-2 border-b flex-shrink-0 flex items-center gap-2">
        <Button
          size="sm"
          onClick={runAudit}
          disabled={isStreaming}
          className="h-7"
        >
          {isStreaming ? (
            <>
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              Auditando…
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 mr-1.5" />
              Auditar sesion
            </>
          )}
        </Button>

        {assistantText.length > 0 && !isStreaming && (
          <Button
            size="sm"
            variant="outline"
            onClick={copyToClipboard}
            className="h-7"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            Copiar al portapapeles
          </Button>
        )}

        {assistantText.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            {assistantText.length} chars
          </span>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="px-3 py-2 flex-shrink-0">
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            Error: {error.message}
          </div>
        </div>
      )}

      {/* Output */}
      <div className="flex-1 overflow-y-auto">
        {assistantText.length === 0 && !isStreaming && !error ? (
          <div className="h-full flex items-center justify-center p-4">
            <div className="text-xs text-muted-foreground italic text-center max-w-sm">
              Click &quot;Auditar sesion&quot; para que Claude Sonnet 4.6 analice este turn contra la spec del bot.
              El output es markdown pegable a Claude Code.
            </div>
          </div>
        ) : (
          <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{assistantText}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}
