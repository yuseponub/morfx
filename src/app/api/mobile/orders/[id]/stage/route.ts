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
    const authCtx = await requireMobileAuth(req)
    const { workspaceId, user } = authCtx  // BLOCKER 2 fix Plan 02 — user.id para actorId
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
      {
        workspaceId,
        source: 'mobile-api',
        actorId: user.id,           // real user.id del JWT (Plan 02 Task 4)
        actorLabel: 'mobile-api',   // label hardcoded — no display-name lookup en mobile route
      },
      { orderId, newStageId: parsed.data.stageId }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      // D-15 narrow: stage_changed_concurrently -> 409 Conflict con currentStageId
      // para que el cliente mobile (Phase 43) pueda distinguir del error generico
      // y refrescar la vista sin romper el flujo de drag.
      if (result.error === 'stage_changed_concurrently') {
        return NextResponse.json(
          {
            error: 'stage_changed_concurrently',
            currentStageId:
              (result.data as { currentStageId?: string | null } | undefined)?.currentStageId ?? null,
          },
          { status: 409, headers: { 'Cache-Control': 'no-store' } },
        )
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
