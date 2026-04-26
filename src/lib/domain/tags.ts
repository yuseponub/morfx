// ============================================================================
// Domain Layer — Tags (Shared Entity)
// Single source of truth for tag assignment/removal on BOTH contacts and orders.
// Used by contacts and orders domain modules, and directly by callers.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Tag lookup by name + workspace_id (error if not found)
//   3. Determine junction table by entityType
//   4. Execute mutation
//   5. Emit trigger (fire-and-forget)
//   6. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import {
  emitTagAssigned,
  emitTagRemoved,
} from '@/lib/automations/trigger-emitter'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface AssignTagParams {
  entityType: 'contact' | 'order'
  entityId: string
  tagName: string
}

export interface RemoveTagParams {
  entityType: 'contact' | 'order'
  entityId: string
  tagName: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface AssignTagResult {
  tagId: string
}

export interface RemoveTagResult {
  tagId: string
}

// ============================================================================
// assignTag
// ============================================================================

/**
 * Assign a tag to a contact or order by tag name.
 * Looks up tag by name + workspace_id. Error if tag not found (no auto-create).
 * Handles duplicate gracefully (already assigned = success).
 * Fetches contactId for trigger context (from entity or order's contact).
 * Emits: tag.assigned
 */
export async function assignTag(
  ctx: DomainContext,
  params: AssignTagParams
): Promise<DomainResult<AssignTagResult>> {
  const supabase = createAdminClient()

  try {
    // Step 1: Find tag by name in workspace
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id, color')
      .eq('workspace_id', ctx.workspaceId)
      .eq('name', params.tagName)
      .single()

    if (tagError || !tag) {
      return { success: false, error: `Etiqueta "${params.tagName}" no encontrada` }
    }

    // Step 2: Determine junction table and FK column
    const junctionMap = {
      contact: { table: 'contact_tags', fk: 'contact_id' },
      order: { table: 'order_tags', fk: 'order_id' },
    } as const
    const { table: junctionTable, fk: fkColumn } = junctionMap[params.entityType]

    // Step 3: Insert into junction table (handle 23505 = already assigned = success)
    const { error: linkError } = await supabase
      .from(junctionTable)
      .insert({ [fkColumn]: params.entityId, tag_id: tag.id })

    if (linkError && linkError.code !== '23505') {
      return { success: false, error: `Error al asignar etiqueta: ${linkError.message}` }
    }

    // Step 4: Fetch contactId + contact info for rich trigger context
    let contactId: string | null = null
    let contactName: string | undefined
    let contactPhone: string | undefined
    let orderPipelineId: string | undefined
    let orderStageId: string | undefined

    if (params.entityType === 'contact') {
      contactId = params.entityId
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', params.entityId)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      contactName = contact?.name ?? undefined
      contactPhone = contact?.phone ?? undefined
    } else {
      // entityType === 'order': query order's contact_id + pipeline/stage for condition evaluation
      const { data: order } = await supabase
        .from('orders')
        .select('contact_id, pipeline_id, stage_id')
        .eq('id', params.entityId)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      contactId = order?.contact_id ?? null
      orderPipelineId = order?.pipeline_id ?? undefined
      orderStageId = order?.stage_id ?? undefined

      // Fetch contact info if available
      if (contactId) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('name, phone')
          .eq('id', contactId)
          .eq('workspace_id', ctx.workspaceId)
          .single()
        contactName = contact?.name ?? undefined
        contactPhone = contact?.phone ?? undefined
      }
    }

    // Step 5: Fire-and-forget: emit automation trigger
    await emitTagAssigned({
      workspaceId: ctx.workspaceId,
      entityType: params.entityType,
      entityId: params.entityId,
      tagId: tag.id,
      tagName: params.tagName,
      tagColor: tag.color ?? undefined,
      contactId,
      contactName,
      contactPhone,
      // When entityType is 'order', include order context for condition evaluation
      ...(params.entityType === 'order' && {
        orderId: params.entityId,
        pipelineId: orderPipelineId,
        stageId: orderStageId,
      }),
      cascadeDepth: ctx.cascadeDepth,
    })

    return {
      success: true,
      data: { tagId: tag.id },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// removeTag
// ============================================================================

/**
 * Remove a tag from a contact or order by tag name.
 * Looks up tag by name + workspace_id. Error if tag not found.
 * Fetches contactId for trigger context.
 * Emits: tag.removed
 */
export async function removeTag(
  ctx: DomainContext,
  params: RemoveTagParams
): Promise<DomainResult<RemoveTagResult>> {
  const supabase = createAdminClient()

  try {
    // Step 1: Find tag by name in workspace
    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select('id')
      .eq('workspace_id', ctx.workspaceId)
      .eq('name', params.tagName)
      .single()

    if (tagError || !tag) {
      return { success: false, error: `Etiqueta "${params.tagName}" no encontrada` }
    }

    // Step 2: Determine junction table and FK column
    const junctionMap = {
      contact: { table: 'contact_tags', fk: 'contact_id' },
      order: { table: 'order_tags', fk: 'order_id' },
    } as const
    const { table: junctionTable, fk: fkColumn } = junctionMap[params.entityType]

    // Step 3: Delete from junction table
    const { error: deleteError } = await supabase
      .from(junctionTable)
      .delete()
      .eq(fkColumn, params.entityId)
      .eq('tag_id', tag.id)

    if (deleteError) {
      return { success: false, error: `Error al quitar etiqueta: ${deleteError.message}` }
    }

    // Step 4: Fetch contactId + contact info for trigger context
    let contactId: string | null = null
    let contactName: string | undefined
    let contactPhone: string | undefined
    let orderPipelineId: string | undefined
    let orderStageId: string | undefined

    if (params.entityType === 'contact') {
      contactId = params.entityId
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, phone')
        .eq('id', params.entityId)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      contactName = contact?.name ?? undefined
      contactPhone = contact?.phone ?? undefined
    } else {
      // entityType === 'order': query order's contact_id + pipeline/stage for condition evaluation
      const { data: order } = await supabase
        .from('orders')
        .select('contact_id, pipeline_id, stage_id')
        .eq('id', params.entityId)
        .eq('workspace_id', ctx.workspaceId)
        .single()
      contactId = order?.contact_id ?? null
      orderPipelineId = order?.pipeline_id ?? undefined
      orderStageId = order?.stage_id ?? undefined

      if (contactId) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('name, phone')
          .eq('id', contactId)
          .eq('workspace_id', ctx.workspaceId)
          .single()
        contactName = contact?.name ?? undefined
        contactPhone = contact?.phone ?? undefined
      }
    }

    // Step 5: Fire-and-forget: emit automation trigger
    await emitTagRemoved({
      workspaceId: ctx.workspaceId,
      entityType: params.entityType,
      entityId: params.entityId,
      tagId: tag.id,
      tagName: params.tagName,
      contactId,
      contactName,
      contactPhone,
      ...(params.entityType === 'order' && {
        orderId: params.entityId,
        pipelineId: orderPipelineId,
        stageId: orderStageId,
      }),
      cascadeDepth: ctx.cascadeDepth,
    })

    return {
      success: true,
      data: { tagId: tag.id },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// listTags + getTagById (Phase 44 — reader helper + writer existence check)
// ============================================================================

export interface TagListItem {
  id: string
  name: string
  createdAt: string
}

/**
 * List all tags in the workspace. Reader-side helper for crm-reader (Phase 44).
 */
export async function listTags(
  ctx: DomainContext,
): Promise<DomainResult<TagListItem[]>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('tags')
      .select('id, name, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .order('name', { ascending: true })

    if (error) return { success: false, error: error.message }

    return {
      success: true,
      data: (data ?? []).map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at })),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Get a tag by id, workspace-scoped. Returns data=null on success when not found
 * so callers can differentiate DB error from missing-resource.
 */
export async function getTagById(
  ctx: DomainContext,
  params: { tagId: string },
): Promise<DomainResult<TagListItem | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('tags')
      .select('id, name, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', params.tagId)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: true, data: null }

    return { success: true, data: { id: data.id, name: data.name, createdAt: data.created_at } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// agent-lifecycle-router extensions (Plan 02 Task 3 — B-4 fix)
// ============================================================================

/**
 * Returns the array of tag names attached to a contact within the workspace.
 * Used by Plan 03 fact resolvers `tags`, `hasPagoAnticipadoTag`, and the
 * router's hard-override checks (forzar_humano, etc.). Returns [] when the
 * contact has no tags or the query failed (no exceptions thrown — fact
 * resolvers depend on a non-throwing read per Pitfall 4).
 */
export async function getContactTags(
  contactId: string,
  workspaceId: string,
): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('contact_tags')
    .select('tags!inner(name, workspace_id)')
    .eq('contact_id', contactId)
    .eq('tags.workspace_id', workspaceId)
  // PostgREST `tags!inner` returns the related row inline; supabase-js types
  // it as an array union (multi-row), so cast to any[] for the iteration.
  return ((data ?? []) as any[])
    .map((row) => row?.tags?.name)
    .filter((n): n is string => typeof n === 'string' && n.length > 0)
}

/**
 * Returns all tags in the workspace (name + color), ordered by name. Used by
 * Plan 06 admin form (TagPicker autocomplete).
 */
export async function listAllTags(
  ctx: { workspaceId: string },
): Promise<DomainResult<{ name: string; color: string | null }[]>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tags')
    .select('name, color')
    .eq('workspace_id', ctx.workspaceId)
    .order('name', { ascending: true })
  if (error) return { success: false, error: error.message }
  return { success: true, data: (data ?? []) as { name: string; color: string | null }[] }
}
