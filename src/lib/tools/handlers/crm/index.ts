// src/lib/tools/handlers/crm/index.ts
//
// Real CRM Tool Handlers — Phase 12 Plan 02
//
// All handlers use createAdminClient (bypasses RLS) and filter by workspace_id.
// Returns ToolResult<T> for every operation — never throws.
// Does NOT call revalidatePath() or cookies() — tool handlers run outside React context.

import type { ToolHandler, ExecutionContext, ToolResult } from '../../types'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizePhone } from '@/lib/utils/phone'
import {
  createContact as domainCreateContact,
  updateContact as domainUpdateContact,
  deleteContact as domainDeleteContact,
} from '@/lib/domain/contacts'
import {
  assignTag as domainAssignTag,
  removeTag as domainRemoveTag,
} from '@/lib/domain/tags'

// ============================================================================
// Input Types (what each handler receives from the agent/executor)
// ============================================================================

interface ContactCreateInput {
  name: string
  phone: string
  email?: string
  address?: string
  city?: string
  tags?: string[] // tag names, not IDs
}

interface ContactUpdateInput {
  contactId: string
  name?: string
  phone?: string
  email?: string
  address?: string
  city?: string
}

interface ContactReadInput {
  contactId: string
}

interface ContactListInput {
  page?: number
  pageSize?: number
  search?: string
  tags?: string[] // tag names to filter by
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface ContactDeleteInput {
  contactId: string
}

interface TagAddInput {
  contactId: string
  tag: string // tag name
}

interface TagRemoveInput {
  contactId: string
  tag: string // tag name
}

interface OrderCreateInput {
  contactId: string
  products: Array<{
    name: string
    quantity: number
    price: number
  }>
  shippingAddress?: string
  notes?: string
  stageName?: string
}

interface OrderUpdateStatusInput {
  orderId: string
  status: string // stage name or stage UUID
}

// ============================================================================
// Helper: UUID detection
// ============================================================================

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ============================================================================
// Contact Handlers
// ============================================================================

/**
 * crm.contact.create — Create a new contact in the workspace
 *
 * Normalizes phone to E.164, handles duplicate phone (23505),
 * optionally assigns tags (find-or-create by name).
 */
const contactCreate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as ContactCreateInput

  // Validate required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'NAME_REQUIRED',
        message: 'El nombre del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (!data.phone || typeof data.phone !== 'string') {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'PHONE_REQUIRED',
        message: 'El numero de telefono es requerido',
        retryable: false,
      },
    }
  }

  // Normalize phone
  const normalizedPhone = normalizePhone(data.phone)
  if (!normalizedPhone) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'PHONE_INVALID',
        message: 'Numero de telefono invalido. Debe ser un numero colombiano valido',
        suggestion: 'Formatos aceptados: 3001234567, +573001234567, 57-300-123-4567',
        retryable: false,
      },
    }
  }

  // Dry run: return preview
  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        name: data.name.trim(),
        phone: normalizedPhone,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        tags: data.tags || [],
        workspace_id: context.workspaceId,
      },
    }
  }

  // Delegate to domain (handles DB insert + trigger emission)
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainCreateContact(ctx, {
    name: data.name.trim(),
    phone: data.phone,
    email: data.email || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    tags: data.tags,
  })

  if (!result.success) {
    if (result.error?.includes('telefono')) {
      return {
        success: false,
        error: {
          type: 'duplicate',
          code: 'PHONE_DUPLICATE',
          message: 'Ya existe un contacto con este numero de telefono',
          suggestion: 'Use crm.contact.read para buscar el contacto existente',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'INSERT_FAILED',
        message: result.error || 'Error al crear el contacto',
        retryable: true,
      },
    }
  }

  // Re-read full contact for response
  const supabase = createAdminClient()
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', result.data!.contactId)
    .single()

  return {
    success: true,
    data: contact,
    resource_url: `/crm/contactos/${result.data!.contactId}`,
  }
}

/**
 * crm.contact.update — Update an existing contact
 *
 * Only updates provided fields. Normalizes phone if changed.
 * Returns updated contact with list of changed fields.
 */
