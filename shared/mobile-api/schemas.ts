// Contract between src/app/api/mobile/* and apps/mobile/.
// Pure Zod — no runtime deps. Mobile imports via relative path traversal
// (apps/mobile does not share tsconfig paths with the web app, so path
// aliases like @shared/* are intentionally avoided here).
//
// Keep this file side-effect free and dependency-free (only `zod`) so it
// can be dropped into the React Native bundle without pulling Next.js,
// Supabase, or Node-only modules into the mobile build.

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export const ErrorResponseSchema = z.object({
  error: z.string(),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/health
// ---------------------------------------------------------------------------

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  ts: z.string(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

// ---------------------------------------------------------------------------
// Workspace primitives
// ---------------------------------------------------------------------------

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string().nullable(),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

export const WorkspaceMembershipSchema = z.object({
  workspace_id: z.string().uuid(),
  role: z.string(),
  workspace: WorkspaceSchema,
})
export type WorkspaceMembership = z.infer<typeof WorkspaceMembershipSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/me
// ---------------------------------------------------------------------------

export const MeUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  created_at: z.string().nullable(),
})
export type MeUser = z.infer<typeof MeUserSchema>

export const MeResponseSchema = z.object({
  user: MeUserSchema,
  memberships: z.array(WorkspaceMembershipSchema),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/workspaces
// ---------------------------------------------------------------------------

export const WorkspacesResponseSchema = z.object({
  workspaces: z.array(WorkspaceSchema),
})
export type WorkspacesResponse = z.infer<typeof WorkspacesResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/conversations (Phase 43 Plan 07)
// ---------------------------------------------------------------------------
//
// Read-only inbox list for the mobile app. Cursor paginates by
// `last_message_at` DESC with a secondary `id` tiebreaker.
//
// Shape notes:
//   - `tags` is derived from the linked contact's contact_tags (source of
//     truth on the web per src/app/actions/conversations.ts — the web's
//     comment calls conversation_tags "deprecated").
//   - `pipeline_stage_*` is always null in this plan — pipeline stages are
//     attached to orders, not conversations. Kept on the wire so UI code in
//     Plan 43-10b (stage chip) doesn't need another contract bump.
//   - `bot_mode` + `bot_mute_until` come from Plan 43-01 migration.
//   - `avatar_url` is nullable; WhatsApp profile pictures are not exposed
//     yet (future plan), so it is null for every row today.

export const MobileConversationSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string(),
  contact_profile_name: z.string().nullable(),
  last_message_body: z.string().nullable(),
  last_message_at: z.string().nullable(),
  last_customer_message_at: z.string().nullable(),
  unread_count: z.number().int().nonnegative(),
  tags: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      color: z.string(),
    })
  ),
  pipeline_stage_id: z.string().uuid().nullable(),
  pipeline_stage_name: z.string().nullable(),
  pipeline_stage_color: z.string().nullable(),
  bot_mode: z.enum(['on', 'off', 'muted']),
  bot_mute_until: z.string().nullable(),
  avatar_url: z.string().nullable(),
})
export type MobileConversation = z.infer<typeof MobileConversationSchema>

export const MobileConversationsListResponseSchema = z.object({
  conversations: z.array(MobileConversationSchema),
  next_cursor: z.string().nullable(),
})
export type MobileConversationsListResponse = z.infer<
  typeof MobileConversationsListResponseSchema
>

// Cursor format: base64(`${last_message_at_iso}|${id}`). The route builds +
// parses this server-side; the client only passes it verbatim.
export const MobileConversationsListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(40),
})
export type MobileConversationsListQuery = z.infer<
  typeof MobileConversationsListQuerySchema
>

// ---------------------------------------------------------------------------
// GET /api/mobile/conversations/:id/messages (Phase 43 Plan 08)
// ---------------------------------------------------------------------------
//
// Read-only conversation detail path. Cursor paginates by `created_at` DESC
// (opaque ISO string — the mobile client never parses it).
//
// Shape notes:
//   - `direction` mirrors the DB CHECK ('inbound'|'outbound') but exposed as
//     'in' / 'out' for terseness on the wire (matches the mobile cache).
//   - `body` is the plain-text rendering of the message. For template /
//     interactive / media messages it may be null — the media fields carry
//     the payload instead.
//   - `media_type` is 'image' | 'audio' | 'video' | 'document' (matches the
//     WhatsApp type taxonomy minus text/template/interactive/etc.).
//   - `status` only applies to outbound messages (WhatsApp delivery status).
//   - `template_name` is set for outbound template messages (null otherwise).
//   - `sender_name` is set for inbound messages when the WhatsApp profile
//     name is known (fallback shown in the UI is the phone number).
//   - `idempotency_key` mirrors the outbox idempotency token so the mobile
//     cache can reconcile optimistic writes with server-assigned ids.

