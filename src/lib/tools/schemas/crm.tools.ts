// src/lib/tools/schemas/crm.tools.ts
import type { ToolSchema } from '../types'

/**
 * CRM Tool Schemas
 *
 * These define the contract for CRM operations. Handlers are placeholders
 * until Phase 4 implementation.
 *
 * Naming convention: crm.{entity}.{action}
 * Entities: contact, order, tag
 * Actions: create, read, update, delete, list, search
 */

// ==================== CONTACT TOOLS ====================

export const crmContactCreate: ToolSchema = {
  name: 'crm.contact.create',
  description: 'Create a new contact in the workspace CRM. Requires name and phone at minimum.',

  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Full name of the contact'
      },
      phone: {
        type: 'string',
        pattern: '^\\+[1-9]\\d{1,14}$',
        description: 'Phone number with country code (E.164 format: +573001234567)'
      },
      email: {
        type: 'string',
        format: 'email',
        description: 'Email address (optional)'
      },
      address: {
        type: 'string',
        maxLength: 500,
        description: 'Physical address (optional)'
      },
      city: {
        type: 'string',
        maxLength: 100,
        description: 'City name (optional)'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Initial tags to apply (optional)'
      },
      notes: {
        type: 'string',
        maxLength: 2000,
        description: 'Initial notes (optional)'
      }
    },
    required: ['name', 'phone'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      created: { type: 'boolean' }
    },
    required: ['contactId', 'created']
  },

  metadata: {
    module: 'crm',
    entity: 'contact',
    action: 'create',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['creates_record'],
    permissions: ['contacts.create']
  }
}

export const crmContactUpdate: ToolSchema = {
  name: 'crm.contact.update',
  description: 'Update an existing contact. Only provided fields are updated.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to update'
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'New name (optional)'
      },
      phone: {
        type: 'string',
        pattern: '^\\+[1-9]\\d{1,14}$',
        description: 'New phone number (optional)'
      },
      email: {
        type: 'string',
        format: 'email',
        description: 'New email (optional)'
      },
      address: {
        type: 'string',
        maxLength: 500,
        description: 'New address (optional)'
      },
      city: {
        type: 'string',
        maxLength: 100,
        description: 'New city (optional)'
      }
    },
    required: ['contactId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      updated: { type: 'boolean' },
      changedFields: { type: 'array', items: { type: 'string' } }
    },
    required: ['contactId', 'updated']
  },

  metadata: {
    module: 'crm',
    entity: 'contact',
    action: 'update',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['contacts.edit']
  }
}

export const crmContactDelete: ToolSchema = {
  name: 'crm.contact.delete',
  description: 'Delete a contact from the workspace. This is a soft delete.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to delete'
      }
    },
    required: ['contactId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      deleted: { type: 'boolean' }
    },
    required: ['contactId', 'deleted']
  },

  metadata: {
    module: 'crm',
    entity: 'contact',
    action: 'delete',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['deletes_record'],
    permissions: ['contacts.delete']
  }
}

export const crmContactRead: ToolSchema = {
  name: 'crm.contact.read',
  description: 'Get a contact by ID with full details.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to retrieve'
      }
    },
    required: ['contactId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contact: { type: 'object' }
    },
    required: ['contact']
  },

  metadata: {
    module: 'crm',
    entity: 'contact',
    action: 'read',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['contacts.view']
  }
}

export const crmContactList: ToolSchema = {
  name: 'crm.contact.list',
  description: 'List contacts with optional filtering and pagination.',

  inputSchema: {
    type: 'object',
    properties: {
      page: {
        type: 'integer',
        minimum: 1,
        default: 1,
        description: 'Page number (default: 1)'
      },
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Items per page (default: 20, max: 100)'
      },
      search: {
        type: 'string',
        description: 'Search in name, phone, email'
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by tags (AND logic)'
      },
      sortBy: {
        type: 'string',
        enum: ['name', 'created_at', 'updated_at'],
        default: 'created_at',
        description: 'Sort field'
      },
      sortOrder: {
        type: 'string',
        enum: ['asc', 'desc'],
        default: 'desc',
        description: 'Sort order'
      }
    },
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contacts: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      totalPages: { type: 'integer' }
    },
    required: ['contacts', 'total', 'page', 'pageSize', 'totalPages']
  },

  metadata: {
    module: 'crm',
    entity: 'contact',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['contacts.view']
  }
}

