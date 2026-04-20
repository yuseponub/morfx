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
// POST /api/mobile/conversations/:id/bot-mode (Phase 43 Plan 11)
// ---------------------------------------------------------------------------
//
// Three-state bot toggle — on / off / muted-until-ISO. Writes to the
// `bot_mode` + `bot_mute_until` columns added by Plan 43-01. Routes through
// the additive `setBotMode` domain function (Regla 3). The existing web
// `toggleConversationAgent` action (legacy `agent_conversational` boolean)
// is NOT touched — see the file comment in
// src/lib/domain/conversations/set-bot-mode.ts for Regla 6 rationale.
//
// Request invariants enforced both here (Zod) and in the domain function:
//   - mode='muted'  ⇒ muteUntil is an ISO string in the future
//   - mode='on'/'off' ⇒ muteUntil is null
//
// Response mirrors the stored + read-coerced state. If Plan 43-01's auto-
// resume (resolveBotMode) fires inside the write path — it currently does
// not, but a future consolidation could — the client will see the post-
// coercion mode, not the raw DB row.

export const MobileBotModeRequestSchema = z.object({
  mode: z.enum(['on', 'off', 'muted']),
  muteUntil: z
    .string()
    .datetime({ offset: true })
    .nullable(),
})
export type MobileBotModeRequest = z.infer<typeof MobileBotModeRequestSchema>

export const MobileBotModeResponseSchema = z.object({
  conversation_id: z.string().uuid(),
  bot_mode: z.enum(['on', 'off', 'muted']),
  bot_mute_until: z.string().nullable(),
})
export type MobileBotModeResponse = z.infer<typeof MobileBotModeResponseSchema>

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
// CRM drawer schemas (Phase 43 Plan 10a)
// ---------------------------------------------------------------------------
//
// Backend-only slice of the in-chat CRM drawer. Plan 10b consumes every
// schema below. Mutations route through src/lib/domain/ per Regla 3.
//
// Shape notes:
//   - `MobileContactSchema` mirrors the web contact-panel's data (name +
//     phone + address + city + tags). Email is intentionally OMITTED from
//     the contract — the mobile panel does NOT show email per 43-CONTEXT
//     "user explicit exclusion".
//   - `MobileOrderSchema` is the recent-orders row (not a full order edit
//     view — mobile v1 does not support full order composition per CONTEXT
//     Out of Scope; see Plan 10b CreateOrderSheet header for rationale).
//   - `WindowIndicatorSchema` computes the 24h WhatsApp customer-care
//     window server-side. `within_window` is the single authoritative
//     boolean — the mobile UI does NOT recompute from `last_customer_
//     message_at`, it renders whatever the server decided (keeps the math
//     centralized + identical to the web panel).

// Shared primitives ---------------------------------------------------------

export const MobileTagSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  color: z.string(),
})
export type MobileTag = z.infer<typeof MobileTagSchema>

export const MobilePipelineStageSchema = z.object({
  id: z.string().uuid(),
  pipeline_id: z.string().uuid(),
  pipeline_name: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number().int().nonnegative(),
})
export type MobilePipelineStage = z.infer<typeof MobilePipelineStageSchema>

// Contact + conversation panel payload -------------------------------------

export const MobileContactSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  avatar_url: z.string().nullable(),
  tags: z.array(MobileTagSchema),
  created_at: z.string(),
})
export type MobileContact = z.infer<typeof MobileContactSchema>

export const WindowIndicatorSchema = z.object({
  within_window: z.boolean(),
  last_customer_message_at: z.string().nullable(),
  hours_remaining: z.number().nullable(),
})
export type WindowIndicator = z.infer<typeof WindowIndicatorSchema>

