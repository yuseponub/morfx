'use client'

/**
 * Detail pane of the production debug panel: full timeline of a single
 * turn (events + queries + ai_calls + dereferenced prompt versions).
 *
 * Data flow:
 *   - One-shot fetch via `getTurnDetailAction(turnId, startedAt)` whenever
 *     `turnId` changes. NO auto-refresh, NO polling, NO revalidation.
 *     Turns are immutable after the collector flushes them at the end of
 *     the turn (Pitfall 7 of 42.1-RESEARCH.md: any post-flush write would
 *     corrupt the observability invariant).
 *
 *   - Uses the same hand-rolled fetch pattern as `turn-list.tsx` with
 *     `mountedRef` to avoid setState-after-unmount warnings when the
 *     user switches turns rapidly. NOT using SWR — the repo has no SWR
 *     dependency and Phase 42.1 aims for zero new deps.
 *
 * Rendering:
 *   - Header: agent id · trigger kind · duration · tokens · cost. If
 *     the turn has an error payload we render a red banner with name +
 *     message (stack hidden behind a toggle inside EventRow if any
 *     event carries it).
 *
 *   - Timeline: events + queries + aiCalls merged into a single array
 *     sorted by `sequence` (which is monotonic per-turn across the three
 *     tables — see Plan 04 collector). Each item is an expandable
 *     `EventRow`. The list is scrollable; the header stays pinned.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { getTurnDetailAction } from '@/app/actions/observability'
import type { TurnDetail } from '@/lib/observability/repository'
import { EventRow, type TimelineItem } from './event-row'

interface Props {
  turnId: string
  startedAt: string
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'data'; detail: TurnDetail }

export function TurnDetailView({ turnId, startedAt }: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    setView({ kind: 'loading' })

    let cancelled = false
    ;(async () => {
      try {
        const detail = await getTurnDetailAction(turnId, startedAt)
        if (cancelled || !mountedRef.current) return
        setView({ kind: 'data', detail })
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        setView({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    return () => {
      cancelled = true
      mountedRef.current = false
    }
  }, [turnId, startedAt])

  // Merge events + queries + aiCalls into a single timeline ordered by
  // `sequence`. Memoized on the raw arrays so re-renders from unrelated
  // parent state don't rebuild a 200+ item array.
  const timeline: TimelineItem[] = useMemo(() => {
    if (view.kind !== 'data') return []
    const d = view.detail
    const items: TimelineItem[] = [
      ...d.events.map(
        (e): TimelineItem => ({ kind: 'event', sequence: e.sequence, data: e }),
      ),
      ...d.queries.map(
        (q): TimelineItem => ({ kind: 'query', sequence: q.sequence, data: q }),
      ),
      ...d.aiCalls.map(
        (a): TimelineItem => ({ kind: 'ai', sequence: a.sequence, data: a }),
      ),
    ]
    items.sort((a, b) => a.sequence - b.sequence)
    return items
  }, [view])

  if (view.kind === 'loading') {
    return (
      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
        Cargando turno...
      </div>
    )
  }

  if (view.kind === 'error') {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-sm text-destructive">
          <p className="font-medium">Error al cargar turno</p>
          <p className="text-xs mt-1 break-words">{view.message}</p>
        </div>
      </div>
    )
  }

  const { turn, promptVersionsById } = view.detail

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b flex-shrink-0 space-y-1">
        <div className="text-sm font-medium">
          {turn.agentId}
          {turn.triggerKind && (
            <span className="ml-2 text-xs text-muted-foreground font-mono">
              · {turn.triggerKind}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground font-mono flex flex-wrap gap-x-3">
          <span>{turn.durationMs ?? '—'}ms</span>
          <span>{turn.totalTokens}tok</span>
          <span>${turn.totalCostUsd.toFixed(4)}</span>
          <span>{turn.eventCount}ev</span>
          <span>{turn.queryCount}q</span>
          <span>{turn.aiCallCount}ai</span>
        </div>
        {(turn.currentMode || turn.newMode) && (
          <div className="text-xs text-muted-foreground">
            mode:{' '}
            <span className="font-mono">{turn.currentMode ?? '—'}</span>
            {' → '}
            <span className="font-mono">{turn.newMode ?? '—'}</span>
          </div>
        )}
        {turn.error && (
          <div className="mt-2 p-2 bg-destructive/10 text-destructive rounded text-xs">
            <div className="font-medium">{turn.error.name}</div>
            <div className="break-words">{turn.error.message}</div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto divide-y">
        {timeline.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground italic">
            Turno vacio (sin events / queries / ai calls registrados).
          </div>
        ) : (
          timeline.map((item) => (
            <EventRow
              key={`${item.kind}-${item.data.id}`}
              item={item}
              promptVersionsById={promptVersionsById}
            />
          ))
        )}
      </div>
    </div>
  )
}
