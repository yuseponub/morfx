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
//
// Sort order matches the web inbox: `last_customer_message_at DESC NULLS
// LAST` as the primary key (so outbound-only traffic never bumps a thread
// to the top), with `last_message_at DESC` as the tiebreaker and `id DESC`
// as the final tiebreaker for ties on both timestamps.
//
// Cursor format (base64-encoded): `${last_customer_message_at_iso}|${last_
// message_at_iso}|${id}`. `last_customer_message_at` may be null for threads
// that have never received an inbound message — we encode the literal string
// 'null' in that case and treat it as the smallest value for comparison
// (matches NULLS LAST semantics in PostgREST).
// ---------------------------------------------------------------------------

interface Cursor {
  /** ISO string or literal 'null' when the primary key is NULL. */
  lastCustomerMessageAt: string | null
  /** ISO string or literal 'null' — should always be non-null in practice
   *  but kept nullable for safety. */
  lastMessageAt: string | null
  id: string
}

function encodeCursor(c: Cursor): string {
  return Buffer.from(
    `${c.lastCustomerMessageAt ?? 'null'}|${c.lastMessageAt ?? 'null'}|${c.id}`,
    'utf8'
  ).toString('base64')
}

function decodeCursor(raw: string): Cursor {
  let decoded: string
  try {
    decoded = Buffer.from(raw, 'base64').toString('utf8')
  } catch {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  const parts = decoded.split('|')
  if (parts.length !== 3) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  const [lastCustomerRaw, lastMessageRaw, id] = parts
  if (!id) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  const lastCustomerMessageAt =
    lastCustomerRaw === 'null' || !lastCustomerRaw ? null : lastCustomerRaw
  const lastMessageAt =
    lastMessageRaw === 'null' || !lastMessageRaw ? null : lastMessageRaw
  if (
    lastCustomerMessageAt !== null &&
    Number.isNaN(Date.parse(lastCustomerMessageAt))
  ) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  if (lastMessageAt !== null && Number.isNaN(Date.parse(lastMessageAt))) {
    throw new MobileValidationError('invalid_cursor', 'Malformed cursor')
  }
  return { lastCustomerMessageAt, lastMessageAt, id }
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
      // Match the web inbox ordering: `last_customer_message_at DESC NULLS
      // LAST` is primary (so outbound bot replies do NOT bump the thread to
      // the top), `last_message_at DESC NULLS LAST` is the tiebreaker, `id
      // DESC` is the final tiebreaker for two rows with identical timestamps.
      .order('last_customer_message_at', {
        ascending: false,
        nullsFirst: false,
      })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1) // fetch N+1 so we know whether another page exists

    if (cursor) {
      // PostgREST has no tuple comparison; emulate the strict lexicographic
      // inequality with nested `.or()`:
      //   (last_customer_message_at < X)
      //   OR (last_customer_message_at = X AND last_message_at < Y)
      //   OR (last_customer_message_at = X AND last_message_at = Y AND id < Z)
      //
      // NULL handling (NULLS LAST): a row with `last_customer_message_at IS
      // NULL` sorts AFTER any non-null row. When the cursor's primary key is
      // non-null, we include rows with `last_customer_message_at IS NULL`
      // (they come last in the sort, so they're strictly "after" the cursor).
      // When the cursor's primary key is null, we only descend into the
      // secondary tiebreakers among rows that are also null.
      const c = cursor
      if (c.lastCustomerMessageAt !== null) {
        const secondary =
          c.lastMessageAt !== null
            ? `and(last_customer_message_at.eq.${c.lastCustomerMessageAt},last_message_at.lt.${c.lastMessageAt}),and(last_customer_message_at.eq.${c.lastCustomerMessageAt},last_message_at.eq.${c.lastMessageAt},id.lt.${c.id})`
            : `and(last_customer_message_at.eq.${c.lastCustomerMessageAt},last_message_at.is.null,id.lt.${c.id})`
        q = q.or(
          `last_customer_message_at.lt.${c.lastCustomerMessageAt},last_customer_message_at.is.null,${secondary}`
        )
      } else {
        // Cursor's primary is NULL → we're already in the NULLS LAST bucket.
        // Only descend into the id tiebreaker among the NULL-primary rows.
        if (c.lastMessageAt !== null) {
          q = q.or(
            `and(last_customer_message_at.is.null,last_message_at.lt.${c.lastMessageAt}),and(last_customer_message_at.is.null,last_message_at.eq.${c.lastMessageAt},id.lt.${c.id})`
          )
        } else {
          q = q.or(
            `and(last_customer_message_at.is.null,last_message_at.is.null,id.lt.${c.id})`
          )
        }
      }
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
      if (last?.id) {
        nextCursor = encodeCursor({
          lastCustomerMessageAt: last.last_customer_message_at,
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
