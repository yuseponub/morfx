/**
 * Pipeline Closure Tags
 *
 * When an order is in a specific pipeline AND has a specific tag,
 * it is considered "closed" and should not appear as an active order
 * in WhatsApp conversation indicators.
 */

import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================================
// Types
// ============================================================================

export interface ClosureTagRule {
  pipeline_id: string
  tag_id: string
}

// ============================================================================
// Data Access
// ============================================================================

/**
 * Fetch all closure tag rules for a workspace.
 * Uses admin client (bypass RLS) since this is called from server-side code.
 * Cache-friendly: call once per request and pass to isOrderClosedByTag.
 */
export async function getClosureTagRules(
  workspaceId: string
): Promise<ClosureTagRule[]> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('pipeline_closure_tags')
    .select('pipeline_id, tag_id')
    .eq('workspace_id', workspaceId)

  if (error) {
    console.error('Error fetching closure tag rules:', error)
    return []
  }

  return data || []
}

// ============================================================================
// Logic
// ============================================================================

/**
 * Check if an order is considered "closed" by a closure tag rule.
 * Pure function — no DB calls.
 *
 * An order is closed by tag if:
 * 1. Its pipeline matches a rule's pipeline_id
 * 2. AND it has a tag matching that rule's tag_id
 *
 * @param order - Order with pipeline and tag info
 * @param closureRules - Rules fetched via getClosureTagRules
 */
export function isOrderClosedByTag(
  order: {
    pipeline?: { id: string } | null
    tag_ids?: string[]
  },
  closureRules: ClosureTagRule[]
): boolean {
  if (!order.pipeline || !order.tag_ids || order.tag_ids.length === 0) {
    return false
  }

  if (closureRules.length === 0) {
    return false
  }

  const pipelineId = order.pipeline.id
  const tagIdSet = new Set(order.tag_ids)

  return closureRules.some(
    rule => rule.pipeline_id === pipelineId && tagIdSet.has(rule.tag_id)
  )
}