// ==================== TAG TOOLS ====================

export const crmTagAdd: ToolSchema = {
  name: 'crm.tag.add',
  description: 'Add a tag to a contact. Creates the tag if it does not exist.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact'
      },
      tag: {
        type: 'string',
        minLength: 1,
        maxLength: 50,
        pattern: '^[a-zA-Z0-9_-]+$',
        description: 'Tag name (alphanumeric, dashes, underscores)'
      }
    },
    required: ['contactId', 'tag'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      tag: { type: 'string' },
      added: { type: 'boolean' },
      alreadyHadTag: { type: 'boolean' }
    },
    required: ['contactId', 'tag', 'added']
  },

  metadata: {
    module: 'crm',
    entity: 'tag',
    action: 'add',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['contacts.edit']
  }
}

export const crmTagRemove: ToolSchema = {
  name: 'crm.tag.remove',
  description: 'Remove a tag from a contact.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact'
      },
      tag: {
        type: 'string',
        description: 'Tag name to remove'
      }
    },
    required: ['contactId', 'tag'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      tag: { type: 'string' },
      removed: { type: 'boolean' },
      hadTag: { type: 'boolean' }
    },
    required: ['contactId', 'tag', 'removed']
  },

  metadata: {
    module: 'crm',
    entity: 'tag',
    action: 'remove',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['contacts.edit']
  }
}

// ==================== ORDER TOOLS ====================

export const crmOrderCreate: ToolSchema = {
  name: 'crm.order.create',
  description: 'Create a new order linked to a contact.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact placing the order'
      },
      products: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'integer', minimum: 1 },
            price: { type: 'number', minimum: 0 }
          },
          required: ['name', 'quantity', 'price']
        },
        minItems: 1,
        description: 'List of products in the order'
      },
      shippingAddress: {
        type: 'string',
        description: 'Shipping address'
      },
      notes: {
        type: 'string',
        maxLength: 2000,
        description: 'Order notes (optional)'
      },
      stageName: {
        type: 'string',
        maxLength: 100,
        description: 'Pipeline stage name to create the order in (optional, defaults to first stage)'
      }
    },
    required: ['contactId', 'products'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      created: { type: 'boolean' },
      total: { type: 'number' }
    },
    required: ['orderId', 'created', 'total']
  },

  metadata: {
    module: 'crm',
    entity: 'order',
    action: 'create',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['creates_record'],
    permissions: ['orders.create']
  }
}

export const crmOrderUpdateStatus: ToolSchema = {
  name: 'crm.order.updateStatus',
  description: 'Update the status of an order (move through pipeline stages).',

  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the order'
      },
      status: {
        type: 'string',
        description: 'New status (pipeline stage)'
      }
    },
    required: ['orderId', 'status'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      previousStatus: { type: 'string' },
      newStatus: { type: 'string' },
      updated: { type: 'boolean' }
    },
    required: ['orderId', 'newStatus', 'updated']
  },

  metadata: {
    module: 'crm',
    entity: 'order',
    action: 'updateStatus',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record', 'triggers_sync'],
    permissions: ['orders.edit']
  }
}

// Export all CRM tool schemas
export const crmToolSchemas: ToolSchema[] = [
  crmContactCreate,
  crmContactUpdate,
  crmContactDelete,
  crmContactRead,
  crmContactList,
  crmTagAdd,
  crmTagRemove,
  crmOrderCreate,
  crmOrderUpdateStatus
]
