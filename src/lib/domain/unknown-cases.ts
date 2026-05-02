import { createAdminClient } from '@/lib/supabase/admin'
import { SOMNIO_V4_AGENT_ID } from '@/lib/agents/somnio-v4/config'

/**
 * Domain layer para agent_unknown_cases (D-05, Plan 10).
 *
 * Filtra por workspace_id en TODAS las queries (Regla 3).
 * Hardcodea agent_id='somnio-sales-v4' por ahora — generalizable cuando otros
 * agentes adopten el patrón de unknown-cases.
 *
 * Mutations:
 *  - dismissCluster: marca status='dismissed' para todas las rows con ese cluster_id
 *  - markPromoted:   marca status='promoted' + promoted_at=NOW para esas mismas rows
 *
 * Queries:
 *  - listClusters:     agrupa rows con status='ready_for_promotion' por cluster_id
 *  - listUnclustered:  rows con status='pending' y cluster_id IS NULL (recientes)
 */

export interface ClusterSummary {
  clusterId: string
  size: number
  exampleMessages: string[] // up to 3 redacted snippets (oldest-first)
  dominantIntent: string | null
  oldestCaseAt: string // ISO
  newestCaseAt: string
}

export interface UnknownCaseRow {
  id: string
  conversationId: string
  message: string
  intent: string | null
  confidence: number | null
  reason: string | null
  knowledgeQueried: string[]
  createdAt: string
}

export async function listClusters(ctx: { workspaceId: string }): Promise<ClusterSummary[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_unknown_cases')
    .select('id, cluster_id, message, intent, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('status', 'ready_for_promotion')
    .not('cluster_id', 'is', null)

  if (error) throw new Error(`listClusters: ${error.message}`)

  // Group by cluster_id en memoria
  const groups = new Map<string, Array<{ message: string; intent: string | null; created_at: string }>>()
  for (const row of data ?? []) {
    const cid = row.cluster_id as string
    if (!groups.has(cid)) groups.set(cid, [])
    groups.get(cid)!.push({
      message: row.message as string,
      intent: (row.intent as string | null) ?? null,
      created_at: row.created_at as string,
    })
  }

  return Array.from(groups.entries()).map(([clusterId, rows]) => {
    const sortedAsc = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const intents = rows.map((r) => r.intent).filter((v): v is string => Boolean(v))
    const intentCount = new Map<string, number>()
    for (const it of intents) intentCount.set(it, (intentCount.get(it) ?? 0) + 1)
    const dominantIntent =
      Array.from(intentCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

    return {
      clusterId,
      size: rows.length,
      exampleMessages: sortedAsc.slice(0, 3).map((r) => r.message),
      dominantIntent,
      oldestCaseAt: sortedAsc[0]?.created_at ?? '',
      newestCaseAt: sortedAsc[sortedAsc.length - 1]?.created_at ?? '',
    }
  })
}

export async function listUnclustered(ctx: { workspaceId: string }): Promise<UnknownCaseRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agent_unknown_cases')
    .select('id, conversation_id, message, intent, confidence, reason, knowledge_queried, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('status', 'pending')
    .is('cluster_id', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(`listUnclustered: ${error.message}`)

  return (data ?? []).map((r) => ({
    id: r.id as string,
    conversationId: r.conversation_id as string,
    message: r.message as string,
    intent: (r.intent as string | null) ?? null,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    reason: (r.reason as string | null) ?? null,
    knowledgeQueried: (r.knowledge_queried as string[] | null) ?? [],
    createdAt: r.created_at as string,
  }))
}

export async function dismissCluster(
  ctx: { workspaceId: string },
  clusterId: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_unknown_cases')
    .update({ status: 'dismissed' })
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('cluster_id', clusterId)
  if (error) throw new Error(`dismissCluster: ${error.message}`)
}

export async function markPromoted(
  ctx: { workspaceId: string },
  clusterId: string,
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agent_unknown_cases')
    .update({ status: 'promoted', promoted_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('agent_id', SOMNIO_V4_AGENT_ID)
    .eq('cluster_id', clusterId)
  if (error) throw new Error(`markPromoted: ${error.message}`)
}
