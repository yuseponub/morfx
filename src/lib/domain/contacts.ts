// ============================================================================
// Domain Layer — Contacts
// Single source of truth for ALL contact mutations.
// Every caller (server actions, tool handlers, automations, webhooks) goes
// through these functions instead of hitting DB directly.
//
// Pattern:
//   1. createAdminClient() (bypasses RLS)
//   2. Filter by ctx.workspaceId on every query
//   3. Execute mutation
//   4. Emit trigger (fire-and-forget)
//   5. Return DomainResult<T>
// ============================================================================

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/utils/phone'
import {
  emitContactCreated,
  emitFieldChanged,
} from '@/lib/automations/trigger-emitter'
import type { DomainContext, DomainResult } from './types'

// ============================================================================
// Param Types
// ============================================================================

export interface CreateContactParams {
  name: string
  phone?: string
  email?: string
  address?: string
  city?: string
  /** Stored in custom_fields (not a standard column) */
  departamento?: string
  /** Tag names to assign after creation */
  tags?: string[]
}

export interface UpdateContactParams {
  contactId: string
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  /** Stored in custom_fields (not a standard column) */
  departamento?: string
  customFields?: Record<string, unknown>
}

export interface DeleteContactParams {
  contactId: string
}

export interface BulkCreateContactsParams {
  contacts: Array<{
    name: string
    phone?: string
    email?: string
    address?: string
    city?: string
  }>
}

// ============================================================================
// Result Types
// ============================================================================

export interface CreateContactResult {
  contactId: string
}

export interface UpdateContactResult {
  contactId: string
}

export interface DeleteContactResult {
  contactId: string
}

export interface BulkCreateContactsResult {
  created: number
  contactIds: string[]
}

// ============================================================================
// createContact
// ============================================================================

/**
 * Create a new contact with optional tag assignments.
 * Phone is normalized to E.164 format if provided.
 * Handles duplicate phone gracefully (23505 unique constraint).
 * Emits: contact.created
 */