const contactUpdate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as ContactUpdateInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  // Build update object from only provided fields
  const updates: Record<string, unknown> = {}
  const changedFields: string[] = []

  if (data.name !== undefined) {
    updates.name = data.name.trim()
    changedFields.push('name')
  }

  if (data.phone !== undefined) {
    const normalizedPhone = normalizePhone(data.phone)
    if (!normalizedPhone) {
      return {
        success: false,
        error: {
          type: 'validation_error',
          code: 'PHONE_INVALID',
          message: 'Numero de telefono invalido. Debe ser un numero colombiano valido',
          retryable: false,
        },
      }
    }
    updates.phone = normalizedPhone
    changedFields.push('phone')
  }

  if (data.email !== undefined) {
    updates.email = data.email || null
    changedFields.push('email')
  }

  if (data.address !== undefined) {
    updates.address = data.address || null
    changedFields.push('address')
  }

  if (data.city !== undefined) {
    updates.city = data.city || null
    changedFields.push('city')
  }

  if (changedFields.length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'NO_FIELDS_TO_UPDATE',
        message: 'No se proporcionaron campos para actualizar',
        retryable: false,
      },
    }
  }

  // Dry run: return preview
  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        updates,
        changedFields,
      },
    }
  }

  // Delegate to domain (handles DB update + field.changed trigger emission)
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainUpdateContact(ctx, {
    contactId: data.contactId,
    name: data.name?.trim(),
    phone: data.phone,
    email: data.email,
    address: data.address,
    city: data.city,
  })

  if (!result.success) {
    if (result.error?.includes('telefono')) {
      return {
        success: false,
        error: {
          type: 'duplicate',
          code: 'PHONE_DUPLICATE',
          message: 'Ya existe un contacto con este numero de telefono',
          suggestion: 'Use crm.contact.read para buscar el contacto existente',
          retryable: false,
        },
      }
    }
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'CONTACT_NOT_FOUND',
          message: 'Contacto no encontrado',
          suggestion: 'Verifique el ID del contacto con crm.contact.list',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'UPDATE_FAILED',
        message: result.error || 'Error al actualizar el contacto',
        retryable: true,
      },
    }
  }

  // Re-read full contact for response
  const supabase = createAdminClient()
  const { data: updatedContact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', data.contactId)
    .single()

  return {
    success: true,
    data: {
      ...updatedContact,
      changedFields,
    },
    resource_url: `/crm/contactos/${data.contactId}`,
  }
}

/**
 * crm.contact.read — Retrieve a contact by ID with tags
 *
 * Returns full contact data including associated tags.
 */
const contactRead: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as ContactReadInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  const supabase = createAdminClient()

  // Fetch contact
  const { data: contact, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', data.contactId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (error || !contact) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'CONTACT_NOT_FOUND',
        message: 'Contacto no encontrado',
        retryable: false,
      },
    }
  }

  // Fetch tags for this contact
  const { data: contactTags } = await supabase
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', data.contactId)

  const tagIds = contactTags?.map((ct) => ct.tag_id) || []
  let tags: Array<{ id: string; name: string; color: string }> = []

  if (tagIds.length > 0) {
    const { data: tagRecords } = await supabase
      .from('tags')
      .select('id, name, color')
      .in('id', tagIds)

    tags = tagRecords || []
  }

  return {
    success: true,
    data: {
      contact: {
        ...contact,
        tags,
      },
    },
    resource_url: `/crm/contactos/${contact.id}`,
  }
}

/**
 * crm.contact.list — List contacts with pagination, search, and tag filters
 *
 * Supports search by name/phone/email, filter by tag names,
 * pagination, and sorting.
 */
const contactList: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as ContactListInput

  const page = data.page ?? 1
  const pageSize = Math.min(data.pageSize ?? 20, 100) // cap at 100
  const sortBy = data.sortBy ?? 'created_at'
  const sortOrder = data.sortOrder ?? 'desc'
  const offset = (page - 1) * pageSize

  const supabase = createAdminClient()

  // If tag filter is provided, get contact IDs that have ALL specified tags
  let tagFilterContactIds: string[] | null = null

  if (data.tags && data.tags.length > 0) {
    // Resolve tag names to IDs within the workspace
    const { data: matchingTags } = await supabase
      .from('tags')
      .select('id')
      .eq('workspace_id', context.workspaceId)
      .in('name', data.tags)

    const matchingTagIds = matchingTags?.map((t) => t.id) || []

    if (matchingTagIds.length === 0) {
      // No matching tags found — return empty result
      return {
        success: true,
        data: {
          contacts: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        },
      }
    }

    // Find contacts that have ALL specified tags
    const { data: contactTagRows } = await supabase
      .from('contact_tags')
      .select('contact_id, tag_id')
      .in('tag_id', matchingTagIds)

    // Group by contact_id, keep only contacts with all tags
    const contactTagCounts = new Map<string, number>()
    for (const row of contactTagRows || []) {
      const count = contactTagCounts.get(row.contact_id) || 0
      contactTagCounts.set(row.contact_id, count + 1)
    }

    tagFilterContactIds = []
    for (const [contactId, count] of contactTagCounts) {
      if (count >= matchingTagIds.length) {
        tagFilterContactIds.push(contactId)
      }
    }

    if (tagFilterContactIds.length === 0) {
      return {
        success: true,
        data: {
          contacts: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        },
      }
    }
  }

  // Build main query
  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .eq('workspace_id', context.workspaceId)

  // Apply tag filter
  if (tagFilterContactIds !== null) {
    query = query.in('id', tagFilterContactIds)
  }

  // Apply search filter
  if (data.search && data.search.trim().length > 0) {
    const searchTerm = data.search.trim()
    query = query.or(
      `name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`
    )
  }

  // Apply sort
  const ascending = sortOrder === 'asc'
  query = query.order(sortBy, { ascending })

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1)

  const { data: contacts, error, count } = await query

  if (error) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'LIST_FAILED',
        message: `Error al listar contactos: ${error.message}`,
        retryable: true,
      },
    }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / pageSize)

  return {
    success: true,
    data: {
      contacts: contacts || [],
      total,
      page,
      pageSize,
      totalPages,
    },
  }
}

