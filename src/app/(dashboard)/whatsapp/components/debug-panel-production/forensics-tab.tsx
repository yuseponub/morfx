'use client'

/**
 * Forensics tab shell — header + condensed timeline + session snapshot
 * placeholder.
 *
 * Data flow:
 *   - One-shot fetch via `getForensicsViewAction(turnId, startedAt,
 *     respondingAgentId)` whenever the inputs change. Same hand-rolled
 *     fetch + `mountedRef` pattern as `turn-detail.tsx` (no SWR, no new
 *     deps — Phase 42.1 convention).
 *
 * UI:
 *   - Header shows `getDisplayAgentId(turn)` (responding agent wins over
 *     entry agent), plus the entry agent id in parens when they differ
 *     (captures the "entró a X → ruteó a Y → Y respondió" signal).
 *   - Counters: duration, tokens, cost, condensed item count, ERROR flag.
 *   - Scrollable body: <CondensedTimeline> followed by the
 *     <SessionSnapshot conversationId={conversationId} /> — full
 *     `session_state` JSON dump with no filtering (D-06).
 *
 * Introduced by standalone phase `agent-forensics-panel` Plan 02.
 * Snapshot wired in Plan 03 (replaces the original placeholder).
 */

import { useEffect, useRef, useState } from 'react'
import {
  getForensicsViewAction,
  type GetForensicsViewResult,
} from '@/app/actions/observability'
import { CondensedTimeline } from './condensed-timeline'
import { getDisplayAgentId } from './get-display-agent-id'
import { SessionSnapshot } from './session-snapshot'

interface Props {
  turnId: string
  startedAt: string
  respondingAgentId: string | null
  conversationId: string
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'disabled'; flagName: string }
  | { kind: 'data'; result: Extract<GetForensicsViewResult, { status: 'ok' }> }
  | { kind: 'error'; message: string }

export function ForensicsTab({
  turnId,
  startedAt,
  respondingAgentId,
  conversationId,
}: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    setView({ kind: 'loading' })
    let cancelled = false

    ;(async () => {
      try {
        const result = await getForensicsViewAction(
          turnId,
          startedAt,
          respondingAgentId,
        )
        if (cancelled || !mountedRef.current) return
        if (result.status === 'disabled') {
          setView({ kind: 'disabled', flagName: result.flagName })
        } else {
          setView({ kind: 'data', result })
        }
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
  }, [turnId, startedAt, respondingAgentId])

  if (view.kind === 'loading') {
    return (
      <div className="p-4 text-xs text-muted-foreground italic">
        Cargando vista forensics…
      </div>
    )
  }

  if (view.kind === 'disabled') {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Observabilidad desactivada (flag: <code>{view.flagName}</code>).
      </div>
    )
  }

  if (view.kind === 'error') {
    return (
      <div className="p-4 text-xs text-destructive">
        Error cargando forensics: {view.message}
      </div>
    )
  }

  const { turn, condensed } = view.result
  const displayAgentId = getDisplayAgentId(turn)
  const entryDiffersFromResponding =
    turn.respondingAgentId !== null && turn.respondingAgentId !== turn.agentId

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="px-3 py-2 border-b flex-shrink-0 space-y-1">
        <div className="text-sm font-medium">
          {displayAgentId}
          {entryDiffersFromResponding && (
            <span className="ml-2 text-xs text-muted-foreground">
              (entry: {turn.agentId})
            </span>
          )}
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
          <span>{condensed.length} items</span>
          {turn.hasError && (
            <span className="text-destructive font-medium">ERROR</span>
          )}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <CondensedTimeline items={condensed} />

        {/* Session state snapshot (D-06 — full, no filtering) */}
        <div className="border-t mt-2">
          <SessionSnapshot conversationId={conversationId} />
        </div>
      </div>
    </div>
  )
}
