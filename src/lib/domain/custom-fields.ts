// ============================================================================
// Domain Layer — Custom Fields
// Single source of truth for contact custom field VALUE mutations.
// Custom field DEFINITIONS (create/update/delete schema) remain in
// server actions — they are admin configuration, not CRM mutations.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation (JSONB merge)
//   4. Emit field.changed trigger for each changed key
//   5. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { emitFieldChanged } from '@/lib/automations/trigger-emitter'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface UpdateCustomFieldValuesParams {
  contactId: string
  /** Key-value pairs to merge into contact's custom_fields JSONB */
  fields: Record<string, unknown>
}

export interface ReadCustomFieldValuesParams {
  contactId: string
}

// ============================================================================
// Result Types
// ============================================================================

export interface UpdateCustomFieldValuesResult {
  contactId: string
}

export interface ReadCustomFieldValuesResult {
  fields: Record<string, unknown>
  definitions: Array<{ key: string; label: string; type: string }>
}

// ============================================================================
// updateCustomFieldValues
// ============================================================================

/**
 * Update custom field values for a contact.
 * Reads current custom_fields, merges new values, writes back.
 * Emits field.changed for each key that actually changed.
 */
export async function updateCustomFieldValues(
  ctx: DomainContext,
  params: UpdateCustomFieldValuesParams
): Promise<DomainResult<UpdateCustomFieldValuesResult>> {
  try {
    const supabase = createAdminClient()

    if (!params.fields || Object.keys(params.fields).length === 0) {
      return { success: false, error: 'No se proporcionaron campos para actualizar' }
    }

    // Read current custom_fields
    const { data: contact, error: readError } = await supabase
      .from('contacts')
      .select('custom_fields')
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (readError || !contact) {
      return { success: false, error: 'Contacto no encontrado' }
    }

    const existing = (contact.custom_fields as Record<string, unknown>) || {}
    const merged = { ...existing, ...params.fields }

    // Update contact's custom_fields
    const { error: updateError } = await supabase
      .from('contacts')
      .update({ custom_fields: merged })
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)

    if (updateError) {
      console.error('[domain/custom-fields] updateCustomFieldValues error:', updateError)
      return { success: false, error: 'Error al actualizar campos personalizados' }
    }

    // Emit field.changed for each key that actually changed
    for (const [key, newValue] of Object.entries(params.fields)) {
      const previousValue = existing[key]
      const prevStr = previousValue != null ? String(previousValue) : null
      const newStr = newValue != null ? String(newValue) : null

      // Only emit if value actually changed
      if (prevStr !== newStr) {
        emitFieldChanged({
          workspaceId: ctx.workspaceId,
          entityType: 'contact',
          entityId: params.contactId,
          fieldName: `custom.${key}`,
          previousValue: prevStr,
          newValue: newStr,
          contactId: params.contactId,
          cascadeDepth: ctx.cascadeDepth,
        })
      }
    }

    return { success: true, data: { contactId: params.contactId } }
  } catch (err) {
    console.error('[domain/custom-fields] updateCustomFieldValues unexpected error:', err)
    return { success: false, error: 'Error inesperado al actualizar campos personalizados' }
  }
}

// ============================================================================
// readCustomFieldValues
// ============================================================================

/**
 * Read custom field values for a contact along with field definitions.
 * Read-only. Needed by tool handler for bot access to custom fields.
 */
export async function readCustomFieldValues(
  ctx: DomainContext,
  params: ReadCustomFieldValuesParams
): Promise<DomainResult<ReadCustomFieldValuesResult>> {
  try {
    const supabase = createAdminClient()

    // Read contact's custom_fields
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('custom_fields')
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (contactError || !contact) {
      return { success: false, error: 'Contacto no encontrado' }
    }

    const fields = (contact.custom_fields as Record<string, unknown>) || {}

    // Read field definitions for this workspace (for labels/types)
    const { data: defs, error: defsError } = await supabase
      .from('custom_field_definitions')
      .select('key, name, field_type')
      .eq('workspace_id', ctx.workspaceId)
      .order('display_order', { ascending: true })

    if (defsError) {
      console.error('[domain/custom-fields] readCustomFieldValues defs error:', defsError)
      // Non-fatal: return fields without definitions
      return {
        success: true,
        data: { fields, definitions: [] },
      }
    }

    const definitions = (defs || []).map((d) => ({
      key: d.key,
      label: d.name,
      type: d.field_type,
    }))

    return {
      success: true,
      data: { fields, definitions },
    }
  } catch (err) {
    console.error('[domain/custom-fields] readCustomFieldValues unexpected error:', err)
    return { success: false, error: 'Error inesperado al leer campos personalizados' }
  }
}