// GET /api/mobile/conversations/:id/contact
export const MobileContactPanelResponseSchema = z.object({
  contact: MobileContactSchema.nullable(),
  // Web conversation-level tags (deprecated per src/app/actions/conversations.ts).
  // Kept on the wire for symmetry; Plan 10b UI does not render them separately
  // from `contact.tags` — but if the field is useful later (pinned-to-
  // conversation tags), it's already here.
  conversation_tags: z.array(MobileTagSchema),
  window: WindowIndicatorSchema,
  // Conversation's WhatsApp profile name when no contact is linked ("unknown
  // contact" state). The UI falls back to this + phone when contact is null.
  profile_name: z.string().nullable(),
  phone: z.string(),
})
export type MobileContactPanelResponse = z.infer<
  typeof MobileContactPanelResponseSchema
>

// Recent orders for a conversation -----------------------------------------

export const MobileOrderSchema = z.object({
  id: z.string().uuid(),
  total: z.number(),
  currency: z.literal('COP'),
  stage_id: z.string().uuid(),
  stage_name: z.string(),
  stage_color: z.string(),
  pipeline_id: z.string().uuid(),
  pipeline_name: z.string(),
  created_at: z.string(),
  tags: z.array(MobileTagSchema),
  name: z.string().nullable(),
})
export type MobileOrder = z.infer<typeof MobileOrderSchema>

// GET /api/mobile/conversations/:id/orders
export const MobileRecentOrdersResponseSchema = z.object({
  orders: z.array(MobileOrderSchema),
})
export type MobileRecentOrdersResponse = z.infer<
  typeof MobileRecentOrdersResponseSchema
>

// GET /api/mobile/pipeline-stages
export const MobilePipelineStagesResponseSchema = z.object({
  stages: z.array(MobilePipelineStageSchema),
})
export type MobilePipelineStagesResponse = z.infer<
  typeof MobilePipelineStagesResponseSchema
>

// GET /api/mobile/tags
export const MobileTagsResponseSchema = z.object({
  tags: z.array(MobileTagSchema),
})
export type MobileTagsResponse = z.infer<typeof MobileTagsResponseSchema>

// Write request schemas ----------------------------------------------------

// POST /api/mobile/contacts/:id/name
export const UpdateContactNameRequestSchema = z.object({
  name: z.string().min(1),
})
export type UpdateContactNameRequest = z.infer<
  typeof UpdateContactNameRequestSchema
>

// POST /api/mobile/orders
//
// Minimal "quick create" request — mirrors the mobile CreateOrderSheet
// Plan 10b scope (no full editor, defaults to first stage of the
// default/first pipeline, total=0). The web's richer create flow is NOT
// mirrored on mobile v1 (Plan 10b rationale in CreateOrderSheet header).
export const CreateOrderRequestSchema = z.object({
  contactId: z.string().uuid(),
  conversationId: z.string().uuid().nullable().optional(),
  // Optional pipeline+stage override. When omitted, server picks the
  // workspace's default pipeline (or first available) + its first stage.
  pipelineId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  name: z.string().optional(),
  total: z.number().optional(),
})
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>

export const CreateOrderResponseSchema = z.object({
  order: MobileOrderSchema,
})
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>

// POST /api/mobile/orders/:id/stage
export const MoveOrderStageRequestSchema = z.object({
  stageId: z.string().uuid(),
})
export type MoveOrderStageRequest = z.infer<typeof MoveOrderStageRequestSchema>

export const MoveOrderStageResponseSchema = z.object({
  ok: z.literal(true),
  order_id: z.string().uuid(),
  previous_stage_id: z.string().uuid(),
  new_stage_id: z.string().uuid(),
})
export type MoveOrderStageResponse = z.infer<
  typeof MoveOrderStageResponseSchema
>

// POST /api/mobile/orders/:id/tags  (add)
// DELETE /api/mobile/orders/:id/tags?tagId=...  (remove — query param)
// POST /api/mobile/contacts/:id/tags  (add)
// DELETE /api/mobile/contacts/:id/tags?tagId=...  (remove — query param)
//
// Add variants take a JSON body with the tag id. Remove variants use a query
// param because DELETE requests cannot always carry a body through every
// proxy/edge-runtime layer reliably (matches the web actions which pass
// the tagId as argument).
export const AddTagRequestSchema = z.object({
  tagId: z.string().uuid(),
})
export type AddTagRequest = z.infer<typeof AddTagRequestSchema>