/**
 * crm.contact.delete — Delete a contact from the workspace
 *
 * Verifies contact belongs to workspace before deletion.
 */
const contactDelete: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as ContactDeleteInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        action: 'delete',
      },
    }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainDeleteContact(ctx, { contactId: data.contactId })

  if (!result.success) {
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'CONTACT_NOT_FOUND',
          message: 'Contacto no encontrado',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'DELETE_FAILED',
        message: result.error || 'Error al eliminar el contacto',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      contactId: data.contactId,
      deleted: true,
    },
  }
}

// ============================================================================
// Tag Handlers
// ============================================================================

/**
 * crm.tag.add — Add a tag to a contact (find-or-create tag by name)
 *
 * Creates the tag if it doesn't exist in the workspace.
 * Returns success with alreadyHadTag=true if tag was already assigned.
 */
const tagAdd: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as TagAddInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (!data.tag || typeof data.tag !== 'string' || data.tag.trim().length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'TAG_NAME_REQUIRED',
        message: 'El nombre de la etiqueta es requerido',
        retryable: false,
      },
    }
  }

  const tagName = data.tag.trim()

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        tag: tagName,
        action: 'add_tag',
      },
    }
  }

  // Delegate to domain (handles tag lookup, junction insert, trigger emission)
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainAssignTag(ctx, {
    entityType: 'contact',
    entityId: data.contactId,
    tagName,
  })

  if (!result.success) {
    if (result.error?.includes('no encontrad')) {
      // Could be contact or tag not found
      return {
        success: false,
        error: {
          type: 'not_found',
          code: result.error.includes('Etiqueta') ? 'TAG_NOT_FOUND' : 'CONTACT_NOT_FOUND',
          message: result.error,
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'TAG_LINK_FAILED',
        message: result.error || 'Error al asignar la etiqueta',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      contactId: data.contactId,
      tag: tagName,
      tagId: result.data!.tagId,
      added: true,
      alreadyHadTag: false,
    },
  }
}

/**
 * crm.tag.remove — Remove a tag from a contact (by tag name)
 *
 * Finds the tag by name in the workspace, then removes the link.
 */
const tagRemove: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as TagRemoveInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (!data.tag || typeof data.tag !== 'string' || data.tag.trim().length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'TAG_NAME_REQUIRED',
        message: 'El nombre de la etiqueta es requerido',
        retryable: false,
      },
    }
  }

  const tagName = data.tag.trim()

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        tag: tagName,
        action: 'remove_tag',
      },
    }
  }

  // Delegate to domain (handles tag lookup, junction delete, trigger emission)
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainRemoveTag(ctx, {
    entityType: 'contact',
    entityId: data.contactId,
    tagName,
  })

  if (!result.success) {
    if (result.error?.includes('no encontrad')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'TAG_NOT_FOUND',
          message: result.error,
          suggestion: 'Verifique el nombre exacto de la etiqueta',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'TAG_REMOVE_FAILED',
        message: result.error || 'Error al quitar la etiqueta',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      contactId: data.contactId,
      tag: tagName,
      removed: true,
      hadTag: true,
    },
  }
}

// ============================================================================
// Order Handlers — via domain/orders
// Phase 18: All order mutations delegate to domain layer.
// ============================================================================

import {
  createOrder as domainCreateOrder,
  updateOrder as domainUpdateOrder,
  moveOrderToStage as domainMoveOrderToStage,
  deleteOrder as domainDeleteOrder,
  duplicateOrder as domainDuplicateOrder,
} from '@/lib/domain/orders'
import {
  createTask as domainCreateTask,
  updateTask as domainUpdateTask,
  completeTask as domainCompleteTask,
} from '@/lib/domain/tasks'
import {
  createNote as domainCreateNote,
  deleteNote as domainDeleteNote,
} from '@/lib/domain/notes'
import {
  updateCustomFieldValues as domainUpdateCustomFieldValues,
  readCustomFieldValues as domainReadCustomFieldValues,
} from '@/lib/domain/custom-fields'
import type { DomainContext } from '@/lib/domain/types'

// Additional input types for new handlers
interface OrderUpdateInput {
  orderId: string
  contactId?: string
  description?: string
  carrier?: string
  trackingNumber?: string
  shippingAddress?: string
  shippingCity?: string
}

