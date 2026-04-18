// GET /api/mobile/conversations/:id/contact — contact details + tags +
// 24h WhatsApp window indicator for the in-chat CRM drawer.
//
// Phase 43 Plan 10a. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters EVERY query by
// workspace_id AND the conversation id from the path.
//
// Contract: MobileContactPanelResponseSchema in shared/mobile-api/schemas.ts.
//
// Shape notes:
//   - `window.within_window` is authoritative: mobile UI does not recompute.
//     Formula: `last_customer_message_at` within last 24h => true.
//   - `contact` is null when the conversation has no linked contact (unknown
//     contact state — the drawer renders "Crear contacto" CTA in Plan 10b).
//   - `profile_name` + `phone` come from the conversation row so the UI can
//     fall back to the WhatsApp profile when the contact is null.
//   - Email is intentionally excluded from the contract (43-CONTEXT user
//     exclusion).
//   - `conversation_tags` is deprecated on the web but reserved on the wire
//     — today it returns [] because web source of truth is contact.tags.

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileContactPanelResponseSchema,
  type MobileTag,
  type MobileContact,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

const WINDOW_HOURS = 24
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000

interface TagRef {
  id: string
  name: string
  color: string
}

interface ConversationRow {
  id: string
  workspace_id: string
  contact_id: string | null
  phone: string
  profile_name: string | null
  last_customer_message_at: string | null
}

interface ContactRow {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  city: string | null
  created_at: string
  tags: Array<{ tag: TagRef | null }> | null
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: conversationId } = await ctx.params

    const admin = createAdminClient()

    // 1. Read the conversation (workspace-scoped).
    const { data: convoRow, error: convoErr } = await admin
      .from('conversations')
      .select(
        'id, workspace_id, contact_id, phone, profile_name, last_customer_message_at'
      )
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (convoErr) {
      console.error('[mobile-api/contact] conversation query failed', convoErr)
      throw convoErr
    }
    if (!convoRow) {
      throw new MobileNotFoundError(
        'not_found',
        'Conversation not found in workspace'
      )
    }

    const convo = convoRow as ConversationRow

    // 2. Compute the 24h WhatsApp customer-care window.
    let withinWindow = false
    let hoursRemaining: number | null = null
    if (convo.last_customer_message_at) {
      const lastMs = Date.parse(convo.last_customer_message_at)
      if (!Number.isNaN(lastMs)) {
        const elapsed = Date.now() - lastMs
        withinWindow = elapsed >= 0 && elapsed < WINDOW_MS
        if (withinWindow) {
          hoursRemaining = Math.max(0, (WINDOW_MS - elapsed) / (60 * 60 * 1000))
        } else {
          hoursRemaining = 0
        }
      }
    }

    // 3. Read contact + tags (if linked).
    let contact: MobileContact | null = null
    if (convo.contact_id) {
      const { data: contactRow, error: contactErr } = await admin
        .from('contacts')
        .select(
          `
          id, name, phone, address, city, created_at,
          tags:contact_tags(
            tag:tags(id, name, color)
          )
        `
        )
        .eq('id', convo.contact_id)
        .eq('workspace_id', workspaceId)
        .maybeSingle()

      if (contactErr) {
        console.error('[mobile-api/contact] contact query failed', contactErr)
        throw contactErr
      }

      if (contactRow) {
        const row = contactRow as unknown as ContactRow
        const tags: MobileTag[] = []
        for (const ct of row.tags ?? []) {
          if (ct?.tag) {
            tags.push({
              id: ct.tag.id,
              name: ct.tag.name,
              color: ct.tag.color,
            })
          }
        }
        contact = {
          id: row.id,
          name: row.name,
          phone: row.phone,
          address: row.address,
          city: row.city,
          avatar_url: null,
          tags,
          created_at: row.created_at,
        }
      }
    }

    const body = MobileContactPanelResponseSchema.parse({
      contact,
      conversation_tags: [],
      window: {
        within_window: withinWindow,
        last_customer_message_at: convo.last_customer_message_at,
        hours_remaining:
          hoursRemaining === null ? null : Number(hoursRemaining.toFixed(2)),
      },
      profile_name: convo.profile_name,
      phone: convo.phone,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
