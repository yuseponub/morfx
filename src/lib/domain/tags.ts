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
  entityType: 'contact' | 'order' | 'conversation'
  entityId: string
  tagName: string
}

export interface RemoveTagParams {
  entityType: 'contact' | 'order' | 'conversation'
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
      conversation: { table: 'conversation_tags', fk: 'conversation_id' },
    } as const
    const { table: junctionTable, fk: fkColumn } = junctionMap[params.entityType]

    // Step 3: Insert into junction table (handle 23505 = already assigned = success)
    const { error: linkError } = await supabase
      .from(junctionTable)
      .insert({ [fkColumn]: params.entityId, tag_id: tag.id })

    if (linkError && linkError.code !== '23505') {
      return { success: false, error: `Error al asignar etiqueta: ${linkError.message}` }
    }

    // Conversations: no trigger emission, just return success
    if (params.entityType === 'conversation') {
      return { success: true, data: { tagId: tag.id } }
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
      conversation: { table: 'conversation_tags', fk: 'conversation_id' },
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

    // Conversations: no trigger emission, just return success
    if (params.entityType === 'conversation') {
      return { success: true, data: { tagId: tag.id } }
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
