// ============================================================================
// Phase 7: WhatsApp Module Types
// Types for conversations, messages, 360dialog API, and webhooks
// ============================================================================

// ============================================================================
// DATABASE TYPES
// ============================================================================

/**
 * Conversation status.
 */
export type ConversationStatus = 'active' | 'archived'

/**
 * Message direction.
 */
export type MessageDirection = 'inbound' | 'outbound'

/**
 * Message type.
 */
export type MessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'template'
  | 'interactive'
  | 'reaction'

/**
 * Message delivery status (for outbound messages).
 */
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'

/**
 * Conversation entity from database.
 */
export interface Conversation {
  id: string
  workspace_id: string
  contact_id: string | null
  phone: string                    // E.164 format
  phone_number_id: string          // 360dialog phone number ID
  profile_name: string | null      // WhatsApp profile name
  status: ConversationStatus
  is_read: boolean
  unread_count: number
  last_customer_message_at: string | null  // For 24h window
  last_message_at: string | null
  last_message_preview: string | null
  assigned_to: string | null
  created_at: string
  updated_at: string
}

/**
 * Message entity from database.
 */
export interface Message {
  id: string
  conversation_id: string
  workspace_id: string
  wamid: string | null
  direction: MessageDirection
  type: MessageType
  content: MessageContent
  status: MessageStatus | null
  status_timestamp: string | null
  error_code: string | null
  error_message: string | null
  media_url: string | null
  media_mime_type: string | null
  media_filename: string | null
  timestamp: string
  created_at: string
}

// ============================================================================
// MESSAGE CONTENT TYPES (JSONB)
// ============================================================================

/**
 * Union type for all message content structures.
 */
export type MessageContent =
  | TextContent
  | MediaContent
  | LocationContent
  | ContactsContent
  | TemplateContent
  | InteractiveContent
  | ReactionContent

/**
 * Text message content.
 */
export interface TextContent {
  body: string
}

/**
 * Media message content (image, video, audio, document, sticker).
 */
export interface MediaContent {
  mediaId?: string      // 360dialog media ID
  link?: string         // Direct URL (for sending)
  caption?: string
  filename?: string     // For documents
  mimeType?: string
}

/**
 * Location message content.
 */
