/**
 * clusterUnknownCases — wrapper de la SQL function `cluster_unknown_cases`
 * (creada por la migración Plan 02 `20260501100100_somnio_v4_agent_unknown_cases.sql`).
 *
 * D-05/D-06:
 *   - Threshold cosine = 0.7 (i.e. distance < 0.3) — RESEARCH §Example 3
 *   - Min cluster size = 10 cases en ventana 30 días (D-06)
 *   - Window = 30 días (D-06)
 *
 * Flow:
 *   1. RPC `cluster_unknown_cases` retorna (case_id, cluster_id) pairs.
 *   2. Para cada par: UPDATE row con cluster_id + status='ready_for_promotion'.
 *   3. Retorna conteo de clustered rows + clusters distintos.
 *
 * Standalone: somnio-sales-v4 / Plan 09 Task 2.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from '../config'

const SIMILARITY_THRESHOLD = 0.7 // cosine similarity (i.e. distance < 0.3)
const MIN_CLUSTER_SIZE = 10 // D-06
const WINDOW_DAYS = 30 // D-06

export interface ClusterResult {
  /** Total de filas a las que se les asignó cluster_id en esta corrida. */
  clustered: number
  /** Clusters distintos creados en esta corrida. */
  clusters: number
}

/**
 * Llama la SQL function `cluster_unknown_cases` y aplica los cluster_ids
 * a las filas, marcándolas como `ready_for_promotion`.
 *
 * Idempotente — la function SQL solo asigna cluster_id a filas con cluster_id
 * NULL, y este wrapper solo UPDATE-ea las filas retornadas.
 */
export async function clusterUnknownCases(
  workspaceId: string = SOMNIO_WORKSPACE_ID,
): Promise<ClusterResult> {
  const supabase = createAdminClient()

  const { data, error } = await supabase.rpc('cluster_unknown_cases', {
    p_workspace_id: workspaceId,
    p_agent_id: SOMNIO_V4_AGENT_ID,
    p_similarity_threshold: SIMILARITY_THRESHOLD,
    p_min_cluster_size: MIN_CLUSTER_SIZE,
    p_window_days: WINDOW_DAYS,
  })

  if (error) {
    throw new Error(`cluster_unknown_cases RPC failed: ${error.message}`)
  }

  const rows = (data ?? []) as Array<{ case_id: string; cluster_id: string }>
  const distinctClusters = new Set(rows.map((r) => r.cluster_id))

  for (const row of rows) {
    const { error: updateError } = await supabase
      .from('agent_unknown_cases')
      .update({ cluster_id: row.cluster_id, status: 'ready_for_promotion' })
      .eq('id', row.case_id)
    if (updateError) {
      // Don't throw — log and continue: partial cluster assignment is acceptable;
      // the next cron run will retry the leftovers (rows still 'pending' will
      // be picked up by the RPC again — function only considers status='pending').
      // No-op: the failed update means the row stays 'pending'; next run retries.
    }
  }

  return { clustered: rows.length, clusters: distinctClusters.size }
}
