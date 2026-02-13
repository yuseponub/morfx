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

export const crmOrderUpdate: ToolSchema = {
  name: 'crm.order.update',
  description: 'Update order fields (description, carrier, tracking, shipping address, etc.).',

  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the order to update'
      },
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'New contact ID (optional)'
      },
      description: {
        type: 'string',
        maxLength: 2000,
        description: 'Order notes/description (optional)'
      },
      carrier: {
        type: 'string',
        maxLength: 200,
        description: 'Shipping carrier name (optional)'
      },
      trackingNumber: {
        type: 'string',
        maxLength: 200,
        description: 'Tracking/guide number (optional)'
      },
      shippingAddress: {
        type: 'string',
        maxLength: 500,
        description: 'Shipping address (optional)'
      },
      shippingCity: {
        type: 'string',
        maxLength: 100,
        description: 'Shipping city (optional)'
      }
    },
    required: ['orderId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      updated: { type: 'boolean' }
    },
    required: ['orderId', 'updated']
  },

  metadata: {
    module: 'crm',
    entity: 'order',
    action: 'update',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['orders.edit']
  }
}

export const crmOrderDelete: ToolSchema = {
  name: 'crm.order.delete',
  description: 'Delete an order. Products and tags are removed via CASCADE.',

  inputSchema: {
    type: 'object',
    properties: {
      orderId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the order to delete'
      }
    },
    required: ['orderId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      deleted: { type: 'boolean' }
    },
    required: ['orderId', 'deleted']
  },

  metadata: {
    module: 'crm',
    entity: 'order',
    action: 'delete',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['deletes_record'],
    permissions: ['orders.delete']
  }
}

export const crmOrderDuplicate: ToolSchema = {
  name: 'crm.order.duplicate',
  description: 'Duplicate an order to a target pipeline. Copies contact, products, shipping info.',

  inputSchema: {
    type: 'object',
    properties: {
      sourceOrderId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the order to duplicate'
      },
      targetPipelineId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the target pipeline'
      },
      targetStageId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the target stage (optional, defaults to first stage)'
      }
    },
    required: ['sourceOrderId', 'targetPipelineId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      orderId: { type: 'string' },
      sourceOrderId: { type: 'string' },
      duplicated: { type: 'boolean' }
    },
    required: ['orderId', 'sourceOrderId', 'duplicated']
  },

  metadata: {
    module: 'crm',
    entity: 'order',
    action: 'duplicate',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['creates_record'],
    permissions: ['orders.create']
  }
}

export const crmOrderList: ToolSchema = {
  name: 'crm.order.list',
  description: 'List orders with optional filtering by pipeline, stage, or contact.',

  inputSchema: {
    type: 'object',
    properties: {
      pipelineId: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by pipeline ID (optional)'
      },
      stageId: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by stage ID (optional)'
      },
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by contact ID (optional)'
      },
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
      }
    },
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      orders: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      totalPages: { type: 'integer' }
    },
    required: ['orders', 'total', 'page', 'pageSize', 'totalPages']
  },

  metadata: {
    module: 'crm',
    entity: 'order',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['orders.view']
  }
}

// ==================== TASK TOOLS ====================

export const crmTaskCreate: ToolSchema = {
  name: 'crm.task.create',
  description: 'Create a new task in the workspace. Can be linked to a contact or order.',

  inputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'Task title (required)'
      },
      description: {
        type: 'string',
        maxLength: 2000,
        description: 'Task description (optional)'
      },
      dueDate: {
        type: 'string',
        format: 'date-time',
        description: 'Due date in ISO 8601 format (optional)'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium',
        description: 'Task priority (default: medium)'
      },
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'Link to a contact (optional, exclusive with orderId)'
      },
      orderId: {
        type: 'string',
        format: 'uuid',
        description: 'Link to an order (optional, exclusive with contactId)'
      }
    },
    required: ['title'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      created: { type: 'boolean' }
    },
    required: ['taskId', 'created']
  },

  metadata: {
    module: 'crm',
    entity: 'task',
    action: 'create',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['creates_record'],
    permissions: ['contacts.create']
  }
}

export const crmTaskUpdate: ToolSchema = {
  name: 'crm.task.update',
  description: 'Update an existing task. Only provided fields are updated.',

  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the task to update'
      },
      title: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
        description: 'New title (optional)'
      },
      description: {
        type: 'string',
        maxLength: 2000,
        description: 'New description (optional)'
      },
      dueDate: {
        type: 'string',
        format: 'date-time',
        description: 'New due date (optional, null to clear)'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'New priority (optional)'
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed'],
        description: 'New status (optional)'
      }
    },
    required: ['taskId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      updated: { type: 'boolean' }
    },
    required: ['taskId', 'updated']
  },

  metadata: {
    module: 'crm',
    entity: 'task',
    action: 'update',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['contacts.edit']
  }
}

