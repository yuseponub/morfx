'use client'

/**
 * Master pane of the production debug panel: vertical list of the
 * recent turns for the currently open conversation.
 *
 * Data flow:
 *   - Polls `getTurnsByConversationAction(conversationId)` every 15s.
 *   - Deduplicates concurrent fetches via an in-flight ref.
 *   - Cancels polling when the conversation id changes or the
 *     component unmounts.
 *
 * State machine (UI surface):
 *
 *   initial load      → 'loading'  (spinner + text)
 *   flag OFF          → 'disabled' (amber message + env var name)
 *   flag ON, no data  → 'empty'    (neutral text)
 *   flag ON, has data → 'data'     (scrollable button list)
 *   any error         → 'error'    (red text + retry button)
 *
 * Rationale for hand-rolled polling vs SWR: the repo does not use
 * SWR nor @tanstack/react-query (verified at commit time). Adding a
 * new data-fetching library just for this panel would violate the
 * "zero new deps" spirit of Phase 42.1. A ~30-line useEffect is enough.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  getTurnsByConversationAction,
  type GetTurnsResult,
} from '@/app/actions/observability'
import { getDisplayAgentId } from './get-display-agent-id'

const POLL_INTERVAL_MS = 15_000

interface Props {
  conversationId: string
  selectedTurnId: string | null
  /**
   * Called when the user clicks a turn row. Receives the canonical
   * `turnId`, its `startedAt` (used by the detail pane for partition
   * pruning), and the `respondingAgentId` (Plan 01) so the Tabs wrapper
   * can pass it to the forensics view without another round-trip.
   */
  onSelectTurn: (
    turnId: string,
    startedAt: string,
    respondingAgentId: string | null,
  ) => void
}

type ViewState =
  | { kind: 'loading' }
  | { kind: 'disabled'; flagName: string }
  | { kind: 'empty' }
  | { kind: 'data'; result: Extract<GetTurnsResult, { status: 'ok' }> }
  | { kind: 'error'; message: string }

export function TurnList({ conversationId, selectedTurnId, onSelectTurn }: Props) {
  const [view, setView] = useState<ViewState>({ kind: 'loading' })
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)

  const fetchOnce = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      const result = await getTurnsByConversationAction(conversationId)
      if (!mountedRef.current) return
      if (result.status === 'disabled') {
        setView({ kind: 'disabled', flagName: result.flagName })
        return
      }
      if (result.turns.length === 0) {
        setView({ kind: 'empty' })
        return
      }
      setView({ kind: 'data', result })
    } catch (err) {
      if (!mountedRef.current) return
      setView({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      inFlightRef.current = false
    }
  }, [conversationId])

  useEffect(() => {
    mountedRef.current = true
    setView({ kind: 'loading' })
    fetchOnce()
    const id = setInterval(fetchOnce, POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(id)
    }
  }, [fetchOnce])

  if (view.kind === 'loading') {
    return <div className="p-4 text-sm text-muted-foreground">Cargando turnos...</div>
  }

  if (view.kind === 'error') {
    return (
      <div className="p-4 text-sm text-destructive">
        <p className="font-medium">Error al cargar turnos</p>
        <p className="text-xs mt-1 break-words">{view.message}</p>
        <button
          onClick={fetchOnce}
          className="mt-2 text-xs underline hover:no-underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  if (view.kind === 'disabled') {
    return (
      <div className="p-4 text-sm">
        <p className="text-amber-500 font-medium">Observabilidad desactivada</p>
        <p className="text-xs text-muted-foreground mt-1">
          Set <code className="px-1 py-0.5 rounded bg-muted text-foreground">{view.flagName}=true</code> en Vercel para activar la captura.
        </p>
      </div>
    )
  }

  if (view.kind === 'empty') {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Sin turnos registrados para esta conversacion.
      </div>
    )
  }

  const turns = view.result.turns

  return (
    <div className="h-full overflow-y-auto divide-y divide-border">
      {turns.map((turn) => {
        const isSelected = selectedTurnId === turn.id
        return (
          <button
            key={turn.id}
            onClick={() =>
              onSelectTurn(turn.id, turn.startedAt, turn.respondingAgentId ?? null)
            }
            className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
              isSelected ? 'bg-muted' : ''
            }`}
          >
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {new Date(turn.startedAt).toLocaleString('es-CO', {
                  timeZone: 'America/Bogota',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  day: '2-digit',
                  month: '2-digit',
                })}
              </span>
              <span>{turn.durationMs !== null ? `${turn.durationMs}ms` : '—'}</span>
            </div>
            <div className="text-sm text-foreground mt-1 truncate">
              {getDisplayAgentId(turn)} · {turn.triggerKind ?? 'event'}
              {turn.hasError && (
                <span className="ml-2 text-destructive text-xs font-medium">ERROR</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-1 flex gap-2 flex-wrap">
              <span>{turn.eventCount}ev</span>
              <span>{turn.queryCount}q</span>
              <span>{turn.aiCallCount}ai</span>
              <span>{turn.totalTokens}tok</span>
              <span>${turn.totalCostUsd.toFixed(4)}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
