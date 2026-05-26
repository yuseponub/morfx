'use client'

/**
 * Interruption Tab Component
 * Standalone: debounce-interruption-system-v2 / Plan 06 (D-11 + LOCK-08).
 *
 * Renders the 14 D-17-extended lock-lifecycle observability events for the
 * selected session+turn (the 13 from Plans 01-05 plus the REVISION B1 14th
 * label `lock_orphan_swept_by_cron` emitted by the Plan 06 cron):
 *
 *   - lock_acquired
 *   - lock_acquire_failed_follower
 *   - interrupt_written
 *   - interrupt_detected_at_ckpt_N
 *   - msg_aborted_path_a_combined
 *   - msg_aborted_path_b_solo
 *   - lock_released_normal
 *   - follower_woke
 *   - lock_force_acquired_after_ttl_expiry
 *   - zombie_lambda_exit
 *   - heartbeat_renewed
 *   - pending_list_combined
 *   - redis_unavailable_fallback_failed
 *   - lock_orphan_swept_by_cron  (REVISION B1 — emitted by Plan 06 cron, NOT turn-time)
 *
 * RESEARCH Open Question 3 verdict: POST-TURN FETCH (NOT live SSE). User reloads
 * to see updates. Visual structure mirrors subloop-tab.tsx for sandbox consistency.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Lock,
  Unlock,
  AlertTriangle,
  Clock,
  Activity,
  Zap,
  Trash2,
  PencilLine,
  Repeat,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// 14 D-17-extended LockEventLabel values (kept in sync with
// src/lib/agents/interruption-system-v2/observability.ts).
// ---------------------------------------------------------------------------
const LOCK_EVENT_LABELS = [
  'lock_acquired',
  'lock_acquire_failed_follower',
  'interrupt_written',
  'interrupt_detected_at_ckpt_N',
  'msg_aborted_path_a_combined',
  'msg_aborted_path_b_solo',
  'lock_released_normal',
  'follower_woke',
  'lock_force_acquired_after_ttl_expiry',
  'zombie_lambda_exit',
  'heartbeat_renewed',
  'pending_list_combined',
  'redis_unavailable_fallback_failed',
  'lock_orphan_swept_by_cron', // REVISION B1 — 14th label
] as const

interface InterruptionEvent {
  id: string
  turn_id: string
  recorded_at: string
  category: string | null
  label: string | null
  payload: Record<string, unknown> | null
}

interface InterruptionTabProps {
  /** Optional — when null, the tab shows a neutral placeholder. */
  conversationId?: string | null
  /** Optional — preferred over conversationId when both present. */
  sessionId?: string | null
}

// ---------------------------------------------------------------------------
// Visual helpers (mirror subloop-tab.tsx — Tailwind + lucide-react).
// ---------------------------------------------------------------------------

function getIconForLabel(label: string | null) {
  if (label === 'lock_acquired') return <Lock className="h-4 w-4 text-green-600" />
  if (label === 'lock_released_normal') return <Unlock className="h-4 w-4 text-blue-600" />
  if (label === 'lock_orphan_swept_by_cron')
    return <Trash2 className="h-4 w-4 text-purple-600" />
  if (label === 'lock_acquire_failed_follower' || label === 'follower_woke')
    return <Repeat className="h-4 w-4 text-amber-500" />
  if (label === 'interrupt_written') return <PencilLine className="h-4 w-4 text-orange-600" />
  if (label === 'interrupt_detected_at_ckpt_N')
    return <Zap className="h-4 w-4 text-orange-600" />
  if (label === 'msg_aborted_path_a_combined' || label === 'msg_aborted_path_b_solo')
    return <AlertTriangle className="h-4 w-4 text-red-600" />
  if (label === 'zombie_lambda_exit')
    return <ShieldAlert className="h-4 w-4 text-red-700" />
  if (label === 'redis_unavailable_fallback_failed')
    return <AlertTriangle className="h-4 w-4 text-red-500" />
  if (label === 'heartbeat_renewed')
    return <Activity className="h-4 w-4 text-amber-500" />
  if (label === 'lock_force_acquired_after_ttl_expiry')
    return <Lock className="h-4 w-4 text-yellow-600" />
  if (label === 'pending_list_combined')
    return <Activity className="h-4 w-4 text-indigo-500" />
  return <Clock className="h-4 w-4 text-muted-foreground" />
}

function getVariantForLabel(
  label: string | null,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (label === 'lock_acquired' || label === 'lock_released_normal') return 'default'
  if (
    label === 'msg_aborted_path_a_combined' ||
    label === 'msg_aborted_path_b_solo' ||
    label === 'zombie_lambda_exit' ||
    label === 'redis_unavailable_fallback_failed'
  ) {
    return 'destructive'
  }
  if (label === 'lock_orphan_swept_by_cron') return 'outline'
  return 'secondary'
}

function formatBogotaTime(iso: string): string {
  try {
    // Regla 2: TODA lógica de fechas usa America/Bogota.
    return new Date(iso).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function InterruptionTab({ conversationId, sessionId }: InterruptionTabProps) {
  const [events, setEvents] = useState<InterruptionEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stable URL — only re-fetch when the IDs change.
  const fetchUrl = useMemo(() => {
    if (!sessionId && !conversationId) return null
    const params = new URLSearchParams()
    if (sessionId) params.set('session_id', sessionId)
    if (conversationId) params.set('conversation_id', conversationId)
    params.set('labels', LOCK_EVENT_LABELS.join(','))
    return `/api/observability/events?${params.toString()}`
  }, [conversationId, sessionId])

  useEffect(() => {
    if (!fetchUrl) {
      setEvents([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(fetchUrl)
      .then(async (r) => {
        const body = (await r.json()) as { events?: InterruptionEvent[]; error?: string }
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
        if (!cancelled) setEvents(body.events ?? [])
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchUrl])

  if (!sessionId && !conversationId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground text-center px-4">
        Select a session to inspect the lock lifecycle. v4-only feature (other
        agents use Phase 31 hasNewInboundMessage; non-v4 turns produce no events here).
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        Loading lock events…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-red-700 dark:text-red-300">
            Failed to load lock events
          </div>
          <div className="text-xs text-red-600 dark:text-red-400 break-words">{error}</div>
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground text-center px-4">
        No interruption-system-v2 events for this turn (v4-only feature; non-v4
        paths use Phase 31).
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Interruption lifecycle ({events.length} event{events.length === 1 ? '' : 's'})
      </div>
      {events.map((evt) => (
        <div
          key={evt.id}
          className={cn(
            'border rounded-lg p-3 space-y-2',
            evt.label === 'zombie_lambda_exit' &&
              'border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10',
            evt.label === 'lock_orphan_swept_by_cron' &&
              'border-purple-300 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10',
          )}
        >
          <div className="flex items-center gap-2">
            {getIconForLabel(evt.label)}
            <Badge variant={getVariantForLabel(evt.label)} className="text-[10px]">
              {evt.label ?? '—'}
            </Badge>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatBogotaTime(evt.recorded_at)}
            </span>
          </div>
          {evt.payload && Object.keys(evt.payload).length > 0 && (
            <pre className="text-[11px] bg-muted/40 p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(evt.payload, null, 2)}
            </pre>
          )}
        </div>
      ))}
    </div>
  )
}
