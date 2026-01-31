'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { CustomFieldDefinition, FieldType } from '@/lib/types/database'
import { generateFieldKey } from '@/lib/custom-fields/validator'

// ============================================================================
// Validation Schemas
// ============================================================================

const FIELD_TYPES: FieldType[] = [
  'text', 'number', 'date', 'select', 'checkbox', 'url',
  'email', 'phone', 'currency', 'percentage', 'file', 'contact_relation'
]

const createFieldSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100, 'Maximo 100 caracteres'),
  key: z.string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Solo letras minusculas, numeros y guion bajo')
    .max(50, 'Maximo 50 caracteres')
    .optional(),
  field_type: z.enum(FIELD_TYPES as [FieldType, ...FieldType[]]),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().default(false),
})

const updateFieldSchema = z.object({
  name: z.string().min(1, 'Nombre requerido').max(100, 'Maximo 100 caracteres').optional(),
  options: z.array(z.string()).optional(),
  is_required: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Permission Check Helper
// ============================================================================

async function checkAdminOrOwner(): Promise<{ allowed: true; workspaceId: string } | { allowed: false; error: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { allowed: false, error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { allowed: false, error: 'No hay workspace seleccionado' }
  }

  // Check user role in workspace
  const { data: member, error: memberError } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single()

  if (memberError || !member) {
    return { allowed: false, error: 'No tienes acceso a este workspace' }
  }

  if (member.role !== 'owner' && member.role !== 'admin') {
    return { allowed: false, error: 'Solo administradores pueden modificar campos personalizados' }
  }

  return { allowed: true, workspaceId }
}

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all custom field definitions for the current workspace
 * Ordered by display_order ASC
 */
export async function getCustomFields(): Promise<CustomFieldDefinition[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select('*')
    .order('display_order', { ascending: true })

  if (error) {
    console.error('Error fetching custom fields:', error)
    return []
  }

  return data || []
}

/**
 * Get a single custom field definition by ID
 */
export async function getCustomField(id: string): Promise<CustomFieldDefinition | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    return null
  }

  return data
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Create a new custom field definition
 * Only owner/admin can create
 * Key is auto-generated from name if not provided
 */
export async function createCustomField(data: {
  name: string
  key?: string
  field_type: FieldType
  options?: string[]
  is_required?: boolean
}): Promise<ActionResult<CustomFieldDefinition>> {
  const permissionCheck = await checkAdminOrOwner()
  if (!permissionCheck.allowed) {
    return { error: permissionCheck.error }
  }
  const { workspaceId } = permissionCheck

  // Validate input
  const result = createFieldSchema.safeParse(data)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const validatedData = result.data

  // Generate key from name if not provided
  const key = validatedData.key || generateFieldKey(validatedData.name)

  // Check key uniqueness within workspace
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('custom_field_definitions')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('key', key)
    .single()

  if (existing) {
    return { error: 'Ya existe un campo con esta clave', field: 'key' }
  }

  // Get max display_order for workspace
  const { data: maxOrderResult } = await supabase
    .from('custom_field_definitions')
    .select('display_order')
    .eq('workspace_id', workspaceId)
    .order('display_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = (maxOrderResult?.display_order ?? -1) + 1

  // Insert field definition
  const { data: newField, error: insertError } = await supabase
    .from('custom_field_definitions')
    .insert({
      workspace_id: workspaceId,
      name: validatedData.name,
      key,
      field_type: validatedData.field_type,
      options: validatedData.options || null,
      is_required: validatedData.is_required ?? false,
      display_order: nextOrder,
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error creating custom field:', insertError)
    if (insertError.code === '23505') {
      return { error: 'Ya existe un campo con esta clave', field: 'key' }
    }
    return { error: 'Error al crear el campo personalizado' }
  }

  revalidatePath('/crm/configuracion/campos-custom')
  revalidatePath('/crm/contactos')
  return { success: true, data: newField }
}

/**
 * Update a custom field definition
 * Cannot change key (would break existing data)
 * Only owner/admin can update
 */
export async function updateCustomField(
  id: string,
  data: {
    name?: string
    options?: string[]
    is_required?: boolean
    display_order?: number
  }
): Promise<ActionResult<CustomFieldDefinition>> {
  const permissionCheck = await checkAdminOrOwner()
  if (!permissionCheck.allowed) {
    return { error: permissionCheck.error }
  }

  // Validate input
  const result = updateFieldSchema.safeParse(data)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  const validatedData = result.data

  // Build update object
  const updates: Record<string, unknown> = {}
  if (validatedData.name !== undefined) updates.name = validatedData.name
  if (validatedData.options !== undefined) updates.options = validatedData.options
  if (validatedData.is_required !== undefined) updates.is_required = validatedData.is_required
  if (validatedData.display_order !== undefined) updates.display_order = validatedData.display_order

  if (Object.keys(updates).length === 0) {
    return { error: 'No hay campos para actualizar' }
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('custom_field_definitions')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating custom field:', error)
    return { error: 'Error al actualizar el campo personalizado' }
  }

  revalidatePath('/crm/configuracion/campos-custom')
  revalidatePath('/crm/contactos')
  return { success: true, data: updated }
}

/**
 * Delete a custom field definition
 * WARNING: This removes the definition but contact data remains in JSONB
 * Only owner/admin can delete
 */
export async function deleteCustomField(id: string): Promise<ActionResult> {
  const permissionCheck = await checkAdminOrOwner()
  if (!permissionCheck.allowed) {
    return { error: permissionCheck.error }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('custom_field_definitions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting custom field:', error)
    return { error: 'Error al eliminar el campo personalizado' }
  }

  revalidatePath('/crm/configuracion/campos-custom')
  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

/**
 * Reorder custom fields
 * Receives array of field IDs in new order
 * Updates display_order to match array index
 * Only owner/admin can reorder
 */
export async function reorderCustomFields(orderedIds: string[]): Promise<ActionResult> {
  const permissionCheck = await checkAdminOrOwner()
  if (!permissionCheck.allowed) {
    return { error: permissionCheck.error }
  }
  const { workspaceId } = permissionCheck

  if (orderedIds.length === 0) {
    return { error: 'No se proporcionaron campos para reordenar' }
  }

  const supabase = await createClient()

  // Update each field's display_order
  // Use a transaction-like approach: update all in sequence
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from('custom_field_definitions')
      .update({ display_order: i })
      .eq('id', orderedIds[i])
      .eq('workspace_id', workspaceId) // Ensure we only update fields in this workspace

    if (error) {
      console.error(`Error reordering field ${orderedIds[i]}:`, error)
      return { error: 'Error al reordenar los campos' }
    }
  }

  revalidatePath('/crm/configuracion/campos-custom')
  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

// ============================================================================
// Contact Custom Fields Operations
// ============================================================================

/**
 * Update custom field values for a contact
 * Validates values against field definitions
 */
export async function updateContactCustomFields(
  contactId: string,
  customFields: Record<string, unknown>
): Promise<ActionResult<Record<string, unknown>>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Update contact's custom_fields
  const { data, error } = await supabase
    .from('contacts')
    .update({ custom_fields: customFields })
    .eq('id', contactId)
    .select('custom_fields')
    .single()

  if (error) {
    console.error('Error updating contact custom fields:', error)
    return { error: 'Error al actualizar los campos personalizados' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${contactId}`)
  return { success: true, data: data.custom_fields as Record<string, unknown> }
}
