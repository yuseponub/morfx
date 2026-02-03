'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { normalizePhone } from '@/lib/utils/phone'
import type { Contact, ContactWithTags, Tag } from '@/lib/types/database'

// ============================================================================
// Validation Schemas
// ============================================================================

const contactSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  phone: z.string().min(1, 'El telefono es requerido'),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
})

// ============================================================================
// Helper Types
// ============================================================================

type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }

// ============================================================================
// Read Operations
// ============================================================================

/**
 * Get all contacts with their tags for the current workspace
 * Ordered by updated_at DESC (most recent first)
 */
export async function getContacts(): Promise<ContactWithTags[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  // Get contacts
  const { data: contacts, error: contactsError } = await supabase
    .from('contacts')
    .select('*')
    .order('updated_at', { ascending: false })

  if (contactsError) {
    console.error('Error fetching contacts:', contactsError)
    return []
  }

  if (!contacts || contacts.length === 0) {
    return []
  }

  // Get contact_tags for all contacts
  const contactIds = contacts.map(c => c.id)
  const { data: contactTags } = await supabase
    .from('contact_tags')
    .select('contact_id, tag_id')
    .in('contact_id', contactIds)

  // Get all tags referenced
  const tagIds = [...new Set(contactTags?.map(ct => ct.tag_id) || [])]
  const { data: tags } = tagIds.length > 0
    ? await supabase.from('tags').select('*').in('id', tagIds)
    : { data: [] }

  // Build tag lookup map
  const tagMap = new Map<string, Tag>(tags?.map(t => [t.id, t]) || [])

  // Build contact -> tags lookup
  const contactTagsMap = new Map<string, Tag[]>()
  for (const ct of contactTags || []) {
    const tag = tagMap.get(ct.tag_id)
    if (tag) {
      const existing = contactTagsMap.get(ct.contact_id) || []
      existing.push(tag)
      contactTagsMap.set(ct.contact_id, existing)
    }
  }

  // Combine contacts with tags
  return contacts.map(contact => ({
    ...contact,
    tags: contactTagsMap.get(contact.id) || []
  }))
}

/**
 * Search contacts by name or phone
 * Returns basic contact info (id, name, phone) for quick lookups
 */
export async function searchContacts(params: {
  search: string
  limit?: number
}): Promise<Array<{ id: string; name: string; phone: string }>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return []
  }

  const searchTerm = params.search.trim()
  if (!searchTerm) {
    return []
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .eq('workspace_id', workspaceId)
    .or(`name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
    .order('name')
    .limit(params.limit || 10)

  if (error) {
    console.error('Error searching contacts:', error)
    return []
  }

  return data || []
}

/**
 * Get a single contact by ID with tags
 * Returns null if not found or not accessible
 */
export async function getContact(id: string): Promise<ContactWithTags | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  // Get contact
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !contact) {
    return null
  }

  // Get tags for this contact
  const { data: contactTags } = await supabase
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', id)

  const tagIds = contactTags?.map(ct => ct.tag_id) || []
  const { data: tags } = tagIds.length > 0
    ? await supabase.from('tags').select('*').in('id', tagIds)
    : { data: [] }

  return {
    ...contact,
    tags: tags || []
  }
}

// ============================================================================
// Create/Update Operations
// ============================================================================

/**
 * Simple contact data for programmatic creation
 */
export interface ContactInput {
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
}

/**
 * Create a new contact from object data (for programmatic use)
 * Phone is normalized to E.164 format (+57XXXXXXXXXX)
 */
export async function createContact(data: ContactInput): Promise<ActionResult<Contact>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get workspace_id from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Validate input
  const raw = {
    name: data.name || '',
    phone: data.phone || '',
    email: data.email || '',
    address: data.address || '',
    city: data.city || '',
  }

  const result = contactSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  // Normalize phone number
  const normalizedPhone = normalizePhone(result.data.phone)
  if (!normalizedPhone) {
    return { error: 'Numero de telefono invalido', field: 'phone' }
  }

  // Insert contact with workspace_id
  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: workspaceId,
      name: result.data.name,
      phone: normalizedPhone,
      email: result.data.email || null,
      address: result.data.address || null,
      city: result.data.city || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating contact:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un contacto con este numero de telefono', field: 'phone' }
    }
    return { error: 'Error al crear el contacto' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath('/crm/pedidos')
  return { success: true, data: contact }
}

/**
 * Create a new contact from FormData (for form submissions)
 * Phone is normalized to E.164 format (+57XXXXXXXXXX)
 */
export async function createContactFromForm(formData: FormData): Promise<ActionResult<Contact>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Get workspace_id from cookie
  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  // Parse and validate input
  const raw = {
    name: formData.get('name')?.toString() || '',
    phone: formData.get('phone')?.toString() || '',
    email: formData.get('email')?.toString() || '',
    address: formData.get('address')?.toString() || '',
    city: formData.get('city')?.toString() || '',
  }

  const result = contactSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  // Normalize phone number
  const normalizedPhone = normalizePhone(result.data.phone)
  if (!normalizedPhone) {
    return { error: 'Numero de telefono invalido', field: 'phone' }
  }

  // Insert contact with workspace_id
  const { data, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: workspaceId,
      name: result.data.name,
      phone: normalizedPhone,
      email: result.data.email || null,
      address: result.data.address || null,
      city: result.data.city || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating contact:', error)
    // Handle unique constraint violation (duplicate phone)
    if (error.code === '23505') {
      return { error: 'Ya existe un contacto con este numero de telefono', field: 'phone' }
    }
    return { error: 'Error al crear el contacto' }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data }
}

/**
 * Update an existing contact from FormData
 * Phone is normalized to E.164 format if changed
 */
export async function updateContactFromForm(id: string, formData: FormData): Promise<ActionResult<Contact>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Parse and validate input
  const raw = {
    name: formData.get('name')?.toString() || '',
    phone: formData.get('phone')?.toString() || '',
    email: formData.get('email')?.toString() || '',
    address: formData.get('address')?.toString() || '',
    city: formData.get('city')?.toString() || '',
  }

  const result = contactSchema.safeParse(raw)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    return { error: firstIssue.message, field: firstIssue.path[0]?.toString() }
  }

  // Normalize phone number
  const normalizedPhone = normalizePhone(result.data.phone)
  if (!normalizedPhone) {
    return { error: 'Numero de telefono invalido', field: 'phone' }
  }

  // Update contact
  const { data, error } = await supabase
    .from('contacts')
    .update({
      name: result.data.name,
      phone: normalizedPhone,
      email: result.data.email || null,
      address: result.data.address || null,
      city: result.data.city || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating contact:', error)
    if (error.code === '23505') {
      return { error: 'Ya existe un contacto con este numero de telefono', field: 'phone' }
    }
    return { error: 'Error al actualizar el contacto' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${id}`)
  return { success: true, data }
}

