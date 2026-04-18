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
