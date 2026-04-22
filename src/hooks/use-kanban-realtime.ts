/**
 * useKanbanRealtime — subscribe to Supabase Realtime UPDATE events on `orders`
 * for a specific pipeline. Reconciles remote state changes (CAS completions from
 * other clients, automations, agents) into the Kanban UI.
 *
 * - Echo suppression: skips events when `recentMoveRef.current === true` (the current
 *   user just made a local optimistic move — avoids double-apply / flicker).
 * - Reconnect resync: on SUBSCRIBED after a non-SUBSCRIBED status, calls `onReconnect`
 *   so the parent can refetch / reset state (Supabase Realtime has NO event replay).
 *
 * D-14 + D-21 (no flag). Pattern 3 + Example 3 RESEARCH.
 * Standalone: crm-stage-integrity Plan 05.
 */
import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface UseKanbanRealtimeOpts {
  pipelineId: string | null
  recentMoveRef: MutableRefObject<boolean>
  onRemoteMove: (orderId: string, newStageId: string) => void
  onReconnect: () => void
}

export function useKanbanRealtime({
  pipelineId,
  recentMoveRef,
  onRemoteMove,
  onReconnect,
}: UseKanbanRealtimeOpts): void {
  useEffect(() => {
    if (!pipelineId) return

    const supabase = createClient()
    let previousStatus = ''

    const channel = supabase
      .channel(`kanban:${pipelineId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `pipeline_id=eq.${pipelineId}`,
        },
        (payload: { new: { id: string; stage_id: string; pipeline_id: string } }) => {
          // Local echo suppression (Pitfall 7 — existing 2000ms via recentMoveRef)
          if (recentMoveRef.current) return

          const updated = payload.new
          // Defensive: server-side filter SHOULD guarantee this, but double-check
          if (updated.pipeline_id !== pipelineId) return

          onRemoteMove(updated.id, updated.stage_id)
        },
      )
      .subscribe((status: string) => {
        if (
          status === 'SUBSCRIBED' &&
          previousStatus &&
          previousStatus !== 'SUBSCRIBED'
        ) {
          // Reconnected after drop — Supabase Realtime has no replay (Pitfall 6)
          onReconnect()
        }
        previousStatus = status
      })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelineId, recentMoveRef, onRemoteMove, onReconnect])
  // NOTE: intentionally NO `ordersByStage` in deps — Pitfall 5 reconnect storm avoidance.
}
