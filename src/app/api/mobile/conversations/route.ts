// GET /api/mobile/conversations — paginated inbox list.
//
// Phase 43 Plan 07. Read-only endpoint: no mutation, no domain layer call
// (Regla 3 is about mutations). Uses createAdminClient to bypass RLS and
// filters by workspace_id explicitly from requireMobileAuth.
//
// Contract: `MobileConversationsListResponseSchema` in shared/mobile-api/schemas.ts.
//
// Cursor pagination: last_message_at DESC with `id` tiebreaker, encoded as
// base64(`${iso}|${id}`). The cursor is opaque to the client.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveBotMode } from '@/lib/domain/conversations/set-bot-mode'

import {
  MobileConversationsListQuerySchema,
  MobileConversationsListResponseSchema,
  type MobileConversation,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { MobileValidationError, toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Row shape returned by the Supabase select (kept narrow + typed locally so
// the file does not pull runtime types from a generated DB types package).
// ---------------------------------------------------------------------------

interface TagRef {
  id: string
  name: string
  color: string
}

interface ContactTagRow {
  tag: TagRef | null
}

interface ConversationRow {
  id: string
  workspace_id: string
  contact_id: string | null
  phone: string
  profile_name: string | null
  last_message_at: string | null
  last_customer_message_at: string | null
  last_message_preview: string | null
  unread_count: number
  bot_mode: 'on' | 'off' | 'muted' | null
  bot_mute_until: string | null
  status: string
  contact:
    | {
        id: string
        name: string | null
        phone: string | null
        tags: ContactTagRow[] | null
      }
    | null
}

// ---------------------------------------------------------------------------
// Cursor helpers.
// ---------------------------------------------------------------------------

interface Cursor {
  lastMessageAt: string
  id: string
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.lastMessageAt}|${c.id}`, 'utf8').toString('base64')
}

function decodeCursor(raw: string): Cursor {
  let decoded: string
  try {
    decoded = Buffer.from(raw, 'base64').toString('utf8')
  } catch {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  const sep = decoded.indexOf('|')
  if (sep <= 0) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  const lastMessageAt = decoded.slice(0, sep)
  const id = decoded.slice(sep + 1)
  if (!lastMessageAt || !id) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  // Basic ISO-ish validation — the DB will reject anything weirder.
  if (Number.isNaN(Date.parse(lastMessageAt))) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  return { lastMessageAt, id }
}

// ---------------------------------------------------------------------------
// Handler.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)

    // Parse query params via Zod so `limit` coerces cleanly from the URL.
    const url = new URL(req.url)
    const query = MobileConversationsListQuerySchema.parse({
      cursor: url.searchParams.get('cursor') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    })

    const cursor = query.cursor ? decodeCursor(query.cursor) : null

    const admin = createAdminClient()

    // Tags come from the contact's contact_tags (source of truth per the
    // web action `src/app/actions/conversations.ts` — conversation_tags is
    // kept deprecated on the web).
    //
    // `contacts!left` so conversations without a linked contact still show
    // up (unknown contacts fall back to `profile_name`/`phone`).
    let q = admin
      .from('conversations')
      .select(
        `
        id,
        workspace_id,
        contact_id,
        phone,
        profile_name,
        last_message_at,
        last_customer_message_at,
        last_message_preview,
        unread_count,
        bot_mode,
        bot_mute_until,
        status,
        contact:contacts!left(
          id,
          name,
          phone,
          tags:contact_tags(
            tag:tags(id, name, color)
          )
        )
      `
      )
      .eq('workspace_id', workspaceId)
      .neq('status', 'archived')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1) // fetch N+1 so we know whether another page exists

    if (cursor) {
      // Strict inequality on last_message_at; for ties, fall back to id <.
      // PostgREST does not support tuple comparisons, so we emulate with an
      // `.or` filter: (last_message_at < X) OR (last_message_at = X AND id < Y).
      q = q.or(
        `last_message_at.lt.${cursor.lastMessageAt},and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`
      )
    }

    const { data, error } = await q

    if (error) {
      console.error('[mobile-api/conversations] query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as ConversationRow[]

    // Determine pagination: we asked for limit+1, so if we got > limit there
    // is another page and the last row becomes the cursor.
    const hasMore = rows.length > query.limit
    const slice = hasMore ? rows.slice(0, query.limit) : rows

    const conversations: MobileConversation[] = slice.map((row) => {
      const contactTagsRaw = row.contact?.tags ?? []
      const tags: TagRef[] = []
      for (const ct of contactTagsRaw) {
        if (ct?.tag) {
          tags.push({
            id: ct.tag.id,
            name: ct.tag.name,
            color: ct.tag.color,
          })
        }
      }

      // Plan 43-11: apply resolveBotMode here so an expired mute is coerced
      // to 'on' before the client ever sees it. This is the v1 auto-resume
      // strategy — no scheduled worker needed (a future consolidation plan
      // can add one as defense-in-depth without changing this call path).
      const { bot_mode: botMode, bot_mute_until: botMuteUntil } = resolveBotMode({
        bot_mode: row.bot_mode,
        bot_mute_until: row.bot_mute_until,
      })

      return {
        id: row.id,
        workspace_id: row.workspace_id,
        contact_id: row.contact_id,
        contact_name: row.contact?.name ?? null,
        contact_phone: row.contact?.phone ?? row.phone,
        contact_profile_name: row.profile_name,
        last_message_body: row.last_message_preview,
        last_message_at: row.last_message_at,
        last_customer_message_at: row.last_customer_message_at,
        unread_count: row.unread_count ?? 0,
        tags,
        // Pipeline stage lives on orders (not conversations) in the web
        // schema. Kept null here so the wire contract is stable for Plan
        // 10b when we may wire a "latest order stage" per conversation.
        pipeline_stage_id: null,
        pipeline_stage_name: null,
        pipeline_stage_color: null,
        bot_mode: botMode,
        bot_mute_until: botMuteUntil,
        avatar_url: null,
      }
    })

    let nextCursor: string | null = null
    if (hasMore) {
      const last = slice[slice.length - 1]
      if (last?.last_message_at && last?.id) {
        nextCursor = encodeCursor({
          lastMessageAt: last.last_message_at,
          id: last.id,
        })
      }
    }

    const body = MobileConversationsListResponseSchema.parse({
      conversations,
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
