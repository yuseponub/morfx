// POST /api/mobile/contacts/:id/name — inline contact name update from the
// CRM drawer.
//
// Phase 43 Plan 10a. Mutation => routes through the domain layer (Regla 3).
// The domain function `updateContact` emits field.changed triggers, so the
// web automation pipeline still fires when the mobile edits a name (same
// behavior the web's `updateContactName` server action has).
//
// Contract:
//   request:  { name: string }                     UpdateContactNameRequestSchema
//   response: { ok: true, tag_id?... } -> MarkReadResponseSchema (reused ok=true)
//
// NOTE: we return `MarkReadResponseSchema` (`{ ok: true }`) because a
// dedicated schema would be redundant — the client only needs a 200 to
// optimistically confirm the write succeeded. Mirrors the web pattern where
// updateContactName returns `{ success, data: { name } }`.

import { NextResponse } from 'next/server'

import { updateContact as domainUpdateContact } from '@/lib/domain/contacts'

import {
  MarkReadResponseSchema,
  UpdateContactNameRequestSchema,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  MobileValidationError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: contactId } = await ctx.params

    let json: unknown
    try {
      json = await req.json()
    } catch {
      throw new MobileValidationError('bad_request', 'Invalid JSON body')
    }

    const parsed = UpdateContactNameRequestSchema.safeParse(json)
    if (!parsed.success) {
      throw new MobileValidationError('bad_request', 'Invalid name')
    }

    const trimmed = parsed.data.name.trim()
    if (!trimmed) {
      throw new MobileValidationError('bad_request', 'Name cannot be empty')
    }

    // Regla 3 — domain call. updateContact emits field.changed triggers +
    // filters by workspace_id in every DB hit (see src/lib/domain/contacts.ts).
    const result = await domainUpdateContact(
      { workspaceId, source: 'mobile-api' },
      { contactId, name: trimmed }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrado')) {
        throw new MobileNotFoundError(
          'not_found',
          'Contact not found in workspace'
        )
      }
      throw new Error(result.error ?? 'update_contact_failed')
    }

    const body = MarkReadResponseSchema.parse({ ok: true })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
