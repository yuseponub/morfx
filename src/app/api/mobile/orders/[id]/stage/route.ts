// POST /api/mobile/orders/:id/stage — move an order to a new pipeline stage.
//
// Phase 43 Plan 10a. Mutation => routes through the domain layer (Regla 3).
// Calls `moveOrderToStage` in src/lib/domain/orders.ts which emits the
// order.stage_changed trigger (automation pipeline stays identical to the
// web path).
//
// Contract:
//   request:  { stageId: string }                    MoveOrderStageRequestSchema
//   response: { ok: true, order_id, previous_stage_id, new_stage_id }
//                                                     MoveOrderStageResponseSchema

import { NextResponse } from 'next/server'

import { moveOrderToStage as domainMoveOrderToStage } from '@/lib/domain/orders'

import {
  MoveOrderStageRequestSchema,
  MoveOrderStageResponseSchema,
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
    const { id: orderId } = await ctx.params

    let json: unknown
    try {
      json = await req.json()
    } catch {
      throw new MobileValidationError('bad_request', 'Invalid JSON body')
    }

    const parsed = MoveOrderStageRequestSchema.safeParse(json)
    if (!parsed.success) {
      throw new MobileValidationError('bad_request', 'Invalid stageId')
    }

    const result = await domainMoveOrderToStage(
      { workspaceId, source: 'mobile-api' },
      { orderId, newStageId: parsed.data.stageId }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'move_stage_failed')
    }

    const body = MoveOrderStageResponseSchema.parse({
      ok: true,
      order_id: result.data!.orderId,
      previous_stage_id: result.data!.previousStageId,
      new_stage_id: result.data!.newStageId,
    })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