export async function createContact(
  ctx: DomainContext,
  params: CreateContactParams
): Promise<DomainResult<CreateContactResult>> {
  const supabase = createAdminClient()

  try {
    // Normalize phone if provided
    let normalizedPhone: string | null = null
    if (params.phone) {
      normalizedPhone = normalizePhone(params.phone)
      if (!normalizedPhone) {
        return { success: false, error: 'Numero de telefono invalido' }
      }
    }

    // Build custom_fields if departamento is provided
    const customFields: Record<string, unknown> = {}
    if (params.departamento) {
      customFields.departamento = params.departamento
    }

    // Insert contact
    const { data: contact, error: insertError } = await supabase
      .from('contacts')
      .insert({
        workspace_id: ctx.workspaceId,
        name: params.name,
        phone: normalizedPhone,
        email: params.email || null,
        address: params.address || null,
        city: params.city || null,
        custom_fields: Object.keys(customFields).length > 0 ? customFields : {},
      })
      .select('id, name, phone, email, city')
      .single()

    if (insertError || !contact) {
      if (insertError?.code === '23505') {
        return { success: false, error: 'Ya existe un contacto con este numero de telefono' }
      }
      return { success: false, error: `Error al crear el contacto: ${insertError?.message}` }
    }

    // Assign tags if provided
    if (params.tags && params.tags.length > 0) {
      for (const tagName of params.tags) {
        const trimmedName = tagName.trim()
        if (!trimmedName) continue

        // Find tag by name in workspace (no auto-create per domain design)
        const { data: tag } = await supabase
          .from('tags')
          .select('id')
          .eq('workspace_id', ctx.workspaceId)
          .eq('name', trimmedName)
          .single()

        if (tag) {
          // Insert into contact_tags (ignore duplicates)
          await supabase
            .from('contact_tags')
            .insert({ contact_id: contact.id, tag_id: tag.id })
        }
        // Tag not found = skip silently (tags param is best-effort)
      }
    }

    // Fire-and-forget: emit automation trigger
    emitContactCreated({
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone ?? undefined,
      contactEmail: contact.email ?? undefined,
      contactCity: contact.city ?? undefined,
      cascadeDepth: ctx.cascadeDepth,
    })

    return {
      success: true,
      data: { contactId: contact.id },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// updateContact
// ============================================================================

/**
 * Update an existing contact. Only updates provided fields.
 * Phone is normalized to E.164 format if changed.
 * Emits: field.changed per changed field (including custom_fields keys)
 */
export async function updateContact(
  ctx: DomainContext,
  params: UpdateContactParams
): Promise<DomainResult<UpdateContactResult>> {
  const supabase = createAdminClient()

  try {
    // Capture previous state BEFORE update (for field change triggers)
    const { data: previousContact, error: fetchError } = await supabase
      .from('contacts')
      .select('workspace_id, name, phone, email, address, city, custom_fields')
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !previousContact) {
      return { success: false, error: 'Contacto no encontrado' }
    }

    // Build update object with explicit null handling (only include provided fields)
    const updates: Record<string, unknown> = {}

    if (params.name !== undefined) updates.name = params.name
    if (params.email !== undefined) updates.email = params.email || null
    if (params.address !== undefined) updates.address = params.address || null
    if (params.city !== undefined) updates.city = params.city || null

    // Normalize phone if provided
    if (params.phone !== undefined) {
      if (params.phone) {
        const normalizedPhone = normalizePhone(params.phone)
        if (!normalizedPhone) {
          return { success: false, error: 'Numero de telefono invalido' }
        }
        updates.phone = normalizedPhone
      } else {
        updates.phone = null
      }
    }

    // Handle custom_fields: merge departamento and explicit customFields
    const existingCustom = (previousContact.custom_fields as Record<string, unknown>) || {}
    let mergedCustom: Record<string, unknown> | undefined

    if (params.departamento !== undefined || params.customFields !== undefined) {
      mergedCustom = { ...existingCustom }
      if (params.departamento !== undefined) {
        mergedCustom.departamento = params.departamento
      }
      if (params.customFields !== undefined) {
        mergedCustom = { ...mergedCustom, ...params.customFields }
      }
      updates.custom_fields = mergedCustom
    }

    // Execute update if there are changes
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', params.contactId)
        .eq('workspace_id', ctx.workspaceId)

      if (updateError) {
        if (updateError.code === '23505') {
          return { success: false, error: 'Ya existe un contacto con este numero de telefono' }
        }
        return { success: false, error: `Error al actualizar el contacto: ${updateError.message}` }
      }
    }

    // Read updated contact name for trigger context
    const { data: updatedContact } = await supabase
      .from('contacts')
      .select('name')
      .eq('id', params.contactId)
      .single()

    const contactName = updatedContact?.name ?? previousContact.name

    // Fire-and-forget: emit field change triggers for each changed standard field
    const standardFieldMappings: Array<{ paramKey: keyof typeof updates; dbColumn: string }> = [
      { paramKey: 'name', dbColumn: 'name' },
      { paramKey: 'phone', dbColumn: 'phone' },
      { paramKey: 'email', dbColumn: 'email' },
      { paramKey: 'address', dbColumn: 'address' },
      { paramKey: 'city', dbColumn: 'city' },
    ]

    for (const { paramKey, dbColumn } of standardFieldMappings) {
      const newVal = updates[paramKey]
      if (newVal === undefined) continue

      const prevVal = (previousContact as Record<string, unknown>)[dbColumn]
      if (String(prevVal ?? '') !== String(newVal ?? '')) {
        emitFieldChanged({
          workspaceId: ctx.workspaceId,
          entityType: 'contact',
          entityId: params.contactId,
          fieldName: dbColumn,
          previousValue: prevVal != null ? String(prevVal) : null,
          newValue: newVal != null ? String(newVal) : null,
          contactId: params.contactId,
          contactName: contactName as string,
          cascadeDepth: ctx.cascadeDepth,
        })
      }
    }

    // Emit custom_fields changes per changed key
    if (mergedCustom !== undefined) {
      const prevCustom = existingCustom
      for (const key of Object.keys(mergedCustom)) {
        const prevVal = prevCustom[key]
        const newVal = mergedCustom[key]
        if (JSON.stringify(prevVal) !== JSON.stringify(newVal)) {
          emitFieldChanged({
            workspaceId: ctx.workspaceId,
            entityType: 'contact',
            entityId: params.contactId,
            fieldName: `custom_fields.${key}`,
            previousValue: prevVal != null ? String(prevVal) : null,
            newValue: newVal != null ? String(newVal) : null,
            contactId: params.contactId,
            contactName: contactName as string,
            cascadeDepth: ctx.cascadeDepth,
          })
        }
      }
    }

    return {
      success: true,
      data: { contactId: params.contactId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// deleteContact
// ============================================================================

/**
 * Delete a contact (contact_tags cascade from FK).
 * No delete trigger currently defined.
 */
export async function deleteContact(
  ctx: DomainContext,
  params: DeleteContactParams
): Promise<DomainResult<DeleteContactResult>> {
  const supabase = createAdminClient()

  try {
    // Verify contact exists and belongs to workspace
    const { data: existing, error: fetchError } = await supabase
      .from('contacts')
      .select('id')
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Contacto no encontrado' }
    }

    const { error: deleteError } = await supabase
      .from('contacts')
      .delete()
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)

    if (deleteError) {
      return { success: false, error: `Error al eliminar el contacto: ${deleteError.message}` }
    }

    // No trigger for contact delete (Phase 17 didn't define one)

    return {
      success: true,
      data: { contactId: params.contactId },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// bulkCreateContacts
// ============================================================================

/**
 * Bulk create contacts with per-item trigger emission.
 * Uses batch insert with returning to get IDs.
 * Each created contact emits contact.created (50 contacts = 50 events).
 * Emits: contact.created per contact
 */
export async function bulkCreateContacts(
  ctx: DomainContext,
  params: BulkCreateContactsParams
): Promise<DomainResult<BulkCreateContactsResult>> {
  const supabase = createAdminClient()

  try {
    if (params.contacts.length === 0) {
      return { success: true, data: { created: 0, contactIds: [] } }
    }

    // Build insert data with workspace_id
    const insertData = params.contacts.map((c) => ({
      workspace_id: ctx.workspaceId,
      name: c.name,
      phone: c.phone || null,
      email: c.email || null,
      address: c.address || null,
      city: c.city || null,
    }))

    // Batch insert with returning
    const { data: inserted, error: insertError } = await supabase
      .from('contacts')
      .insert(insertData)
      .select('id, name, phone, email, city')

    if (insertError || !inserted) {
      return { success: false, error: `Error al crear los contactos: ${insertError?.message}` }
    }

    const contactIds = inserted.map((c) => c.id)

    // Fire-and-forget: emit automation trigger per contact
    for (const contact of inserted) {
      emitContactCreated({
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone ?? undefined,
        contactEmail: contact.email ?? undefined,
        contactCity: contact.city ?? undefined,
        cascadeDepth: ctx.cascadeDepth,
      })
    }

    return {
      success: true,
      data: { created: inserted.length, contactIds },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}
