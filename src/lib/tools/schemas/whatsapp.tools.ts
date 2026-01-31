// src/lib/tools/schemas/whatsapp.tools.ts
import type { ToolSchema } from '../types'

/**
 * WhatsApp Tool Schemas
 *
 * These define the contract for WhatsApp operations. Handlers are placeholders
 * until Phase 7 implementation.
 *
 * Naming convention: whatsapp.{entity}.{action}
 * Entities: message, template, conversation
 * Actions: send, list, read, assign
 */

// ==================== MESSAGE TOOLS ====================

export const whatsappMessageSend: ToolSchema = {
  name: 'whatsapp.message.send',
  description: 'Send a WhatsApp message to a contact (within 24h window). Use whatsapp.template.send for outside the window.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to message (must have phone)'
      },
      message: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
        description: 'Message text to send'
      },
      replyToMessageId: {
        type: 'string',
        description: 'ID of message to reply to (optional)'
      }
    },
    required: ['contactId', 'message'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      sent: { type: 'boolean' },
      timestamp: { type: 'string' }
    },
    required: ['messageId', 'sent']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'message',
    action: 'send',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['sends_message', 'updates_conversation'],
    permissions: ['whatsapp.send']
  }
}

export const whatsappMessageList: ToolSchema = {
  name: 'whatsapp.message.list',
  description: 'List messages in a conversation with pagination.',

  inputSchema: {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the conversation'
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 50,
        description: 'Number of messages to return (default: 50)'
      },
      before: {
        type: 'string',
        description: 'Return messages before this message ID'
      },
      after: {
        type: 'string',
        description: 'Return messages after this message ID'
      }
    },
    required: ['conversationId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      messages: { type: 'array', items: { type: 'object' } },
      hasMore: { type: 'boolean' }
    },
    required: ['messages', 'hasMore']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'message',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['whatsapp.view']
  }
}

// ==================== TEMPLATE TOOLS ====================

export const whatsappTemplateSend: ToolSchema = {
  name: 'whatsapp.template.send',
  description: 'Send a pre-approved WhatsApp template message. Works outside 24h window.',

  inputSchema: {
    type: 'object',
    properties: {
      contactId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the contact to message'
      },
      templateName: {
        type: 'string',
        description: 'Name of the approved template'
      },
      templateParams: {
        type: 'object',
        description: 'Parameters to fill template placeholders',
        additionalProperties: { type: 'string' }
      },
      language: {
        type: 'string',
        default: 'es',
        description: 'Template language code (default: es)'
      }
    },
    required: ['contactId', 'templateName'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      messageId: { type: 'string' },
      sent: { type: 'boolean' },
      templateUsed: { type: 'string' }
    },
    required: ['messageId', 'sent']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'template',
    action: 'send',
    reversible: false,
    requiresApproval: false,
    sideEffects: ['sends_message', 'updates_conversation'],
    permissions: ['whatsapp.send']
  }
}

export const whatsappTemplateList: ToolSchema = {
  name: 'whatsapp.template.list',
  description: 'List available pre-approved WhatsApp templates for the workspace.',

  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['approved', 'pending', 'rejected'],
        description: 'Filter by template status'
      }
    },
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      templates: { type: 'array', items: { type: 'object' } }
    },
    required: ['templates']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'template',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['whatsapp.view']
  }
}

// ==================== CONVERSATION TOOLS ====================

export const whatsappConversationList: ToolSchema = {
  name: 'whatsapp.conversation.list',
  description: 'List WhatsApp conversations (inbox) with filtering.',

  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: ['open', 'closed', 'all'],
        default: 'open',
        description: 'Filter by conversation status'
      },
      assignedTo: {
        type: 'string',
        format: 'uuid',
        description: 'Filter by assigned agent (optional)'
      },
      unassignedOnly: {
        type: 'boolean',
        default: false,
        description: 'Show only unassigned conversations'
      },
      page: {
        type: 'integer',
        minimum: 1,
        default: 1
      },
      pageSize: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        default: 20
      }
    },
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      conversations: { type: 'array', items: { type: 'object' } },
      total: { type: 'integer' },
      page: { type: 'integer' },
      totalPages: { type: 'integer' }
    },
    required: ['conversations', 'total']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'conversation',
    action: 'list',
    reversible: false,
    requiresApproval: false,
    sideEffects: [],
    permissions: ['whatsapp.view']
  }
}

export const whatsappConversationAssign: ToolSchema = {
  name: 'whatsapp.conversation.assign',
  description: 'Assign a conversation to an agent.',

  inputSchema: {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the conversation'
      },
      agentId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the agent to assign (null to unassign)'
      }
    },
    required: ['conversationId', 'agentId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      previousAgent: { type: 'string' },
      newAgent: { type: 'string' },
      assigned: { type: 'boolean' }
    },
    required: ['conversationId', 'assigned']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'conversation',
    action: 'assign',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['whatsapp.send'] // Managers+ can assign
  }
}

export const whatsappConversationClose: ToolSchema = {
  name: 'whatsapp.conversation.close',
  description: 'Close a conversation (mark as resolved).',

  inputSchema: {
    type: 'object',
    properties: {
      conversationId: {
        type: 'string',
        format: 'uuid',
        description: 'ID of the conversation to close'
      },
      resolution: {
        type: 'string',
        maxLength: 500,
        description: 'Resolution note (optional)'
      }
    },
    required: ['conversationId'],
    additionalProperties: false
  },

  outputSchema: {
    type: 'object',
    properties: {
      conversationId: { type: 'string' },
      closed: { type: 'boolean' },
      closedAt: { type: 'string' }
    },
    required: ['conversationId', 'closed']
  },

  metadata: {
    module: 'whatsapp',
    entity: 'conversation',
    action: 'close',
    reversible: true,
    requiresApproval: false,
    sideEffects: ['updates_record'],
    permissions: ['whatsapp.send']
  }
}

// Export all WhatsApp tool schemas
export const whatsappToolSchemas: ToolSchema[] = [
  whatsappMessageSend,
  whatsappMessageList,
  whatsappTemplateSend,
  whatsappTemplateList,
  whatsappConversationList,
  whatsappConversationAssign,
  whatsappConversationClose
]
