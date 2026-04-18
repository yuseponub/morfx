// GET /api/mobile/conversations/:id/messages — paginated message list for
// a single conversation.
//
// Phase 43 Plan 08. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters EVERY query by
// workspace_id + conversation_id — safety rule from MEMORY.md requires both.
//
// Contract: `MobileMessagesListResponseSchema` in shared/mobile-api/schemas.ts.
//
// Cursor pagination: `before` = ISO created_at string. Server returns rows
// strictly older than `before`, ordered DESC, limited to `limit` (default
// 50, max 100). A `next_cursor` is returned when more rows exist — it is the
// created_at of the oldest row in the current page.
//
// Shape translation:
//   - DB `direction` ('inbound'|'outbound') -> wire 'in' | 'out'
//   - `content` JSONB (shape depends on `type`) -> `body` text rendering
//   - text/image/audio/video/document/template are the v1 types rendered;
//     interactive/reaction/sticker/location/contacts collapse to body=null
//     until a future plan surfaces them (Plan 09/10 composer land first).

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileMessageSchema,
  MobileMessagesListQuerySchema,
  MobileMessagesListResponseSchema,
  type MobileMessage,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Row shape returned by the Supabase select (narrow + typed locally).
// ---------------------------------------------------------------------------

type DbDirection = 'inbound' | 'outbound'
type DbStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
type DbType =
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

interface MessageRow {
  id: string
  conversation_id: string
  workspace_id: string
  direction: DbDirection
  type: DbType
  content: unknown // JSONB
  status: DbStatus | null
  media_url: string | null
  media_mime_type: string | null
  created_at: string
}

interface ConversationProfileRow {
  id: string
  profile_name: string | null
  phone: string
  contact: { name: string | null } | null
}

// ---------------------------------------------------------------------------
// Content -> body / template / media rendering helpers.
// ---------------------------------------------------------------------------

function pickString(obj: unknown, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

function renderBody(
  type: DbType,
  content: unknown,
  mediaUrl: string | null
): string | null {
  switch (type) {
    case 'text': {
      return pickString(content, 'body') ?? pickString(content, 'text')
    }
    case 'image':
    case 'video':
    case 'document':
    case 'audio': {
      // Media messages — caption (if any) is the body; otherwise null.
      const caption = pickString(content, 'caption')
      if (caption) return caption
      // For documents, fall back to filename so the bubble has some label.
      if (type === 'document') {
        return pickString(content, 'filename') ?? null
      }
      void mediaUrl
      return null
    }
    case 'template': {
      // Template body is the rendered preview if the pipeline stored it;
      // otherwise the template name surfaces in `template_name` (we keep
      // body nullable).
      return pickString(content, 'body') ?? pickString(content, 'preview')
    }
    case 'interactive':
    case 'reaction':
    case 'sticker':
    case 'location':
    case 'contacts':
      // Future plans will surface these richly; for v1 read path they render
      // as empty bubbles. Keeping them on the wire (with body=null) so the
      // list count matches and timestamps align with the web canonical view.
      return null
    default:
      return null
  }
}

function templateName(type: DbType, content: unknown): string | null {
  if (type !== 'template') return null
  return pickString(content, 'name') ?? pickString(content, 'template_name')
}

function mediaType(
  type: DbType
): 'image' | 'audio' | 'video' | 'document' | null {
  switch (type) {
    case 'image':
      return 'image'
    case 'audio':
      return 'audio'
    case 'video':
      return 'video'
    case 'document':
      return 'document'
    default:
      return null
  }
}

function idempotencyKey(content: unknown): string | null {
  // If the outbound send pipeline persisted the idempotency key on the
  // message content, surface it so the mobile cache can reconcile optimistic
  // local writes. Not all outbound rows will have it yet (Plan 09 wires this
  // end-to-end). Inbound rows never have one.
  return (
    pickString(content, 'idempotency_key') ??
    pickString(content, 'idempotencyKey')
  )
}

function mapDirection(d: DbDirection): 'in' | 'out' {
  return d === 'inbound' ? 'in' : 'out'
}

// ---------------------------------------------------------------------------
// Handler.
// ---------------------------------------------------------------------------

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: conversationId } = await ctx.params

    // Parse query params via Zod (limit coerces cleanly from the URL).
    const url = new URL(req.url)
    const query = MobileMessagesListQuerySchema.parse({
      before: url.searchParams.get('before') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    })

    const admin = createAdminClient()

    // Verify the conversation belongs to the workspace. 404 otherwise —
    // this prevents a membership-enumeration oracle where a user could
    // probe arbitrary conversation ids.
    const { data: convo, error: convoError } = (await admin
      .from('conversations')
      .select(
        `
        id,
        profile_name,
        phone,
        contact:contacts!left(name)
      `
      )
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .single()) as {
      data: ConversationProfileRow | null
      error: { message: string } | null
    }

    if (convoError || !convo) {
      throw new MobileNotFoundError(
        'not_found',
        'Conversation not found in workspace'
      )
    }

    const inboundSenderName = convo.contact?.name ?? convo.profile_name ?? null

    // Fetch N+1 so we know whether another page exists.
    let q = admin
      .from('messages')
      .select(
        `
        id,
        conversation_id,
        workspace_id,
        direction,
        type,
        content,
        status,
        media_url,
        media_mime_type,
        created_at
      `
      )
      .eq('conversation_id', conversationId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(query.limit + 1)

    if (query.before) {
      // Strict inequality — mobile sends the oldest `created_at` it has.
      q = q.lt('created_at', query.before)
    }

    const { data, error } = await q

    if (error) {
      console.error('[mobile-api/messages] query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as MessageRow[]

    const hasMore = rows.length > query.limit
    const slice = hasMore ? rows.slice(0, query.limit) : rows

    const messages: MobileMessage[] = slice.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      workspace_id: row.workspace_id,
      direction: mapDirection(row.direction),
      body: renderBody(row.type, row.content, row.media_url),
      media_url: row.media_url,
      media_type: mediaType(row.type),
      template_name: templateName(row.type, row.content),
      sender_name: row.direction === 'inbound' ? inboundSenderName : null,
      status: row.direction === 'outbound' ? row.status : null,
      idempotency_key: idempotencyKey(row.content),
      created_at: row.created_at,
    }))

    // Validate each row via Zod (defense in depth against shape drift).
    for (const m of messages) {
      MobileMessageSchema.parse(m)
    }

    const nextCursor: string | null = hasMore
      ? (slice[slice.length - 1]?.created_at ?? null)
      : null

    const body = MobileMessagesListResponseSchema.parse({
      messages,
      next_cursor: nextCursor,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
