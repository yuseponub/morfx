---
phase: 07-whatsapp-core
plan: 01
subsystem: whatsapp
tags: ["whatsapp", "360dialog", "webhook", "realtime", "conversations"]
dependency-graph:
  requires: ["04-contacts-base"]
  provides: ["whatsapp-schema", "api-client", "webhook-handler", "conversation-actions"]
  affects: ["07-02", "07-03", "08-whatsapp-advanced"]
tech-stack:
  added: []
  patterns: ["webhook-async", "realtime-subscription", "contact-linking"]
key-files:
  created:
    - supabase/migrations/20260130000002_whatsapp_conversations.sql
    - src/lib/whatsapp/types.ts
    - src/lib/whatsapp/api.ts
    - src/lib/whatsapp/webhook-handler.ts
    - src/app/api/webhooks/whatsapp/route.ts
    - src/app/actions/conversations.ts
  modified: []
decisions:
  - id: "07-01-01"
    summary: "wamid unique constraint for message deduplication"
    rationale: "WhatsApp message IDs are globally unique, using constraint prevents duplicate processing"
  - id: "07-01-02"
    summary: "Async webhook processing after 200 response"
    rationale: "360dialog has 5-second timeout, must return immediately and process asynchronously"
  - id: "07-01-03"
    summary: "Trigger updates conversation stats on message insert"
    rationale: "Keeps last_message_at, unread_count, and preview in sync automatically"
  - id: "07-01-04"
    summary: "Auto-link conversations to contacts by phone"
    rationale: "E.164 phone format allows reliable matching with existing contacts table"
metrics:
  duration: "~8 minutes"
  completed: "2026-01-30"
---

# Phase 7 Plan 01: WhatsApp Infrastructure Summary

**One-liner:** Database schema, 360dialog API client, webhook handler, and Server Actions for WhatsApp conversations and messages.

## What Was Built

### Database Schema (20260130000002_whatsapp_conversations.sql)
- **conversations table:** workspace_id, phone (E.164), phone_number_id, status, is_read, unread_count, last_customer_message_at (24h window), last_message_at, last_message_preview, assigned_to
- **messages table:** conversation_id, wamid (unique for dedup), direction, type (text/image/video/audio/document/sticker/location/contacts/template/interactive/reaction), content (JSONB), status, media_url
- **Indexes:** workspace, phone lookup, last_message_at DESC, wamid
- **Trigger:** update_conversation_on_message for auto-updating stats
- **RLS:** workspace isolation via is_workspace_member()
- **Realtime:** Both tables added to supabase_realtime publication

### TypeScript Types (src/lib/whatsapp/types.ts)
- Database types: Conversation, Message, MessageContent (union)
- Message content: TextContent, MediaContent, LocationContent, ContactsContent, TemplateContent, InteractiveContent, ReactionContent
- API types: Send360TextParams, Send360Response, Send360Error, MediaUrlResponse
- Webhook types: WebhookPayload, WebhookEntry, WebhookChange, WebhookValue, IncomingMessage, IncomingStatus
- UI types: ConversationWithDetails, ConversationListItem, WindowStatus
- Filter types: ConversationFilters
- ActionResult for Server Actions

### 360dialog API Client (src/lib/whatsapp/api.ts)
- sendTextMessage(apiKey, to, text)
- sendMediaMessage(apiKey, to, type, mediaUrl, caption?, filename?)
- sendTemplateMessage(apiKey, to, templateName, languageCode, components?)
- sendButtonMessage(apiKey, to, body, buttons, header?, footer?)
- getMediaUrl(apiKey, mediaId)
- downloadMedia(apiKey, mediaId) - returns buffer for storage
- markMessageAsRead(apiKey, messageId)

### Webhook Handler (src/lib/whatsapp/webhook-handler.ts)
- processWebhook(payload, workspaceId, phoneNumberId)
- Processes incoming messages: find/create conversation, link to contact, insert message with wamid dedup
- Processes status updates: updates message status, error info
- buildMessageContent() for all message types

### Webhook Route (src/app/api/webhooks/whatsapp/route.ts)
- GET: Webhook verification (hub.verify_token challenge)
- POST: Receives events, returns 200 immediately, processes async
- Looks up workspace by phone_number_id or falls back to env var

### Server Actions (src/app/actions/conversations.ts)
- getConversations(filters?) - with contact join, search, tag filter
- getConversation(id) - single with details
- getConversationMessages(conversationId, limit, before?) - paginated
- markAsRead(id) - reset unread_count
- archiveConversation(id) / unarchiveConversation(id)
- linkContactToConversation(conversationId, contactId)
- unlinkContactFromConversation(conversationId)
- assignConversation(conversationId, userId) - for Phase 8
- getConversationStats() - total, unread, archived, windowClosed

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 07-01-01 | wamid unique constraint | WhatsApp IDs are globally unique, prevents duplicate webhook processing |
| 07-01-02 | Async webhook processing | 360dialog 5-second timeout requires immediate 200 response |
| 07-01-03 | Trigger for conversation stats | Automatic sync of last_message_at, unread_count, preview |
| 07-01-04 | Auto-link by phone | E.164 format enables reliable contact matching |

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| 03a1e94 | feat(07-01): create WhatsApp conversations and messages schema |
| 72ef3dc | feat(07-01): create WhatsApp TypeScript types |
| 6565b53 | feat(07-01): create 360dialog API client and webhook handler |
| b2cda26 | feat(07-01): create conversation Server Actions |

## Files Created

```
supabase/migrations/20260130000002_whatsapp_conversations.sql (280 lines)
src/lib/whatsapp/types.ts (521 lines)
src/lib/whatsapp/api.ts (254 lines)
src/lib/whatsapp/webhook-handler.ts (280 lines)
src/app/api/webhooks/whatsapp/route.ts (113 lines)
src/app/actions/conversations.ts (426 lines)
```

## Next Phase Readiness

**Ready for 07-02 (Inbox UI):**
- [x] Database schema ready with Realtime enabled
- [x] Types exported for UI components
- [x] Server Actions for data fetching
- [x] Conversation stats for inbox counters

**Environment Variables Needed:**
- `WHATSAPP_360_API_KEY` - 360dialog API key
- `WHATSAPP_PHONE_NUMBER_ID` - 360dialog phone number ID
- `WHATSAPP_WEBHOOK_VERIFY_TOKEN` - Custom token for webhook verification
- `WHATSAPP_DEFAULT_WORKSPACE_ID` - Fallback workspace (single-workspace MVP)

**360dialog Configuration:**
- Webhook URL: `https://yourdomain.com/api/webhooks/whatsapp`
- Events to subscribe: messages, message_status
