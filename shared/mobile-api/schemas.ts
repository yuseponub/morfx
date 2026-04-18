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
