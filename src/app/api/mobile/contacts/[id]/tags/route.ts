// POST /api/mobile/contacts/:id/tags — add a tag to a contact.
// DELETE /api/mobile/contacts/:id/tags?tagId=:uuid — remove a tag from a contact.
//
// Phase 43 Plan 10a. Mutations => both route through the domain layer
// (Regla 3). We call `assignTag` / `removeTag` in src/lib/domain/tags.ts,
// which are the canonical single-source-of-truth functions used by the web
// server actions `addTagToContact` / `removeTagFromContact`.
//
// Mobile sends tagId (not tag name) to match the UI contract: the drawer
// has a list of tags with their ids and picks one by id. We translate id ->
// name here before calling domain (same shim the web uses).
//
// Contract:
//   POST request:     { tagId: string }        AddTagRequestSchema
//   DELETE query:     ?tagId=:uuid             (DELETE body support is spotty
//                                               through edge runtimes + proxies)
//   response:         { ok: true, tag_id: id } TagMutationResponseSchema

import { NextResponse } from 'next/server'

import {
  assignTag as domainAssignTag,
  removeTag as domainRemoveTag,
} from '@/lib/domain/tags'
import { createAdminClient } from '@/lib/supabase/admin'

import {
  AddTagRequestSchema,
  TagMutationResponseSchema,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  MobileValidationError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

// Map a tagId => tag name filtered by workspace. Mirrors the web server
// action's tag lookup (src/app/actions/contacts.ts::addTagToContact).
async function resolveTagName(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  tagId: string
): Promise<string> {
  const { data, error } = await admin
    .from('tags')
    .select('name')
    .eq('id', tagId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (error) throw error
  if (!data) {
    throw new MobileNotFoundError('not_found', 'Tag not found in workspace')
  }
  return (data as { name: string }).name
}

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

    const parsed = AddTagRequestSchema.safeParse(json)
    if (!parsed.success) {
      throw new MobileValidationError('bad_request', 'Invalid tagId')
    }

    const admin = createAdminClient()
    const tagName = await resolveTagName(admin, workspaceId, parsed.data.tagId)

    const result = await domainAssignTag(
      { workspaceId, source: 'mobile-api' },
      { entityType: 'contact', entityId: contactId, tagName }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'assign_tag_failed')
    }

    const body = TagMutationResponseSchema.parse({
      ok: true,
      tag_id: result.data!.tagId,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: contactId } = await ctx.params

    const url = new URL(req.url)
    const tagId = url.searchParams.get('tagId')
    if (!tagId) {
      throw new MobileValidationError('bad_request', 'Missing tagId')
    }

    const admin = createAdminClient()
    const tagName = await resolveTagName(admin, workspaceId, tagId)

    const result = await domainRemoveTag(
      { workspaceId, source: 'mobile-api' },
      { entityType: 'contact', entityId: contactId, tagName }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'remove_tag_failed')
    }

    const body = TagMutationResponseSchema.parse({
      ok: true,
      tag_id: result.data!.tagId,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