export const crmTaskComplete: ToolSchema = {
  name: 'crm.task.complete',
  description: 'Mark a task as completed. Sets status to completed with timestamp.',

  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the task to complete'
      }
    },
    required: ['taskId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string' },
      completed: { type: 'boolean' }
    },
    required: ['taskId', 'completed']
  },

  metadata: {
    module: 'crm',
    entity: 'task',
    action: 'complete',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['contacts.edit']
  }
}

export const crmTaskList: ToolSchema = {
  name: 'crm.task.list',
  description: 'List tasks with optional filtering by contact, order, status, or priority.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by contact ID (optional)'
      },
      orderId: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by order ID (optional)'
      },
      status: {
        type: 'string',
        enum: ['pending', 'in_progress', 'completed'],
        description: 'Filter by status (optional)'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Filter by priority (optional)'
      },
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
      }
    },
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      tasks: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      totalPages: { type: 'integer' }
    },
    required: ['tasks', 'total', 'page', 'pageSize', 'totalPages']
  },

  metadata: {
    module: 'crm',
    entity: 'task',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['contacts.view']
  }
}

// ==================== NOTE TOOLS ====================

export const crmNoteCreate: ToolSchema = {
  name: 'crm.note.create',
  description: 'Create a note on a contact. Notes are visible in the contact timeline.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to add the note to'
      },
      content: {
        type: 'string',
        minLength: 1,
        maxLength: 5000,
        description: 'Note content (required)'
      }
    },
    required: ['contactId', 'content'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string' },
      created: { type: 'boolean' }
    },
    required: ['noteId', 'created']
  },

  metadata: {
    module: 'crm',
    entity: 'note',
    action: 'create',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['creates_record'],
    permissions: ['contacts.edit']
  }
}

export const crmNoteList: ToolSchema = {
  name: 'crm.note.list',
  description: 'List notes for a contact, sorted by most recent first.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to list notes for'
      },
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
      }
    },
    required: ['contactId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      notes: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      pageSize: { type: 'integer' }
    },
    required: ['notes', 'total', 'page', 'pageSize']
  },

  metadata: {
    module: 'crm',
    entity: 'note',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['contacts.view']
  }
}

export const crmNoteDelete: ToolSchema = {
  name: 'crm.note.delete',
  description: 'Delete a note from a contact.',

  inputSchema: {
    type: 'object',
    properties: {
      noteId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the note to delete'
      }
    },
    required: ['noteId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      noteId: { type: 'string' },
      deleted: { type: 'boolean' }
    },
    required: ['noteId', 'deleted']
  },

  metadata: {
    module: 'crm',
    entity: 'note',
    action: 'delete',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['deletes_record'],
    permissions: ['contacts.edit']
  }
}

// ==================== CUSTOM FIELD TOOLS ====================

export const crmCustomFieldUpdate: ToolSchema = {
  name: 'crm.custom-field.update',
  description: 'Update custom field values for a contact. Merges provided fields into existing values.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to update custom fields for'
      },
      fields: {
        type: 'object',
        description: 'Key-value pairs of custom field key to new value'
      }
    },
    required: ['contactId', 'fields'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      contactId: { type: 'string' },
      updated: { type: 'boolean' }
    },
    required: ['contactId', 'updated']
  },

  metadata: {
    module: 'crm',
    entity: 'custom-field',
    action: 'update',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['contacts.edit']
  }
}

export const crmCustomFieldRead: ToolSchema = {
  name: 'crm.custom-field.read',
  description: 'Read custom field values and definitions for a contact.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to read custom fields for'
      }
    },
    required: ['contactId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      fields: { type: 'object' },
      definitions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            type: { type: 'string' }
          }
        }
      }
    },
    required: ['fields', 'definitions']
  },

  metadata: {
    module: 'crm',
    entity: 'custom-field',
    action: 'read',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['contacts.view']
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
  crmOrderUpdateStatus,
  crmOrderUpdate,
  crmOrderDelete,
  crmOrderDuplicate,
  crmOrderList,
  crmTaskCreate,
  crmTaskUpdate,
  crmTaskComplete,
  crmTaskList,
  crmNoteCreate,
  crmNoteList,
  crmNoteDelete,
  crmCustomFieldUpdate,
  crmCustomFieldRead,
]
