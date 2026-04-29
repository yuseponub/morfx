// ============================================================================
// Domain Layer — CRM Mutation Idempotency Keys
// Single writer of `public.crm_mutation_idempotency_keys` (D-pre-02: domain
// layer is the SOLE place that uses createAdminClient against this table).
//
// D-03 (Standalone crm-mutation-tools): opt-in idempotency for creation
// mutations. Tools pass an opaque `idempotencyKey?: string`; on dup hit the
// caller re-hydrates fresh entity via `result_id`. TTL 30 days swept by
// Inngest cron `crm-mutation-idempotency-cleanup`.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every read/insert
//   3. Rows are immutable post-insert (no UPDATE policy in DB)
//   4. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Types
// ============================================================================

export interface IdempotencyRow {
  workspaceId: string
  toolName: string
  key: string
  resultId: string
  resultPayload: unknown
  createdAt: string
}

// ============================================================================
// getIdempotencyRow
// ============================================================================

/**
 * Lookup an idempotency row by (workspace_id, tool_name, key).
 *
 * Returns DomainResult<IdempotencyRow | null>:
 *   - success=true, data=null  → no row found (caller should mutate + insert)
 *   - success=true, data=row   → idempotency hit (caller should re-hydrate)
 *   - success=false            → DB error
 */
export async function getIdempotencyRow(
  ctx: DomainContext,
  params: { toolName: string; key: string },
): Promise<DomainResult<IdempotencyRow | null>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('crm_mutation_idempotency_keys')
    .select('workspace_id, tool_name, key, result_id, result_payload, created_at')
    .eq('workspace_id', ctx.workspaceId)
    .eq('tool_name', params.toolName)
    .eq('key', params.key)
    .maybeSingle()

  if (error) return { success: false, error: error.message }
  if (!data) return { success: true, data: null }
  return {
    success: true,
    data: {
      workspaceId: data.workspace_id as string,
      toolName: data.tool_name as string,
      key: data.key as string,
      resultId: data.result_id as string,
      resultPayload: data.result_payload as unknown,
      createdAt: data.created_at as string,
    },
  }
}

// ============================================================================
// insertIdempotencyRow
// ============================================================================

/**
 * Insert idempotency row with ON CONFLICT DO NOTHING semantics.
 *
 * Implementation uses `upsert(..., { ignoreDuplicates: true })` which
 * effectively performs INSERT ... ON CONFLICT DO NOTHING on the PRIMARY KEY
 * (workspace_id, tool_name, key).
 *
 * Returns DomainResult<{ inserted: boolean }>:
 *   - inserted=true  → we wrote the row (we won the race)
 *   - inserted=false → conflict (another caller already wrote; caller should
 *                       re-fetch winner via getIdempotencyRow)
 */
export async function insertIdempotencyRow(
  ctx: DomainContext,
  params: {
    toolName: string
    key: string
    resultId: string
    resultPayload: unknown
  },
): Promise<DomainResult<{ inserted: boolean }>> {
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('crm_mutation_idempotency_keys')
    .upsert(
      {
        workspace_id: ctx.workspaceId,
        tool_name: params.toolName,
        key: params.key,
        result_id: params.resultId,
        // JSONB column accepts unknown — cast to never to satisfy supabase-js
        // generated types when no DB type def is generated for this table yet.
        result_payload: params.resultPayload as never,
      },
      { onConflict: 'workspace_id,tool_name,key', ignoreDuplicates: true },
    )
    .select('workspace_id')

  if (error) return { success: false, error: error.message }
  // `data` is the array of rows actually inserted; empty array = conflict skipped.
  return {
    success: true,
    data: { inserted: Array.isArray(data) && data.length > 0 },
  }
}

// ============================================================================
// pruneIdempotencyRows
// ============================================================================

/**
 * Delete idempotency rows older than `olderThanDays`. Workspace-agnostic
 * (the Inngest cron sweeps globally — service_role bypass RLS).
 *
 * Returns DomainResult<{ deleted: number }>.
 *
 * Standalone crm-mutation-tools D-03 — TTL 30 days enforced by cron
 * `crm-mutation-idempotency-cleanup` (TZ=America/Bogota 0 3 * * *).
 */
export async function pruneIdempotencyRows(
  olderThanDays: number,
): Promise<DomainResult<{ deleted: number }>> {
  const supabase = createAdminClient()
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error, count } = await supabase
    .from('crm_mutation_idempotency_keys')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (error) return { success: false, error: error.message }
  return { success: true, data: { deleted: count ?? 0 } }
}
