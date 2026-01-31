// src/lib/tools/handlers/crm/index.ts
import type { ToolHandler, ExecutionContext } from '../../types'

/**
 * CRM Tool Handlers (Placeholders)
 *
 * These are placeholder implementations that return dry-run style outputs.
 * Real implementations come in Phase 4.
 *
 * PHASE_4_CONTRACT: Replace placeholder handlers with real implementations.
 * Do NOT create new handler files - modify this file directly.
 * The registry in init.ts imports from this file.
 *
 * All handlers follow the pattern:
 * - dryRun=true: Return preview of what would happen
 * - dryRun=false: Return "Not implemented" until Phase 4
 */

type PlaceholderOutput = {
  _placeholder: true
  _message: string
  [key: string]: unknown
}

function createPlaceholder(
  toolName: string,
  previewOutput: Record<string, unknown>
): ToolHandler {
  return async (
    input: unknown,
    context: ExecutionContext,
    dryRun: boolean
  ): Promise<PlaceholderOutput> => {
    if (dryRun) {
      return {
        _placeholder: true,
        _message: `[DRY RUN] Would execute ${toolName}`,
        ...previewOutput,
      }
    }

    // Real execution not implemented yet
    return {
      _placeholder: true,
      _message: `Tool ${toolName} not implemented yet. Coming in Phase 4.`,
      ...previewOutput,
    }
  }
}

// Export handlers for each CRM tool
export const crmHandlers: Record<string, ToolHandler> = {
  'crm.contact.create': createPlaceholder('crm.contact.create', {
    contactId: 'placeholder-contact-id',
    created: true,
  }),

  'crm.contact.update': createPlaceholder('crm.contact.update', {
    contactId: 'placeholder-contact-id',
    updated: true,
    changedFields: ['name', 'phone'],
  }),

  'crm.contact.delete': createPlaceholder('crm.contact.delete', {
    contactId: 'placeholder-contact-id',
    deleted: true,
  }),

  'crm.contact.read': createPlaceholder('crm.contact.read', {
    contact: {
      id: 'placeholder-contact-id',
      name: 'Placeholder Contact',
      phone: '+573001234567',
    },
  }),

  'crm.contact.list': createPlaceholder('crm.contact.list', {
    contacts: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  }),

  'crm.tag.add': createPlaceholder('crm.tag.add', {
    contactId: 'placeholder-contact-id',
    tag: 'placeholder-tag',
    added: true,
    alreadyHadTag: false,
  }),

  'crm.tag.remove': createPlaceholder('crm.tag.remove', {
    contactId: 'placeholder-contact-id',
    tag: 'placeholder-tag',
    removed: true,
    hadTag: true,
  }),

  'crm.order.create': createPlaceholder('crm.order.create', {
    orderId: 'placeholder-order-id',
    created: true,
    total: 0,
  }),

  'crm.order.updateStatus': createPlaceholder('crm.order.updateStatus', {
    orderId: 'placeholder-order-id',
    previousStatus: 'pending',
    newStatus: 'processing',
    updated: true,
  }),
}
