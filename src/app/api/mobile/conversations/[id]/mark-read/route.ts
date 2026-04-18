// POST /api/mobile/conversations/:id/mark-read
//
// Phase 43 Plan 08. Routes through the domain layer (Regla 3) because
// flipping `unread_count` -> 0 and `is_read` -> true is a mutation.
//
// Returns `{ ok: true }` on success. A 404 is returned if the conversation
// does not belong to the authenticated workspace (prevents cross-workspace
// mutation and information leaks).

import { NextResponse } from 'next/server'

import { markConversationRead } from '@/lib/domain/conversations'

import {
  MarkReadResponseSchema,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: conversationId } = await ctx.params

    const result = await markConversationRead(
      { workspaceId, source: 'mobile-api' },
      { conversationId }
    )

    if (!result.success) {
      // Domain layer returns 'Conversacion no encontrada' for cross-workspace
      // or non-existent ids. Map that to 404 for the mobile client.
      const msg = result.error ?? ''
      if (msg.toLowerCase().includes('no encontrada')) {
        throw new MobileNotFoundError(
          'not_found',
          'Conversation not found in workspace'
        )
      }
      // Any other domain failure bubbles up as 500 via toMobileErrorResponse.
      throw new Error(result.error ?? 'mark_read_failed')
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