// ============================================================================
// Delete Operations
// ============================================================================

/**
 * Delete a single contact
 */
export async function deleteContact(id: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting contact:', error)
    return { error: 'Error al eliminar el contacto' }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

/**
 * Delete multiple contacts
 */
export async function deleteContacts(ids: string[]): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  if (ids.length === 0) {
    return { error: 'No se seleccionaron contactos' }
  }

  const { error } = await supabase
    .from('contacts')
    .delete()
    .in('id', ids)

  if (error) {
    console.error('Error deleting contacts:', error)
    return { error: 'Error al eliminar los contactos' }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

// ============================================================================
// Tag Operations
// ============================================================================

/**
 * Add a tag to a contact
 */
export async function addTagToContact(contactId: string, tagId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('contact_tags')
    .insert({ contact_id: contactId, tag_id: tagId })

  if (error) {
    // Ignore duplicate constraint violation (tag already added)
    if (error.code === '23505') {
      return { success: true, data: undefined }
    }
    console.error('Error adding tag to contact:', error)
    return { error: 'Error al agregar la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${contactId}`)
  return { success: true, data: undefined }
}

/**
 * Remove a tag from a contact
 */
export async function removeTagFromContact(contactId: string, tagId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const { error } = await supabase
    .from('contact_tags')
    .delete()
    .eq('contact_id', contactId)
    .eq('tag_id', tagId)

  if (error) {
    console.error('Error removing tag from contact:', error)
    return { error: 'Error al quitar la etiqueta' }
  }

  revalidatePath('/crm/contactos')
  revalidatePath(`/crm/contactos/${contactId}`)
  return { success: true, data: undefined }
}

/**
 * Add a tag to multiple contacts
 */
export async function bulkAddTag(contactIds: string[], tagId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  if (contactIds.length === 0) {
    return { error: 'No se seleccionaron contactos' }
  }

  // Insert all contact_tag entries (ignore duplicates)
  const entries = contactIds.map(contactId => ({
    contact_id: contactId,
    tag_id: tagId
  }))

  const { error } = await supabase
    .from('contact_tags')
    .upsert(entries, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })

  if (error) {
    console.error('Error bulk adding tag:', error)
    return { error: 'Error al agregar la etiqueta a los contactos' }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

/**
 * Remove a tag from multiple contacts
 */
export async function bulkRemoveTag(contactIds: string[], tagId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  if (contactIds.length === 0) {
    return { error: 'No se seleccionaron contactos' }
  }

  const { error } = await supabase
    .from('contact_tags')
    .delete()
    .in('contact_id', contactIds)
    .eq('tag_id', tagId)

  if (error) {
    console.error('Error bulk removing tag:', error)
    return { error: 'Error al quitar la etiqueta de los contactos' }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: undefined }
}

// ============================================================================
// CSV Import Operations
// ============================================================================

export interface BulkCreateContact {
  name: string
  phone: string
  email?: string
  city?: string
  address?: string
  custom_fields?: Record<string, unknown>
}

export interface BulkCreateResult {
  created: number
  errors: { row: number; error: string }[]
}

/**
 * Get all phone numbers in the current workspace
 * Used for duplicate detection during CSV import
 */
export async function getExistingPhones(): Promise<string[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return []
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('phone')

  if (error) {
    console.error('Error fetching existing phones:', error)
    return []
  }

  return data?.map(c => c.phone) || []
}

/**
 * Bulk create contacts from CSV import
 * Inserts contacts in batches of 100 for performance
 * Returns count of created contacts and any errors
 */
export async function bulkCreateContacts(
  contacts: BulkCreateContact[]
): Promise<ActionResult<BulkCreateResult>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  const cookieStore = await cookies()
  const workspaceId = cookieStore.get('morfx_workspace')?.value
  if (!workspaceId) {
    return { error: 'No hay workspace seleccionado' }
  }

  if (contacts.length === 0) {
    return { success: true, data: { created: 0, errors: [] } }
  }

  const result: BulkCreateResult = { created: 0, errors: [] }
  const BATCH_SIZE = 100

  // Process in batches
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE)

    const insertData = batch.map((contact, batchIndex) => ({
      workspace_id: workspaceId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email || null,
      city: contact.city || null,
      address: contact.address || null,
      custom_fields: contact.custom_fields || {},
    }))

    const { data: inserted, error } = await supabase
      .from('contacts')
      .insert(insertData)
      .select('id')

    if (error) {
      // If batch insert fails, try individual inserts to identify specific failures
      console.error('Batch insert failed, trying individual inserts:', error)

      for (let j = 0; j < batch.length; j++) {
        const contact = batch[j]
        const rowNum = i + j + 1

        const { error: singleError } = await supabase
          .from('contacts')
          .insert({
            workspace_id: workspaceId,
            name: contact.name,
            phone: contact.phone,
            email: contact.email || null,
            city: contact.city || null,
            address: contact.address || null,
            custom_fields: contact.custom_fields || {},
          })

        if (singleError) {
          const errorMsg = singleError.code === '23505'
            ? 'Telefono duplicado'
            : 'Error al crear contacto'
          result.errors.push({ row: rowNum, error: errorMsg })
        } else {
          result.created++
        }
      }
    } else {
      result.created += inserted?.length || 0
    }
  }

  revalidatePath('/crm/contactos')
  return { success: true, data: result }
}

/**
 * Update an existing contact by phone number
 * Used for "update" option in duplicate resolution during CSV import
 */
export async function updateContactByPhone(
  phone: string,
  data: {
    name?: string
    email?: string
    city?: string
    address?: string
    custom_fields?: Record<string, unknown>
  }
): Promise<ActionResult<Contact>> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'No autenticado' }
  }

  // Build update object, only include non-undefined fields
  const updates: Record<string, unknown> = {}
  if (data.name !== undefined) updates.name = data.name
  if (data.email !== undefined) updates.email = data.email || null
  if (data.city !== undefined) updates.city = data.city || null
  if (data.address !== undefined) updates.address = data.address || null
  if (data.custom_fields !== undefined) updates.custom_fields = data.custom_fields

  if (Object.keys(updates).length === 0) {
    return { error: 'No hay campos para actualizar' }
  }

  const { data: updated, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('phone', phone)
    .select()
    .single()

  if (error) {
    console.error('Error updating contact by phone:', error)
    return { error: 'Error al actualizar el contacto' }
  }

  revalidatePath('/crm/contactos')
  if (updated) {
    revalidatePath(`/crm/contactos/${updated.id}`)
  }
  return { success: true, data: updated }
}

/**
 * Get a contact by phone number
 * Used to fetch existing contact details for duplicate resolution UI
 */
export async function getContactByPhone(phone: string): Promise<Contact | null> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return null
  }

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('phone', phone)
    .single()

  if (error) {
    return null
  }

  return data
}