interface OrderDeleteInput {
  orderId: string
}

interface OrderDuplicateInput {
  sourceOrderId: string
  targetPipelineId: string
  targetStageId?: string
}

interface OrderListInput {
  pipelineId?: string
  stageId?: string
  contactId?: string
  page?: number
  pageSize?: number
}

/**
 * crm.order.create — Create an order with products atomically.
 * Delegates to domain/orders.createOrder for DB logic + trigger emission.
 * Keeps validation, contact verification, pipeline/stage resolution as handler concern.
 */
const orderCreate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as OrderCreateInput

  // Validate required fields
  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (!data.products || data.products.length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'PRODUCTS_REQUIRED',
        message: 'Se requiere al menos un producto',
        retryable: false,
      },
    }
  }

  // Validate products
  for (let i = 0; i < data.products.length; i++) {
    const p = data.products[i]
    if (!p.name || typeof p.name !== 'string') {
      return {
        success: false,
        error: {
          type: 'validation_error',
          code: 'PRODUCT_NAME_REQUIRED',
          message: `Producto ${i + 1}: el nombre es requerido`,
          retryable: false,
        },
      }
    }
    if (typeof p.quantity !== 'number' || p.quantity < 1) {
      return {
        success: false,
        error: {
          type: 'validation_error',
          code: 'PRODUCT_QUANTITY_INVALID',
          message: `Producto ${i + 1}: la cantidad debe ser al menos 1`,
          retryable: false,
        },
      }
    }
    if (typeof p.price !== 'number' || p.price < 0) {
      return {
        success: false,
        error: {
          type: 'validation_error',
          code: 'PRODUCT_PRICE_INVALID',
          message: `Producto ${i + 1}: el precio debe ser mayor o igual a 0`,
          retryable: false,
        },
      }
    }
  }

  const supabase = createAdminClient()

  // Verify contact exists in workspace
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id, name')
    .eq('id', data.contactId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (contactError || !contact) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'CONTACT_NOT_FOUND',
        message: 'Contacto no encontrado',
        suggestion: 'Verifique el ID del contacto con crm.contact.list',
        retryable: false,
      },
    }
  }

  // Get default pipeline and first stage
  const { data: pipeline } = await supabase
    .from('pipelines')
    .select('id')
    .eq('workspace_id', context.workspaceId)
    .eq('is_default', true)
    .single()

  // Fall back to any pipeline if no default
  const pipelineId =
    pipeline?.id ??
    (
      await supabase
        .from('pipelines')
        .select('id')
        .eq('workspace_id', context.workspaceId)
        .limit(1)
        .single()
    ).data?.id

  if (!pipelineId) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'NO_PIPELINE',
        message: 'No hay pipeline configurado en el workspace',
        suggestion: 'Cree un pipeline desde Configuracion > Pedidos',
        retryable: false,
      },
    }
  }

  // Get target stage: by name if provided, otherwise first by position
  let targetStageId: string | null = null

  if (data.stageName) {
    const { data: namedStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .ilike('name', data.stageName)
      .single()

    if (namedStage) {
      targetStageId = namedStage.id
    }
  }

  if (!targetStageId) {
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .order('position', { ascending: true })
      .limit(1)
      .single()

    targetStageId = firstStage?.id ?? null
  }

  if (!targetStageId) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'NO_STAGE',
        message: 'No hay etapas configuradas en el pipeline',
        suggestion: 'Configure etapas en el pipeline desde Configuracion > Pedidos',
        retryable: false,
      },
    }
  }

  // Calculate preview total
  const previewTotal = data.products.reduce(
    (sum, p) => sum + p.price * p.quantity,
    0
  )

  // Dry run: return preview
  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        contactName: contact.name,
        pipelineId,
        stageId: targetStageId,
        products: data.products,
        estimatedTotal: previewTotal,
        shippingAddress: data.shippingAddress || null,
        notes: data.notes || null,
      },
    }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainCreateOrder(ctx, {
    pipelineId,
    stageId: targetStageId,
    contactId: data.contactId,
    shippingAddress: data.shippingAddress,
    description: data.notes,
    products: data.products.map((p) => ({
      sku: p.name.substring(0, 50).toUpperCase().replace(/\s+/g, '-'),
      title: p.name,
      unitPrice: p.price,
      quantity: p.quantity,
    })),
  })

  if (!result.success) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'ORDER_CREATE_FAILED',
        message: result.error || 'Error al crear el pedido',
        retryable: true,
      },
    }
  }

  // Fetch products for response
  const { data: insertedProducts } = await supabase
    .from('order_products')
    .select('id, sku, title, unit_price, quantity, subtotal')
    .eq('order_id', result.data!.orderId)

  // Re-read total value
  const { data: completeOrder } = await supabase
    .from('orders')
    .select('total_value, created_at')
    .eq('id', result.data!.orderId)
    .single()

  return {
    success: true,
    data: {
      orderId: result.data!.orderId,
      total: completeOrder?.total_value ?? previewTotal,
      contactId: data.contactId,
      stageId: result.data!.stageId,
      pipelineId,
      products: insertedProducts || [],
      created_at: completeOrder?.created_at,
    },
    resource_url: '/crm/pedidos',
  }
}

