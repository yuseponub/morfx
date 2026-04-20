// GET /api/mobile/search — mobile message + contact search.
//
// Phase 43 Plan 12. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters by workspace_id explicitly
// from requireMobileAuth.
//
// Two parallel queries, UNION merge:
//
//   A) Message FTS hit via `messages.fts @@ websearch_to_tsquery('spanish',
//      q)` — issued through PostgREST's `.textSearch('fts', q,
//      { type: 'websearch', config: 'spanish' })`. Matches the GIN index
//      created by supabase/migrations/20260410_messages_fts.sql. Joined with
//      `conversations -> contacts` so the response row carries
//      contact_name/contact_phone without a second round-trip.
//
//   B) Contact name/phone ILIKE — simpler LIKE fallback for the "type a name,
//      find the thread" case that FTS on message bodies alone cannot satisfy.
//      Returns the latest conversation per matching contact.
//
// Merge rules:
//   - Dedup by conversation_id (prefer the message hit when both sources
//     return the same thread — the snippet is more useful than a bare
//     contact row).
//   - Sort the merged set by `created_at DESC` (most recent hits first).
//   - Cap at 50 rows total.
//
// Snippet extraction:
//   - The plan originally proposed Postgres `ts_headline`. That function
//     cannot be projected through PostgREST's `.select()` syntax, and adding
//     it would require a second migration for a `search_messages(q, ws)`
//     RPC function — a second Regla-5 checkpoint we want to avoid since the
//     FTS migration is already live. Instead we pull the message body back
//     to the server handler (~50 rows × <=1KB of text each ≈ 50KB max) and
//     build a narrow `{ before, match, after }` triple in TS around the
//     first occurrence of any query token. The mobile UI renders the triple
//     as `${before}<bold>${match}</bold>${after}`.
//   - Spanish stopwords are NOT stripped by the snippet extractor — the
//     FTS query already filtered by `websearch_to_tsquery('spanish', q)`
//     which honours the Spanish dictionary. The snippet just needs to show
//     *where* the match is, so a dumb case-insensitive substring match on
//     the raw query tokens is good enough (and matches what users expect
//     visually — they typed "pedido", they want to see "pedido" highlighted,
//     not some stemmed variant).
//
// Contract: `MobileSearchResponseSchema` in shared/mobile-api/schemas.ts.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileSearchQuerySchema,
  MobileSearchResponseSchema,
  type MobileSearchResult,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import { MobileValidationError, toMobileErrorResponse } from '../_lib/errors'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// Row shapes returned by each query.
// ---------------------------------------------------------------------------

interface MessageHitRow {
  id: string
  conversation_id: string
  content: { body?: string | null } | null
  created_at: string
  conversation: {
    id: string
    phone: string
    profile_name: string | null
    last_message_at: string | null
    last_customer_message_at: string | null
    contact: {
      id: string
      name: string | null
      phone: string | null
    } | null
  } | null
}

interface ContactHitRow {
  id: string
  name: string | null
  phone: string | null
  conversations: Array<{
    id: string
    phone: string
    profile_name: string | null
    last_message_at: string | null
    last_customer_message_at: string | null
  }> | null
}

// ---------------------------------------------------------------------------
// Snippet extraction.
//
// Finds the first occurrence of any query token inside `body`, and returns a
// `{ before, match, after }` triple with at most SNIPPET_WINDOW characters of
// context on each side. If no token matches (possible when FTS matched a
// stemmed form that the raw user query doesn't literal-match — e.g. FTS
// matched "pedidos" for query "pedido"), falls back to the head of the
// body as `before` with empty `match`/`after`.
//
// Case-insensitive; diacritic-insensitive (Spanish queries with/without
// accents should both highlight — so we normalize both haystack and needle
// with NFD + strip combining marks).
// ---------------------------------------------------------------------------

const SNIPPET_WINDOW = 60
const SNIPPET_MAX_LEN = 240

function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeForMatch(s: string): string {
  return stripDiacritics(s).toLowerCase()
}

interface Snippet {
  before: string
  match: string
  after: string
}

function extractSnippet(
  body: string,
  queryTokens: string[]
): Snippet {
  const normalizedBody = normalizeForMatch(body)

  // Find the earliest occurrence of any query token.
  let matchStart = -1
  let matchEnd = -1
  for (const token of queryTokens) {
    if (token.length === 0) continue
    const normalizedToken = normalizeForMatch(token)
    const idx = normalizedBody.indexOf(normalizedToken)
    if (idx !== -1 && (matchStart === -1 || idx < matchStart)) {
      matchStart = idx
      matchEnd = idx + normalizedToken.length
    }
  }

  if (matchStart === -1) {
    // FTS hit but no literal substring — return head of body as context.
    const head = body.slice(0, SNIPPET_MAX_LEN)
    return { before: head, match: '', after: '' }
  }

  const beforeStart = Math.max(0, matchStart - SNIPPET_WINDOW)
  const afterEnd = Math.min(body.length, matchEnd + SNIPPET_WINDOW)

  let before = body.slice(beforeStart, matchStart)
  const match = body.slice(matchStart, matchEnd)
  let after = body.slice(matchEnd, afterEnd)

  // Prepend ellipsis if we truncated from the left.
  if (beforeStart > 0) before = '…' + before
  if (afterEnd < body.length) after = after + '…'

  return { before, match, after }
}

