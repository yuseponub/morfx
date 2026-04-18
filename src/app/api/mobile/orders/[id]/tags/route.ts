// POST /api/mobile/orders/:id/tags — add a tag to an order.
// DELETE /api/mobile/orders/:id/tags?tagId=:uuid — remove a tag from an order.
//
// Phase 43 Plan 10a. Mutations => both route through the domain layer
// (Regla 3) via `addOrderTag` / `removeOrderTag` in src/lib/domain/orders.ts.
// Those functions delegate to the shared tag logic in src/lib/domain/tags.ts
// (single source of truth for tag mutations).
//
// Same UI contract as contact tags: client sends tagId, server resolves to
// tag name before calling domain. Matches the web server-action pattern.
//
// Contract:
//   POST request:     { tagId: string }        AddTagRequestSchema
//   DELETE query:     ?tagId=:uuid
//   response:         { ok: true, tag_id: id } TagMutationResponseSchema

import { NextResponse } from 'next/server'

import {
  addOrderTag as domainAddOrderTag,
  removeOrderTag as domainRemoveOrderTag,
} from '@/lib/domain/orders'
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
    const { id: orderId } = await ctx.params

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

    const result = await domainAddOrderTag(
      { workspaceId, source: 'mobile-api' },
      { orderId, tagName }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'add_order_tag_failed')
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
    const { id: orderId } = await ctx.params

    const url = new URL(req.url)
    const tagId = url.searchParams.get('tagId')
    if (!tagId) {
      throw new MobileValidationError('bad_request', 'Missing tagId')
    }

    const admin = createAdminClient()
    const tagName = await resolveTagName(admin, workspaceId, tagId)

    const result = await domainRemoveOrderTag(
      { workspaceId, source: 'mobile-api' },
      { orderId, tagName }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'remove_order_tag_failed')
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
