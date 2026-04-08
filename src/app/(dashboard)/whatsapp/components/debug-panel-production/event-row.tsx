'use client'

/**
 * Single row in the unified turn timeline. Renders one of three kinds —
 * event (EVT), query (SQL), or ai call (AI) — with a compact collapsed
 * header and an expanded detail body chosen by discriminated union.
 *
 * The parent `TurnDetailView` merges events + queries + aiCalls into a
 * single array sorted by `sequence` and instantiates one EventRow per
 * item; the row owns its own expanded state so expanding multiple rows
 * at once is natural.
 *
 * Colored kind prefix is the primary visual anchor when scanning a long
 * timeline: cyan=event, amber=query, violet=ai. Duration + counts live
 * in muted-foreground on the right for low-priority glance info.
 */

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
import type { TurnDetail } from '@/lib/observability/repository'
import { AiCallView } from './ai-call-view'
import { QueryView } from './query-view'

export type TimelineItem =
  | { kind: 'event'; sequence: number; data: TurnDetail['events'][number] }
  | { kind: 'query'; sequence: number; data: TurnDetail['queries'][number] }
  | { kind: 'ai'; sequence: number; data: TurnDetail['aiCalls'][number] }

interface Props {
  item: TimelineItem
  promptVersionsById: TurnDetail['promptVersionsById']
}

export function EventRow({ item, promptVersionsById }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { resolvedTheme } = useTheme()
  const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme

  const header = (() => {
    if (item.kind === 'event') {
      return (
        <>
          <span className="font-mono font-semibold text-cyan-600 dark:text-cyan-400">
            EVT
          </span>
          <span className="ml-2">{item.data.category}</span>
          {item.data.label && (
            <span className="ml-1 text-muted-foreground">
              · {item.data.label}
            </span>
          )}
          {item.data.durationMs != null && (
            <span className="ml-auto text-muted-foreground font-mono">
              {item.data.durationMs}ms
            </span>
          )}
        </>
      )
    }
    if (item.kind === 'query') {
      return (
        <>
          <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
            SQL
          </span>
          <span className="ml-2 font-mono uppercase">
            {item.data.operation}
          </span>
          <span className="ml-1 font-mono">{item.data.tableName}</span>
          {item.data.error && (
            <span className="ml-2 text-destructive font-semibold">ERROR</span>
          )}
          <span className="ml-auto text-muted-foreground font-mono">
            {item.data.durationMs}ms · {item.data.rowCount ?? '—'}r ·{' '}
            {item.data.statusCode}
          </span>
        </>
      )
    }
    return (
      <>
        <span className="font-mono font-semibold text-violet-600 dark:text-violet-400">
          AI
        </span>
        <span className="ml-2">{item.data.purpose}</span>
        <span className="ml-1 text-muted-foreground font-mono">
          · {item.data.model}
        </span>
        {item.data.error && (
          <span className="ml-2 text-destructive font-semibold">ERROR</span>
        )}
        <span className="ml-auto text-muted-foreground font-mono">
          {item.data.durationMs}ms · {item.data.totalTokens}tok · $
          {item.data.costUsd.toFixed(4)}
        </span>
      </>
    )
  })()

  return (
    <div className="text-xs">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2"
      >
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="text-muted-foreground font-mono w-8 text-right flex-shrink-0">
          {item.sequence}
        </span>
        <span className="flex-1 flex items-center min-w-0 truncate">
          {header}
        </span>
      </button>
      {expanded && (
        <div className="bg-muted/20 px-3 py-3 border-l-2 border-primary/30">
          {item.kind === 'event' && (
            <JsonView
              value={(item.data.payload as object) ?? {}}
              collapsed={2}
              style={jsonStyle}
              displayDataTypes={false}
              enableClipboard
            />
          )}
          {item.kind === 'query' && <QueryView query={item.data} />}
          {item.kind === 'ai' && (
            <AiCallView
              call={item.data}
              promptVersion={promptVersionsById[item.data.promptVersionId]}
            />
          )}
        </div>
      )}
    </div>
  )
}