/**
 * crm.order.updateStatus — Move an order to a new pipeline stage.
 * Delegates to domain/orders.moveOrderToStage.
 * Keeps stage name/UUID resolution as handler concern (agent-friendly interface).
 */
const orderUpdateStatus: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as OrderUpdateStatusInput

  if (!data.orderId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'ORDER_ID_REQUIRED',
        message: 'El ID del pedido es requerido',
        retryable: false,
      },
    }
  }

  if (!data.status) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'STATUS_REQUIRED',
        message: 'El nuevo estado es requerido',
        retryable: false,
      },
    }
  }

  const supabase = createAdminClient()

  // Verify order exists and belongs to workspace
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, stage_id, pipeline_id')
    .eq('id', data.orderId)
    .eq('workspace_id', context.workspaceId)
    .single()

  if (orderError || !order) {
    return {
      success: false,
      error: {
        type: 'not_found',
        code: 'ORDER_NOT_FOUND',
        message: 'Pedido no encontrado',
        retryable: false,
      },
    }
  }

  // Resolve stage: by UUID or by name (handler concern — agent-friendly)
  let newStageId: string
  let newStageName: string

  if (UUID_REGEX.test(data.status)) {
    const { data: stage, error: stageError } = await supabase
      .from('pipeline_stages')
      .select('id, name')
      .eq('id', data.status)
      .eq('pipeline_id', order.pipeline_id)
      .single()

    if (stageError || !stage) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'STAGE_NOT_FOUND',
          message: 'Etapa no encontrada en el pipeline del pedido',
          suggestion: 'Verifique que la etapa pertenece al mismo pipeline del pedido',
          retryable: false,
        },
      }
    }
    newStageId = stage.id
    newStageName = stage.name
  } else {
    const { data: stage, error: stageError } = await supabase
      .from('pipeline_stages')
      .select('id, name')
      .eq('pipeline_id', order.pipeline_id)
      .ilike('name', data.status)
      .single()

    if (stageError || !stage) {
      const { data: availableStages } = await supabase
        .from('pipeline_stages')
        .select('name')
        .eq('pipeline_id', order.pipeline_id)
        .order('position', { ascending: true })

      const stageNames = availableStages?.map((s) => s.name).join(', ') || 'ninguna'

      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'STAGE_NOT_FOUND',
          message: `Etapa "${data.status}" no encontrada en el pipeline del pedido`,
          suggestion: `Etapas disponibles: ${stageNames}`,
          retryable: false,
        },
      }
    }
    newStageId = stage.id
    newStageName = stage.name
  }

  // Get previous stage name for the response
  const { data: previousStage } = await supabase
    .from('pipeline_stages')
    .select('name')
    .eq('id', order.stage_id)
    .single()

  // Dry run: return preview
  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        orderId: data.orderId,
        previousStatus: previousStage?.name || order.stage_id,
        newStatus: newStageName,
        newStageId,
      },
    }
  }

  // Delegate to domain
  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainMoveOrderToStage(ctx, { orderId: data.orderId, newStageId })

  if (!result.success) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'STATUS_UPDATE_FAILED',
        message: result.error || 'Error al actualizar el estado',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      orderId: data.orderId,
      previousStatus: previousStage?.name || order.stage_id,
      newStatus: newStageName,
      newStageId,
      updated: true,
    },
    resource_url: '/crm/pedidos',
  }
}

/**
 * crm.order.update — Update order fields.
 * Delegates to domain/orders.updateOrder.
 */
const orderUpdate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as OrderUpdateInput

  if (!data.orderId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'ORDER_ID_REQUIRED',
        message: 'El ID del pedido es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        orderId: data.orderId,
        updates: {
          contactId: data.contactId,
          description: data.description,
          carrier: data.carrier,
          trackingNumber: data.trackingNumber,
          shippingAddress: data.shippingAddress,
          shippingCity: data.shippingCity,
        },
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainUpdateOrder(ctx, {
    orderId: data.orderId,
    contactId: data.contactId,
    description: data.description,
    carrier: data.carrier,
    trackingNumber: data.trackingNumber,
    shippingAddress: data.shippingAddress,
    shippingCity: data.shippingCity,
  })

  if (!result.success) {
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'ORDER_NOT_FOUND',
          message: result.error,
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'ORDER_UPDATE_FAILED',
        message: result.error || 'Error al actualizar el pedido',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      orderId: data.orderId,
      updated: true,
    },
    resource_url: '/crm/pedidos',
  }
}

/**
 * crm.order.delete — Delete an order.
 * Delegates to domain/orders.deleteOrder.
 */
