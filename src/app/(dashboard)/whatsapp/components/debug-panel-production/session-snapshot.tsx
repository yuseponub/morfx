'use client'

/**
 * SessionSnapshot — READ-ONLY JSON viewer for `session_state.datos_capturados`.
 *
 * Introduced by standalone phase `agent-forensics-panel` Plan 03 (D-06).
 *
 * Data flow:
 *   - One-shot fetch via `getSessionSnapshotAction(conversationId)` whenever
 *     the conversationId changes. Same hand-rolled `useEffect + mountedRef +
 *     cancelled` pattern as `turn-detail.tsx` and `forensics-tab.tsx` — no
 *     SWR, no new deps (Phase 42.1 convention).
 *
 * UI:
 *   - 4 render states: loading / empty / error / data.
 *   - Theme-aware JsonView (`@uiw/react-json-view`) with light/dark themes
 *     via `next-themes`, same pattern as `sandbox/debug-panel/state-tab.tsx`
 *     but READ-ONLY (no editor, no onEdit callback).
 *   - Header shows shortened sessionId + label "estado actual, no historico"
 *     (A7 limitation from RESEARCH.md — `session_state` is mutated in-place
 *     by the agent so for historical turns this is the current state, not
 *     the state at the time of that turn).
 */

import { useEffect, useRef, useState } from 'react'
import JsonView from '@uiw/react-json-view'
import { darkTheme } from '@uiw/react-json-view/dark'
import { lightTheme } from '@uiw/react-json-view/light'
import { useTheme } from 'next-themes'
import { getSessionSnapshotAction } from '@/app/actions/observability'

interface Props {
  conversationId: string
}

type SnapshotState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  | { kind: 'data'; snapshot: unknown; sessionId: string }

export function SessionSnapshot({ conversationId }: Props) {
  const [state, setState] = useState<SnapshotState>({ kind: 'loading' })
  const mountedRef = useRef(true)
  const { resolvedTheme } = useTheme()
  const jsonStyle = resolvedTheme === 'dark' ? darkTheme : lightTheme

  useEffect(() => {
    mountedRef.current = true
    setState({ kind: 'loading' })
    let cancelled = false

    ;(async () => {
      try {
        const result = await getSessionSnapshotAction(conversationId)
        if (cancelled || !mountedRef.current) return
        if (!result.sessionId || result.snapshot == null) {
          setState({ kind: 'empty' })
        } else {
          setState({
            kind: 'data',
            snapshot: result.snapshot,
            sessionId: result.sessionId,
          })
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    return () => {
      cancelled = true
      mountedRef.current = false
    }
  }, [conversationId])

  if (state.kind === 'loading') {
    return (
      <div className="p-3 text-xs text-muted-foreground italic">
        Cargando snapshot…
      </div>
    )
  }

  if (state.kind === 'empty') {
    return (
      <div className="p-3 text-xs text-muted-foreground italic">
        No hay session activa para esta conversation.
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="p-3 text-xs text-destructive">
        Error cargando snapshot: {state.message}
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="text-xs text-muted-foreground mb-2 font-mono">
        Snapshot session_state · session {state.sessionId.slice(0, 8)}…
        <span className="ml-2 italic">
          (estado actual, no historico — A7 RESEARCH)
        </span>
      </div>
      <div className="text-xs">
        <JsonView
          value={state.snapshot as object}
          style={jsonStyle as Record<string, unknown>}
          collapsed={2}
          displayDataTypes={false}
          enableClipboard={true}
        />
      </div>
    </div>
  )
}