export const MobileMessageSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  direction: z.enum(['in', 'out']),
  body: z.string().nullable(),
  media_url: z.string().nullable(),
  media_type: z.enum(['image', 'audio', 'video', 'document']).nullable(),
  template_name: z.string().nullable(),
  sender_name: z.string().nullable(),
  status: z
    .enum(['pending', 'sent', 'delivered', 'read', 'failed'])
    .nullable(),
  idempotency_key: z.string().nullable(),
  created_at: z.string(),
})
export type MobileMessage = z.infer<typeof MobileMessageSchema>

export const MobileMessagesListResponseSchema = z.object({
  messages: z.array(MobileMessageSchema),
  next_cursor: z.string().nullable(),
})
export type MobileMessagesListResponse = z.infer<
  typeof MobileMessagesListResponseSchema
>

// Cursor is an ISO string (created_at of the oldest row in the current page).
// Subsequent requests ask for rows strictly older than that timestamp.
export const MobileMessagesListQuerySchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
})
export type MobileMessagesListQuery = z.infer<
  typeof MobileMessagesListQuerySchema
>

// ---------------------------------------------------------------------------
// POST /api/mobile/conversations/:id/mark-read (Phase 43 Plan 08)
// ---------------------------------------------------------------------------

export const MarkReadResponseSchema = z.object({
  ok: z.literal(true),
})
export type MarkReadResponse = z.infer<typeof MarkReadResponseSchema>

// ---------------------------------------------------------------------------
// POST /api/mobile/conversations/:id/messages (Phase 43 Plan 09)
// ---------------------------------------------------------------------------
//
// Send path. Called by the mobile outbox drain loop. Honors the
// idempotency_key — if a message with that key already exists in the
// workspace, the server returns the existing message instead of re-sending.
//
// Shape notes:
//   - Either `body` or `mediaKey` (or both) must be present. `mediaKey` is
//     the opaque key returned by the signed-upload endpoint below.
//   - `templateName` + `templateVariables` reserve the wire slot for Plan 14
//     (TemplatePicker). Plan 09 accepts them on the server but the mobile
//     composer does NOT expose them yet — so in practice Plan 09 traffic
//     will always leave these two fields null/undefined.
//   - `idempotencyKey` is generated client-side on enqueue, persisted in
//     the local outbox, and reused on every retry so duplicates are safe.

export const SendMessageRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  body: z.string().nullable(),
  mediaKey: z.string().nullable(),
  mediaType: z.enum(['image', 'audio']).nullable(),
  templateName: z.string().optional(),
  templateVariables: z.record(z.string(), z.string()).optional(),
})
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>

export const SendMessageResponseSchema = z.object({
  message: MobileMessageSchema,
})
export type SendMessageResponse = z.infer<typeof SendMessageResponseSchema>

// ---------------------------------------------------------------------------
// POST /api/mobile/conversations/:id/media/upload (Phase 43 Plan 09)
// ---------------------------------------------------------------------------
//
// Returns a presigned PUT URL to Supabase Storage. Mobile uploads the file
// directly to the signed URL, then POSTs the returned `mediaKey` back on
// the send request above. No DB rows are created by this endpoint — the
// mediaKey is consumed by the send path.

export const MediaUploadRequestSchema = z.object({
  mimeType: z.string().min(1),
  byteSize: z.number().int().positive(),
})
export type MediaUploadRequest = z.infer<typeof MediaUploadRequestSchema>

export const MediaUploadResponseSchema = z.object({
  uploadUrl: z.string().url(),
  mediaKey: z.string().min(1),
  publicUrl: z.string().url(),
  expiresAt: z.string(),
})
export type MediaUploadResponse = z.infer<typeof MediaUploadResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/quick-replies (Phase 43 Plan 09)
// ---------------------------------------------------------------------------
//
// Workspace-scoped list of saved quick replies (/ slash commands in the
// composer). Read-only, cache-friendly. `body` is the expanded content that
// replaces the slash token in the composer when the user picks a reply.

export const MobileQuickReplySchema = z.object({
  id: z.string().uuid(),
  trigger: z.string(),
  body: z.string(),
  category: z.string().nullable(),
  mediaUrl: z.string().nullable(),
  mediaType: z.enum(['image', 'video', 'audio', 'document']).nullable(),
})
export type MobileQuickReply = z.infer<typeof MobileQuickReplySchema>

export const MobileQuickRepliesListResponseSchema = z.object({
  quickReplies: z.array(MobileQuickReplySchema),
})
export type MobileQuickRepliesListResponse = z.infer<
  typeof MobileQuickRepliesListResponseSchema
>

// ---------------------------------------------------------------------------
// POST /api/mobile/push/register (Phase 43 Plan 13)
// ---------------------------------------------------------------------------

export const RegisterPushTokenRequestSchema = z.object({
  platform: z.enum(['android', 'ios']),
  token: z.string().min(1),
  deviceName: z.string().optional(),
})
export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenRequestSchema>

export const RegisterPushTokenResponseSchema = z.object({
  ok: z.literal(true),
  id: z.string().uuid(),
})
export type RegisterPushTokenResponse = z.infer<typeof RegisterPushTokenResponseSchema>
