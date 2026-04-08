'use client'

/**
 * Expanded renderer for a single AI call row in the turn timeline.
 *
 * Shows:
 *  - Metadata header: purpose, model, temperature, maxTokens, prompt hash
 *    (short + tooltip with the full hash and firstSeenAt of the prompt
 *    version — useful to confirm "this is the same prompt I was using
 *    yesterday" without diffing text).
 *  - Token breakdown: input / output / cache_creation / cache_read / total
 *  - Cost in USD
 *  - Collapsible sub-sections:
 *      - "System Prompt" — monospace block with the full text from the
 *        dereferenced `agent_prompt_versions` row. May be absent if the
 *        prompt version was deleted / not fetchable.
 *      - "Messages" — JSON view of the `messages` array sent to Claude
 *      - "Response" — JSON view of the response content blocks
 *
 * The sub-sections default to collapsed because prompts can be very long
 * (10k+ tokens); the user opts in per row.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
import type { TurnDetail } from '@/lib/observability/repository'

interface Props {
  call: TurnDetail['aiCalls'][number]
  promptVersion: TurnDetail['promptVersionsById'][string] | undefined
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-xs font-medium hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span>{title}</span>
      </button>
      {open && <div className="border-t p-2">{children}</div>}
    </div>
  )
}

export function AiCallView({ call, promptVersion }: Props) {
  const { resolvedTheme } = useTheme()
  const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme

  const shortHash = promptVersion?.promptHash
    ? promptVersion.promptHash.slice(0, 8)
    : '—'
  const hashTooltip = promptVersion
    ? `hash: ${promptVersion.promptHash}\nfirstSeenAt: ${promptVersion.firstSeenAt}`
    : 'prompt version no encontrada'

  return (
    <div className="space-y-3 text-xs">
      {/* Header: purpose + model + prompt version */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <div>
          <span className="text-muted-foreground">Purpose: </span>
          <span className="font-mono">{call.purpose}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Model: </span>
          <span className="font-mono">{call.model}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Temp: </span>
          <span className="font-mono">
            {promptVersion?.temperature ?? '—'}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Max tokens: </span>
          <span className="font-mono">{promptVersion?.maxTokens ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Prompt: </span>
          <span className="font-mono" title={hashTooltip}>
            {shortHash}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Status: </span>
          <span
            className={`font-mono ${
              call.statusCode >= 400 ? 'text-destructive' : ''
            }`}
          >
            {call.statusCode}
          </span>
        </div>
      </div>

      {/* Tokens + cost */}
      <div className="flex flex-wrap gap-3 text-xs bg-muted/30 rounded p-2">
        <span>
          <span className="text-muted-foreground">in: </span>
          <span className="font-mono">{call.inputTokens}</span>
        </span>
        <span>
          <span className="text-muted-foreground">out: </span>
          <span className="font-mono">{call.outputTokens}</span>
        </span>
        <span>
          <span className="text-muted-foreground">cache+: </span>
          <span className="font-mono">{call.cacheCreationInputTokens}</span>
        </span>
        <span>
          <span className="text-muted-foreground">cache-read: </span>
          <span className="font-mono">{call.cacheReadInputTokens}</span>
        </span>
        <span>
          <span className="text-muted-foreground">total: </span>
          <span className="font-mono">{call.totalTokens}</span>
        </span>
        <span>
          <span className="text-muted-foreground">cost: </span>
          <span className="font-mono">${call.costUsd.toFixed(6)}</span>
        </span>
        <span>
          <span className="text-muted-foreground">lat: </span>
          <span className="font-mono">{call.durationMs}ms</span>
        </span>
      </div>

      {call.error && (
        <div className="p-2 bg-destructive/10 text-destructive rounded">
          {call.error}
        </div>
      )}

      {/* System prompt */}
      <Collapsible title="System Prompt">
        {promptVersion ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-snug max-h-[400px] overflow-y-auto">
            {promptVersion.systemPrompt}
          </pre>
        ) : (
          <p className="text-muted-foreground italic">
            Prompt version no encontrada (id: {call.promptVersionId}).
          </p>
        )}
      </Collapsible>

      {/* Messages */}
      <Collapsible title="Messages">
        {call.messages != null ? (
          <JsonView
            value={call.messages as object}
            collapsed={1}
            style={jsonStyle}
            displayDataTypes={false}
            enableClipboard
          />
        ) : (
          <p className="text-muted-foreground italic">Sin mensajes.</p>
        )}
      </Collapsible>

      {/* Response */}
      <Collapsible title="Response">
        {call.responseContent != null ? (
          <JsonView
            value={call.responseContent as object}
            collapsed={1}
            style={jsonStyle}
            displayDataTypes={false}
            enableClipboard
          />
        ) : (
          <p className="text-muted-foreground italic">Sin respuesta.</p>
        )}
      </Collapsible>
    </div>
  )
}