const orderDelete: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as OrderDeleteInput

  if (!data.orderId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'ORDER_ID_REQUIRED',
        message: 'El ID del pedido es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        orderId: data.orderId,
        action: 'delete',
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainDeleteOrder(ctx, { orderId: data.orderId })

  if (!result.success) {
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'ORDER_NOT_FOUND',
          message: result.error,
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'ORDER_DELETE_FAILED',
        message: result.error || 'Error al eliminar el pedido',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      orderId: data.orderId,
      deleted: true,
    },
  }
}

/**
 * crm.order.duplicate — Duplicate an order to a target pipeline.
 * Delegates to domain/orders.duplicateOrder.
 */
const orderDuplicate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as OrderDuplicateInput

  if (!data.sourceOrderId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'SOURCE_ORDER_ID_REQUIRED',
        message: 'El ID del pedido origen es requerido',
        retryable: false,
      },
    }
  }

  if (!data.targetPipelineId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'TARGET_PIPELINE_ID_REQUIRED',
        message: 'El ID del pipeline destino es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        sourceOrderId: data.sourceOrderId,
        targetPipelineId: data.targetPipelineId,
        targetStageId: data.targetStageId || null,
        action: 'duplicate',
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainDuplicateOrder(ctx, {
    sourceOrderId: data.sourceOrderId,
    targetPipelineId: data.targetPipelineId,
    targetStageId: data.targetStageId,
  })

  if (!result.success) {
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'ORDER_NOT_FOUND',
          message: result.error,
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'ORDER_DUPLICATE_FAILED',
        message: result.error || 'Error al duplicar el pedido',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      orderId: result.data!.orderId,
      sourceOrderId: result.data!.sourceOrderId,
      duplicated: true,
    },
    resource_url: '/crm/pedidos',
  }
}

/**
 * crm.order.list — List orders with filters (read-only).
 * Direct DB query — no domain function needed for reads.
 */
const orderList: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as OrderListInput

  const page = data.page ?? 1
  const pageSize = Math.min(data.pageSize ?? 20, 100)
  const offset = (page - 1) * pageSize

  const supabase = createAdminClient()

  let query = supabase
    .from('orders')
    .select(
      'id, total_value, created_at, contact_id, pipeline_id, stage_id, description, carrier, tracking_number, shipping_address, shipping_city',
      { count: 'exact' }
    )
    .eq('workspace_id', context.workspaceId)

  if (data.pipelineId) {
    query = query.eq('pipeline_id', data.pipelineId)
  }
  if (data.stageId) {
    query = query.eq('stage_id', data.stageId)
  }
  if (data.contactId) {
    query = query.eq('contact_id', data.contactId)
  }

  query = query.order('created_at', { ascending: false })
  query = query.range(offset, offset + pageSize - 1)

  const { data: orders, error, count } = await query

  if (error) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'LIST_FAILED',
        message: `Error al listar pedidos: ${error.message}`,
        retryable: true,
      },
    }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / pageSize)

  return {
    success: true,
    data: {
      orders: orders || [],
      total,
      page,
      pageSize,
      totalPages,
    },
  }
}

// ============================================================================
// Task Handlers — via domain/tasks
// Phase 18: Task mutations delegate to domain layer.
// ============================================================================

interface TaskCreateInput {
  title: string
  description?: string
  dueDate?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  contactId?: string
  orderId?: string
}

interface TaskUpdateInput {
  taskId: string
  title?: string
  description?: string
  dueDate?: string | null
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  status?: 'pending' | 'in_progress' | 'completed'
}

interface TaskCompleteInput {
  taskId: string
}

interface TaskListInput {
  contactId?: string
  orderId?: string
  status?: string
  priority?: string
  page?: number
  pageSize?: number
}

/**
 * crm.task.create — Create a new task.
 * Delegates to domain/tasks.createTask.
 */
const taskCreate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as TaskCreateInput

  if (!data.title || typeof data.title !== 'string' || data.title.trim().length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'TITLE_REQUIRED',
        message: 'El titulo de la tarea es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        title: data.title.trim(),
        description: data.description || null,
        dueDate: data.dueDate || null,
        priority: data.priority || 'medium',
        contactId: data.contactId || null,
        orderId: data.orderId || null,
        workspace_id: context.workspaceId,
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainCreateTask(ctx, {
    title: data.title.trim(),
    description: data.description || undefined,
    dueDate: data.dueDate || undefined,
    priority: data.priority || undefined,
    contactId: data.contactId || undefined,
    orderId: data.orderId || undefined,
  })

  if (!result.success) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'TASK_CREATE_FAILED',
        message: result.error || 'Error al crear la tarea',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      taskId: result.data!.taskId,
      created: true,
    },
    resource_url: '/tareas',
  }
}

/**
 * crm.task.update — Update an existing task.
 * Delegates to domain/tasks.updateTask.
 */
