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
  department?: string
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
  department?: string
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
    department?: string
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
        department: params.department || null,
      })
      .select('id, name, phone, email, city, department, address')
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
    await emitContactCreated({
      workspaceId: ctx.workspaceId,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone ?? undefined,
      contactEmail: contact.email ?? undefined,
      contactCity: contact.city ?? undefined,
      contactDepartment: contact.department ?? undefined,
      contactAddress: contact.address ?? undefined,
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
    if (params.department !== undefined) updates.department = params.department || null

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

    // Handle custom_fields
    const existingCustom = (previousContact.custom_fields as Record<string, unknown>) || {}
    let mergedCustom: Record<string, unknown> | undefined

    if (params.customFields !== undefined) {
      mergedCustom = { ...existingCustom, ...params.customFields }
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
      .eq('workspace_id', ctx.workspaceId)
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
        await emitFieldChanged({
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
          await emitFieldChanged({
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
      department: c.department || null,
    }))

    // Batch insert with returning
    const { data: inserted, error: insertError } = await supabase
      .from('contacts')
      .insert(insertData)
      .select('id, name, phone, email, city, department, address')

    if (insertError || !inserted) {
      return { success: false, error: `Error al crear los contactos: ${insertError?.message}` }
    }

    const contactIds = inserted.map((c) => c.id)

    // Fire-and-forget: emit automation trigger per contact
    for (const contact of inserted) {
      await emitContactCreated({
        workspaceId: ctx.workspaceId,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone ?? undefined,
        contactEmail: contact.email ?? undefined,
        contactCity: contact.city ?? undefined,
        contactDepartment: contact.department ?? undefined,
        contactAddress: contact.address ?? undefined,
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

// ============================================================================
// archiveContact (Phase 44 — soft delete for crm-writer)
// ============================================================================

export interface ArchiveContactParams {
  contactId: string
}

export interface ArchiveContactResult {
  contactId: string
  archivedAt: string  // ISO-8601
}

/**
 * Archive a contact (soft delete). Used by crm-writer (Phase 44) — writer
 * CANNOT DELETE real (CONTEXT D-05). Human UI retains deleteContact.
 *
 * Idempotent: archiving an already-archived contact returns success with the
 * existing archived_at timestamp (not overwritten).
 *
 * No automation trigger — mirrors deleteContact which also emits none.
 */
export async function archiveContact(
  ctx: DomainContext,
  params: ArchiveContactParams,
): Promise<DomainResult<ArchiveContactResult>> {
  const supabase = createAdminClient()

  try {
    // Verify contact exists and belongs to workspace.
    const { data: existing, error: fetchError } = await supabase
      .from('contacts')
      .select('id, archived_at')
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)
      .single()

    if (fetchError || !existing) {
      return { success: false, error: 'Contacto no encontrado' }
    }

    // Idempotency: if already archived, return existing timestamp.
    if (existing.archived_at) {
      return {
        success: true,
        data: { contactId: params.contactId, archivedAt: existing.archived_at },
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('contacts')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', params.contactId)
      .eq('workspace_id', ctx.workspaceId)
      .select('id, archived_at')
      .single()

    if (updateError || !updated) {
      return { success: false, error: `Error al archivar el contacto: ${updateError?.message ?? 'unknown'}` }
    }

    return {
      success: true,
      data: { contactId: params.contactId, archivedAt: updated.archived_at },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, error: message }
  }
}

// ============================================================================
// searchContacts (Phase 44 — reader helper, Blocker 1 mitigation)
// ============================================================================

export interface SearchContactsParams {
  /** Free-text: matches phone, email, or name via ILIKE */
  query: string
  /** Include archived? Default: false */
  includeArchived?: boolean
  limit?: number
}

export interface ContactListItem {
  id: string
  name: string
  phone: string | null
  email: string | null
  createdAt: string
}

/**
 * Search contacts in the workspace. Reader-side helper.
 * Default excludes archived rows (archived_at IS NULL).
 */
export async function searchContacts(
  ctx: DomainContext,
  params: SearchContactsParams,
): Promise<DomainResult<ContactListItem[]>> {
  const supabase = createAdminClient()

  try {
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50)
    const q = params.query.trim()
    if (!q) return { success: true, data: [] }

    // Escape PostgREST `or` filter special chars in the ILIKE value.
    // Commas and parentheses would otherwise break the filter list.
    const safe = q.replace(/[,()%]/g, (m) => (m === '%' ? '\\%' : ' '))

    let qb = supabase
      .from('contacts')
      .select('id, name, phone, email, created_at')
      .eq('workspace_id', ctx.workspaceId)
      .or(`phone.ilike.%${safe}%,email.ilike.%${safe}%,name.ilike.%${safe}%`)
      .limit(limit)

    if (!params.includeArchived) qb = qb.is('archived_at', null)

    const { data, error } = await qb

    if (error) return { success: false, error: `Error de base de datos: ${error.message}` }

    return {
      success: true,
      data: (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        email: r.email,
        createdAt: r.created_at,
      })),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================================
// getContactById (Phase 44 — reader + writer existence check)
// ============================================================================

export interface GetContactByIdParams {
  contactId: string
  /** Include archived row? Default: false */
  includeArchived?: boolean
}

export interface ContactDetail {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  createdAt: string
  archivedAt: string | null
  tags: Array<{ id: string; name: string }>
  customFields: Record<string, unknown>
}

/**
 * Get a contact by ID with tags + custom fields. Workspace-scoped.
 * Returns data=null (inside a success result) if not found so callers can
 * differentiate DB error from not_found_in_workspace without throwing.
 */
export async function getContactById(
  ctx: DomainContext,
  params: GetContactByIdParams,
): Promise<DomainResult<ContactDetail | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone, email, address, city, custom_fields, created_at, archived_at, contact_tags(tag_id, tags(id, name))')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', params.contactId)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: true, data: null }

    if (!params.includeArchived && data.archived_at) {
      return { success: true, data: null }
    }

    // Flatten nested tag join (Supabase embed returns tags as object or array).
    const tags = Array.isArray(data.contact_tags)
      ? data.contact_tags
          .map((ct: { tag_id: string; tags: { id: string; name: string } | { id: string; name: string }[] | null }) =>
            Array.isArray(ct.tags) ? ct.tags[0] : ct.tags,
          )
          .filter((t: { id: string; name: string } | null | undefined): t is { id: string; name: string } => !!t)
      : []

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        city: data.city,
        createdAt: data.created_at,
        archivedAt: data.archived_at,
        tags,
        customFields: (data.custom_fields as Record<string, unknown>) ?? {},
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