export const TagMutationResponseSchema = z.object({
  ok: z.literal(true),
  tag_id: z.string().uuid(),
})
export type TagMutationResponse = z.infer<typeof TagMutationResponseSchema>

// POST /api/mobile/orders/:id/recompra
//
// The web recompraOrder domain requires a `products` array (non-empty). The
// mobile v1 recompra button triggers a "same-products" clone — server-side
// the endpoint reads the source order's products and feeds them back to
// domain.recompraOrder. Mobile client does NOT pick products (that editor is
// deferred to a later plan). Target stage is optional — server picks the
// first stage of the Recompra pipeline when omitted.
export const RecompraOrderRequestSchema = z.object({
  targetStageId: z.string().uuid().optional(),
})
export type RecompraOrderRequest = z.infer<typeof RecompraOrderRequestSchema>

export const RecompraOrderResponseSchema = z.object({
  order: MobileOrderSchema,
})
export type RecompraOrderResponse = z.infer<typeof RecompraOrderResponseSchema>

// ---------------------------------------------------------------------------
// GET /api/mobile/search (Phase 43 Plan 12)
// ---------------------------------------------------------------------------
//
// Read-only message + contact search. Returns up to 50 ephemeral results per
// query — these are NOT cached on the client (search results are
// intentionally not persisted to sqlite because they'd stale fast and the
// cache cost is not justified at ~50-row result sets).
//
// Match path:
//   - `messages.fts` (Spanish tsvector GENERATED column from
//     `to_tsvector('spanish', coalesce(content ->> 'body', ''))`, indexed
//     with GIN — see supabase/migrations/20260410_messages_fts.sql).
//   - Contact name + phone ILIKE — for "type a name, find the thread"
//     behaviour that FTS on message bodies alone cannot satisfy.
//
// Snippet shape:
//   - `snippet_before` / `snippet_match` / `snippet_after` is the highlighted
//     triple the mobile UI renders as `${before}<bold>${match}</bold>${after}`.
//     Empty `match` on contact-only rows means the UI falls back to the
//     contact name display (no body highlight).
//   - Server-side extraction is a narrow window (≤60 chars each side) around
//     the first matched token. The plan originally proposed `ts_headline()`;
//     we extract client-side in TS instead to avoid requiring a second
//     migration for an RPC function — Postgres `ts_headline` is not directly
//     exposable via PostgREST's select syntax, and the mobile client only
//     needs one token highlighted, not multiple.

export const MobileSearchResultSchema = z.object({
  message_id: z.string().uuid().nullable(),
  conversation_id: z.string().uuid(),
  contact_id: z.string().uuid().nullable(),
  contact_name: z.string().nullable(),
  contact_phone: z.string(),
  snippet_before: z.string(),
  snippet_match: z.string(),
  snippet_after: z.string(),
  /** ISO timestamp — `messages.created_at` for message hits, or conversation's
   *  `last_customer_message_at` (falling back to `last_message_at`) for
   *  contact-only hits. Rendered via Bogota timezone on the client (Regla 2). */
  created_at: z.string(),
  /** Source of the hit — `'message'` means the body matched FTS,
   *  `'contact'` means the contact name or phone matched ILIKE. */
  source: z.enum(['message', 'contact']),
})
export type MobileSearchResult = z.infer<typeof MobileSearchResultSchema>

export const MobileSearchResponseSchema = z.object({
  results: z.array(MobileSearchResultSchema),
})
export type MobileSearchResponse = z.infer<typeof MobileSearchResponseSchema>

export const MobileSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, 'query must be at least 2 characters')
    .max(200, 'query too long'),
})
export type MobileSearchQuery = z.infer<typeof MobileSearchQuerySchema>

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