const taskUpdate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as TaskUpdateInput

  if (!data.taskId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'TASK_ID_REQUIRED',
        message: 'El ID de la tarea es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        taskId: data.taskId,
        updates: {
          title: data.title,
          description: data.description,
          dueDate: data.dueDate,
          priority: data.priority,
          status: data.status,
        },
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainUpdateTask(ctx, {
    taskId: data.taskId,
    title: data.title,
    description: data.description,
    dueDate: data.dueDate,
    priority: data.priority,
    status: data.status,
  })

  if (!result.success) {
    if (result.error?.includes('no encontrada')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'TASK_NOT_FOUND',
          message: 'Tarea no encontrada',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'TASK_UPDATE_FAILED',
        message: result.error || 'Error al actualizar la tarea',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      taskId: data.taskId,
      updated: true,
    },
    resource_url: '/tareas',
  }
}

/**
 * crm.task.complete — Mark a task as completed.
 * Delegates to domain/tasks.completeTask.
 */
const taskComplete: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as TaskCompleteInput

  if (!data.taskId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'TASK_ID_REQUIRED',
        message: 'El ID de la tarea es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        taskId: data.taskId,
        action: 'complete',
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainCompleteTask(ctx, { taskId: data.taskId })

  if (!result.success) {
    if (result.error?.includes('no encontrada')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'TASK_NOT_FOUND',
          message: 'Tarea no encontrada',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'TASK_COMPLETE_FAILED',
        message: result.error || 'Error al completar la tarea',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      taskId: data.taskId,
      completed: true,
    },
    resource_url: '/tareas',
  }
}

/**
 * crm.task.list — List tasks with filters (read-only).
 * Direct DB query — no domain function needed for reads.
 */
const taskList: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as TaskListInput

  const page = data.page ?? 1
  const pageSize = Math.min(data.pageSize ?? 20, 100)
  const offset = (page - 1) * pageSize

  const supabase = createAdminClient()

  let query = supabase
    .from('tasks')
    .select(
      'id, title, description, due_date, priority, status, completed_at, contact_id, order_id, assigned_to, created_at',
      { count: 'exact' }
    )
    .eq('workspace_id', context.workspaceId)

  if (data.contactId) {
    query = query.eq('contact_id', data.contactId)
  }
  if (data.orderId) {
    query = query.eq('order_id', data.orderId)
  }
  if (data.status) {
    query = query.eq('status', data.status)
  }
  if (data.priority) {
    query = query.eq('priority', data.priority)
  }

  query = query.order('due_date', { ascending: true, nullsFirst: false })
  query = query.order('created_at', { ascending: false })
  query = query.range(offset, offset + pageSize - 1)

  const { data: tasks, error, count } = await query

  if (error) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'LIST_FAILED',
        message: `Error al listar tareas: ${error.message}`,
        retryable: true,
      },
    }
  }

  const total = count ?? 0
  const totalPages = Math.ceil(total / pageSize)

  return {
    success: true,
    data: {
      tasks: tasks || [],
      total,
      page,
      pageSize,
      totalPages,
    },
  }
}

// ============================================================================
// Note Handlers — via domain/notes
// Phase 18: Note mutations delegate to domain layer.
// ============================================================================

interface NoteCreateInput {
  contactId: string
  content: string
}

interface NoteListInput {
  contactId: string
  page?: number
  pageSize?: number
}

interface NoteDeleteInput {
  noteId: string
}

/**
 * crm.note.create — Create a note on a contact.
 * Delegates to domain/notes.createNote.
 */
const noteCreate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as NoteCreateInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (!data.content || typeof data.content !== 'string' || data.content.trim().length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTENT_REQUIRED',
        message: 'El contenido de la nota es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        content: data.content.trim().substring(0, 100),
        action: 'create_note',
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainCreateNote(ctx, {
    contactId: data.contactId,
    content: data.content.trim(),
    createdBy: 'bot',
  })

  if (!result.success) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'NOTE_CREATE_FAILED',
        message: result.error || 'Error al crear la nota',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      noteId: result.data!.noteId,
      created: true,
    },
    resource_url: `/crm/contactos/${data.contactId}`,
  }
}

/**
 * crm.note.list — List notes for a contact (read-only).
 * Direct DB query — no domain function needed for reads.
 */
const noteList: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as NoteListInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  const page = data.page ?? 1
  const pageSize = Math.min(data.pageSize ?? 20, 100)
  const offset = (page - 1) * pageSize

  const supabase = createAdminClient()

  const { data: notes, error, count } = await supabase
    .from('contact_notes')
    .select('id, content, user_id, created_at', { count: 'exact' })
    .eq('contact_id', data.contactId)
    .eq('workspace_id', context.workspaceId)
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'LIST_FAILED',
        message: `Error al listar notas: ${error.message}`,
        retryable: true,
      },
    }
  }

  const total = count ?? 0

  return {
    success: true,
    data: {
      notes: notes || [],
      total,
      page,
      pageSize,
    },
  }
}

