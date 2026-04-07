'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscribes to Realtime events that affect conversation metrics:
 *  - messages INSERT (filtered by workspace_id) -> may change nuevas / reabiertas
 *  - contact_tags INSERT and DELETE -> may change agendadas
 *
 * On any event, calls onChange() with a 400ms debounce so bursts coalesce
 * into a single re-fetch. Skips re-fetches while the tab is hidden and
 * catches up on visibilitychange.
 *
 * Cleanup on unmount: clears pending timer, removes visibilitychange
 * listener, and removes the Realtime channel (no leaks).
 *
 * NOTE: contact_tags does NOT have a workspace_id column (it is normalized
 * through contact_id -> contacts.workspace_id). Realtime filters cannot do
 * joins, so we accept contact_tags events from all workspaces and rely on
 * the next RPC call (which is workspace-scoped) to recompute the truth.
 * The 400ms debounce + RPC scoping makes this safe and cheap.
 *
 * Publication requirements (apply in prod if missing):
 *   ALTER PUBLICATION supabase_realtime ADD TABLE messages;       -- applied since 20260130000002
 *   ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;   -- migration 20260317100000
 */
export function useMetricasRealtime(
  workspaceId: string | null,
  onChange: () => void
) {
  // Keep the latest onChange in a ref so we don't tear down the subscription
  // every time the caller passes a new closure.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!workspaceId) return

    const supabase = createClient()

    let timer: ReturnType<typeof setTimeout> | null = null
    const debounced = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (typeof document !== 'undefined' && document.hidden) return
        onChangeRef.current()
      }, 400) // coalesce bursts within 400ms
    }

    const channel = supabase
      .channel(`metricas:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'contact_tags',
          // No workspace_id filter: see NOTE in the hook docblock.
        },
        debounced
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'contact_tags',
        },
        debounced
      )
      .subscribe()

    // Re-fetch when the tab becomes visible again (catches up missed events).
    const onVis = () => {
      if (!document.hidden) onChangeRef.current()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      document.removeEventListener('visibilitychange', onVis)
      supabase.removeChannel(channel)
    }
  }, [workspaceId])
}