// Split the user query into tokens (whitespace + punctuation). Also strip
// `websearch_to_tsquery` operators the user typed literally ("-foo" or
// quoted phrases) so the snippet highlighter focuses on content words.
function queryTokens(q: string): string[] {
  return q
    .replace(/"/g, ' ')
    .replace(/\s-\S+/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
}

// ---------------------------------------------------------------------------
// Handler.
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)

    const url = new URL(req.url)
    const rawQ = url.searchParams.get('q') ?? ''
    const parsed = MobileSearchQuerySchema.safeParse({ q: rawQ })
    if (!parsed.success) {
      throw new MobileValidationError(
        'invalid_query',
        parsed.error.issues[0]?.message ?? 'invalid query'
      )
    }
    const q = parsed.data.q
    const tokens = queryTokens(q)

    const admin = createAdminClient()

    // -----------------------------------------------------------------------
    // Query A: message FTS hits.
    // -----------------------------------------------------------------------
    //
    // `.textSearch('fts', q, { type: 'websearch', config: 'spanish' })`
    // translates to `messages.fts @@ websearch_to_tsquery('spanish', $q)`
    // on the server, hitting the GIN index created by the migration. The
    // workspace filter + composite index `messages_workspace_created_idx`
    // keeps the ORDER BY path cheap.
    //
    // Joins: conversation (!inner so rows with missing conversation drop) +
    // its linked contact (!left so unknown-contact threads still surface).

    const messagesPromise = admin
      .from('messages')
      .select(
        `
        id,
        conversation_id,
        content,
        created_at,
        conversation:conversations!inner(
          id,
          phone,
          profile_name,
          last_message_at,
          last_customer_message_at,
          contact:contacts!left(id, name, phone)
        )
      `
      )
      .eq('workspace_id', workspaceId)
      .textSearch('fts', q, { type: 'websearch', config: 'spanish' })
      .order('created_at', { ascending: false })
      .limit(30)

    // -----------------------------------------------------------------------
    // Query B: contact name/phone ILIKE hits.
    // -----------------------------------------------------------------------
    //
    // Wildcard both sides — matches any substring. `phone` is E.164 (+57…)
    // so we also match the bare digits the user likely typed ("3001234" →
    // finds "+573001234567"). PostgREST `.or()` with two `.ilike` clauses.
    //
    // Returning the contact's conversations inline so we can surface a row
    // per conversation (not per contact) — the UI navigates to /chat/[id]
    // and needs a specific conversation id.

    const contactsPromise = admin
      .from('contacts')
      .select(
        `
        id,
        name,
        phone,
        conversations!left(id, phone, profile_name, last_message_at, last_customer_message_at)
      `
      )
      .eq('workspace_id', workspaceId)
      .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20)

    const [messagesRes, contactsRes] = await Promise.all([
      messagesPromise,
      contactsPromise,
    ])

    if (messagesRes.error) {
      console.error('[mobile-api/search] messages query failed', messagesRes.error)
      throw messagesRes.error
    }
    if (contactsRes.error) {
      console.error('[mobile-api/search] contacts query failed', contactsRes.error)
      throw contactsRes.error
    }

    const messageRows = (messagesRes.data ?? []) as unknown as MessageHitRow[]
    const contactRows = (contactsRes.data ?? []) as unknown as ContactHitRow[]

    // ---------------------------------------------------------------------
    // Build result set.
    // Dedup key: conversation_id. Message hits win over contact hits for
    // the same conversation (richer snippet).
    // ---------------------------------------------------------------------

    const byConversation = new Map<string, MobileSearchResult>()

    for (const row of messageRows) {
      const conv = row.conversation
      if (!conv) continue

      const body = row.content?.body ?? ''
      const snippet = extractSnippet(body, tokens)

      const result: MobileSearchResult = {
        message_id: row.id,
        conversation_id: conv.id,
        contact_id: conv.contact?.id ?? null,
        contact_name: conv.contact?.name ?? conv.profile_name ?? null,
        contact_phone: conv.contact?.phone ?? conv.phone,
        snippet_before: snippet.before,
        snippet_match: snippet.match,
        snippet_after: snippet.after,
        created_at: row.created_at,
        source: 'message',
      }

      const existing = byConversation.get(conv.id)
      if (!existing) {
        byConversation.set(conv.id, result)
      } else if (existing.created_at < result.created_at) {
        // Keep the most recent matching message per conversation.
        byConversation.set(conv.id, result)
      }
    }

    for (const contact of contactRows) {
      const conversations = contact.conversations ?? []
      for (const conv of conversations) {
        if (byConversation.has(conv.id)) continue // message hit already present

        const createdAt =
          conv.last_customer_message_at ??
          conv.last_message_at ??
          new Date(0).toISOString()

        const result: MobileSearchResult = {
          message_id: null,
          conversation_id: conv.id,
          contact_id: contact.id,
          contact_name: contact.name ?? conv.profile_name ?? null,
          contact_phone: contact.phone ?? conv.phone,
          snippet_before: '',
          snippet_match: '',
          snippet_after: '',
          created_at: createdAt,
          source: 'contact',
        }
        byConversation.set(conv.id, result)
      }
    }

    // Sort merged set by created_at DESC, cap at 50.
    const merged = Array.from(byConversation.values())
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 50)

    const body = MobileSearchResponseSchema.parse({ results: merged })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