/**
 * crm.note.delete — Delete a note from a contact.
 * Delegates to domain/notes.deleteNote.
 */
const noteDelete: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as NoteDeleteInput

  if (!data.noteId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'NOTE_ID_REQUIRED',
        message: 'El ID de la nota es requerido',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        noteId: data.noteId,
        action: 'delete_note',
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainDeleteNote(ctx, { noteId: data.noteId })

  if (!result.success) {
    if (result.error?.includes('no encontrada')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'NOTE_NOT_FOUND',
          message: 'Nota no encontrada',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'NOTE_DELETE_FAILED',
        message: result.error || 'Error al eliminar la nota',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      noteId: data.noteId,
      deleted: true,
    },
  }
}

// ============================================================================
// Custom Field Handlers — via domain/custom-fields
// Phase 18: Custom field value mutations delegate to domain layer.
// ============================================================================

interface CustomFieldUpdateInput {
  contactId: string
  fields: Record<string, unknown>
}

interface CustomFieldReadInput {
  contactId: string
}

/**
 * crm.custom-field.update — Update custom field values for a contact.
 * Delegates to domain/custom-fields.updateCustomFieldValues.
 */
const customFieldUpdate: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as CustomFieldUpdateInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  if (!data.fields || typeof data.fields !== 'object' || Object.keys(data.fields).length === 0) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'FIELDS_REQUIRED',
        message: 'Se requiere al menos un campo personalizado para actualizar',
        retryable: false,
      },
    }
  }

  if (dryRun) {
    return {
      success: true,
      data: {
        _dry_run: true,
        contactId: data.contactId,
        fields: data.fields,
        action: 'update_custom_fields',
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainUpdateCustomFieldValues(ctx, {
    contactId: data.contactId,
    fields: data.fields,
  })

  if (!result.success) {
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'CONTACT_NOT_FOUND',
          message: 'Contacto no encontrado',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'CUSTOM_FIELD_UPDATE_FAILED',
        message: result.error || 'Error al actualizar campos personalizados',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      contactId: data.contactId,
      updated: true,
    },
    resource_url: `/crm/contactos/${data.contactId}`,
  }
}

/**
 * crm.custom-field.read — Read custom field values and definitions for a contact.
 * Delegates to domain/custom-fields.readCustomFieldValues.
 */
const customFieldRead: ToolHandler = async (
  input: unknown,
  context: ExecutionContext,
  _dryRun: boolean
): Promise<ToolResult<unknown>> => {
  const data = input as CustomFieldReadInput

  if (!data.contactId) {
    return {
      success: false,
      error: {
        type: 'validation_error',
        code: 'CONTACT_ID_REQUIRED',
        message: 'El ID del contacto es requerido',
        retryable: false,
      },
    }
  }

  const ctx: DomainContext = { workspaceId: context.workspaceId, source: 'tool-handler' }
  const result = await domainReadCustomFieldValues(ctx, { contactId: data.contactId })

  if (!result.success) {
    if (result.error?.includes('no encontrado')) {
      return {
        success: false,
        error: {
          type: 'not_found',
          code: 'CONTACT_NOT_FOUND',
          message: 'Contacto no encontrado',
          retryable: false,
        },
      }
    }
    return {
      success: false,
      error: {
        type: 'internal_error',
        code: 'CUSTOM_FIELD_READ_FAILED',
        message: result.error || 'Error al leer campos personalizados',
        retryable: true,
      },
    }
  }

  return {
    success: true,
    data: {
      fields: result.data!.fields,
      definitions: result.data!.definitions,
    },
    resource_url: `/crm/contactos/${data.contactId}`,
  }
}

// ============================================================================
// Export all CRM handlers
// ============================================================================

export const crmHandlers: Record<string, ToolHandler> = {
  'crm.contact.create': contactCreate,
  'crm.contact.update': contactUpdate,
  'crm.contact.read': contactRead,
  'crm.contact.list': contactList,
  'crm.contact.delete': contactDelete,
  'crm.tag.add': tagAdd,
  'crm.tag.remove': tagRemove,
  'crm.order.create': orderCreate,
  'crm.order.updateStatus': orderUpdateStatus,
  'crm.order.update': orderUpdate,
  'crm.order.delete': orderDelete,
  'crm.order.duplicate': orderDuplicate,
  'crm.order.list': orderList,
  'crm.task.create': taskCreate,
  'crm.task.update': taskUpdate,
  'crm.task.complete': taskComplete,
  'crm.task.list': taskList,
  'crm.note.create': noteCreate,
  'crm.note.list': noteList,
  'crm.note.delete': noteDelete,
  'crm.custom-field.update': customFieldUpdate,
  'crm.custom-field.read': customFieldRead,
}