export interface LocationContent {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

/**
 * Contacts message content.
 */
export interface ContactsContent {
  contacts: Array<{
    name: {
      formatted_name: string
      first_name?: string
      last_name?: string
    }
    phones?: Array<{
      phone: string
      type?: string
    }>
    emails?: Array<{
      email: string
      type?: string
    }>
  }>
}

/**
 * Template message content.
 */
export interface TemplateContent {
  name: string
  language: string
  components?: Array<{
    type: 'header' | 'body' | 'button'
    parameters?: Array<{
      type: 'text' | 'image' | 'document' | 'video'
      text?: string
      image?: { link: string }
      document?: { link: string }
      video?: { link: string }
    }>
  }>
}

/**
 * Interactive message content (buttons, lists).
 */
export interface InteractiveContent {
  type: 'button' | 'list' | 'product' | 'product_list'
  header?: {
    type: 'text' | 'image' | 'video' | 'document'
    text?: string
    image?: { link: string }
  }
  body: {
    text: string
  }
  footer?: {
    text: string
  }
  action: {
    buttons?: Array<{
      type: 'reply'
      reply: {
        id: string
        title: string
      }
    }>
    button?: string
    sections?: Array<{
      title?: string
      rows: Array<{
        id: string
        title: string
        description?: string
      }>
    }>
  }
}

/**
 * Reaction message content.
 */
export interface ReactionContent {
  message_id: string  // wamid of the message being reacted to
  emoji: string
}

// ============================================================================
// CONVERSATION WITH DETAILS (FOR UI)
// ============================================================================

/**
 * Conversation with contact details for UI display.
 */
export interface ConversationWithDetails extends Conversation {
  contact: {
    id: string
    name: string
    phone: string
    address: string | null
    city: string | null
  } | null
  tags: Array<{
    id: string
    name: string
    color: string
  }>
}

/**
 * Conversation list item for inbox display.
 */
export interface ConversationListItem {
  id: string
  phone: string
  contactName: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
  unreadCount: number
  isRead: boolean
  windowStatus: WindowStatus
  tags: Array<{
    id: string
    name: string
    color: string
  }>
}

/**
 * 24h window status for conversation.
 */
export type WindowStatus = 'open' | 'closing' | 'closed'

// ============================================================================
// 360DIALOG API TYPES
// ============================================================================

/**
 * Parameters for sending a text message via 360dialog.
 */
export interface Send360TextParams {
  to: string           // Phone in E.164 format
  text: {
    body: string
  }
}

/**
 * Parameters for sending a media message via 360dialog.
 */
export interface Send360MediaParams {
  to: string
  type: 'image' | 'video' | 'audio' | 'document' | 'sticker'
  [key: string]: unknown  // image, video, audio, document, or sticker object
}

/**
 * Parameters for sending a template message via 360dialog.
 */
export interface Send360TemplateParams {
  to: string
  template: {
    name: string
    language: {
      code: string
    }
    components?: TemplateContent['components']
  }
}

/**
 * Response from 360dialog send message API.
 */
export interface Send360Response {
  messaging_product: 'whatsapp'
  contacts: Array<{
    input: string
    wa_id: string
  }>
  messages: Array<{
    id: string  // wamid
  }>
}

/**
 * Error response from 360dialog API.
 */
export interface Send360Error {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

/**
 * Media URL response from 360dialog.
 */
export interface MediaUrlResponse {
  url: string
  mime_type: string
  sha256: string
  file_size: number
  id: string
}

// ============================================================================
// WEBHOOK TYPES (FROM 360DIALOG)
// ============================================================================

/**
 * Root webhook payload from 360dialog.
 */
export interface WebhookPayload {
  object: 'whatsapp_business_account'
  entry: WebhookEntry[]
}

/**
 * Entry in webhook payload.
 */
export interface WebhookEntry {
  id: string
  changes: WebhookChange[]
}

/**
 * Change in webhook entry.
 */
export interface WebhookChange {
  value: WebhookValue
  field: 'messages'
}

/**
 * Value in webhook change.
 */
export interface WebhookValue {
  messaging_product: 'whatsapp'
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: WebhookContact[]
  messages?: IncomingMessage[]
  statuses?: IncomingStatus[]
}

/**
 * Contact info from webhook.
 */
export interface WebhookContact {
  profile: {
    name: string
  }
  wa_id: string
}

/**
 * Incoming message from webhook.
 */
export interface IncomingMessage {
  from: string           // Phone number
  id: string             // wamid
  timestamp: string      // Unix timestamp
  type: MessageType
  // Content based on type
  text?: {
    body: string
  }
  image?: {
    id: string
    mime_type: string
    sha256: string
    caption?: string
  }
  video?: {
    id: string
    mime_type: string
    sha256: string
    caption?: string
  }
  audio?: {
    id: string
    mime_type: string
    sha256: string
    voice?: boolean
  }
  document?: {
    id: string
    mime_type: string
    sha256: string
    filename: string
    caption?: string
  }
  sticker?: {
    id: string
    mime_type: string
    sha256: string
    animated: boolean
  }
  location?: {
    latitude: number
    longitude: number
    name?: string
    address?: string
  }
  contacts?: ContactsContent['contacts']
  interactive?: {
    type: 'button_reply' | 'list_reply'
    button_reply?: {
      id: string
      title: string
    }
    list_reply?: {
      id: string
      title: string
      description?: string
    }
  }
  button?: {
    text: string
    payload: string
  }
  reaction?: {
    message_id: string
    emoji: string
  }
  context?: {
    from: string
    id: string
  }
  errors?: Array<{
    code: number
    title: string
    message: string
    error_data?: {
      details: string
    }
  }>
}

/**
 * Message status update from webhook.
 */
export interface IncomingStatus {
  id: string             // wamid
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string      // Unix timestamp
  recipient_id: string   // Phone number
  conversation?: {
    id: string
    origin: {
      type: 'business_initiated' | 'user_initiated' | 'referral_conversion'
    }
    expiration_timestamp?: string
  }
  pricing?: {
    billable: boolean
    pricing_model: string
    category: string
  }
  errors?: Array<{
    code: number
    title: string
    message: string
    error_data?: {
      details: string
    }
  }>
}

// ============================================================================
// FILTER TYPES
// ============================================================================

/**
 * Filters for conversation list.
 */
export interface ConversationFilters {
  search?: string
  status?: ConversationStatus
  is_read?: boolean
  assigned_to?: string | null  // null = unassigned
  tag_ids?: string[]
  window_status?: WindowStatus
}

// ============================================================================
// ACTION RESULT TYPE
// ============================================================================

/**
 * Standard result type for Server Actions.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { error: string; field?: string }
