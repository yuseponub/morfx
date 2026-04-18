// POST /api/mobile/orders/:id/recompra — clone an order as a "recompra" into
// the workspace's `RECOMPRA_PIPELINE_NAME` pipeline.
//
// Phase 43 Plan 10a. Mutation => routes through the domain layer (Regla 3)
// via `recompraOrder` in src/lib/domain/orders.ts.
//
// Mobile v1 UX: user taps a button on a recent order and we produce a clone
// with the SAME products as the source — no product editor on mobile (per
// 43-CONTEXT Out of Scope). The web's richer recompra flow lets the user
// pick products; the mobile flow defers that to the web (the "Ver en CRM"
// deep link opens the new recompra for editing).
//
// Since `recompraOrder` domain REQUIRES a non-empty `products` array, this
// endpoint reads the source order's products first and feeds them into the
// domain call. Net result: the domain-layer contract stays intact (single
// source of truth), and the mobile UX stays simple.
//
// Contract:
//   request:  { targetStageId?: string }   RecompraOrderRequestSchema
//   response: { order: MobileOrder }       RecompraOrderResponseSchema

import { NextResponse } from 'next/server'

import { recompraOrder as domainRecompraOrder } from '@/lib/domain/orders'
import { createAdminClient } from '@/lib/supabase/admin'

import {
  RecompraOrderRequestSchema,
  RecompraOrderResponseSchema,
  type MobileOrder,
  type MobileTag,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  MobileValidationError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

interface TagRef {
  id: string
  name: string
  color: string
}

interface StageRef {
  id: string
  name: string
  color: string
  pipeline_id: string
}

interface PipelineRef {
  id: string
  name: string
}

interface OrderReadRow {
  id: string
  name: string | null
  total_value: number | null
  created_at: string
  stage_id: string
  stage: StageRef | StageRef[] | null
  pipeline: PipelineRef | PipelineRef[] | null
  order_tags: Array<{ tag: TagRef | null }> | null
}

interface SourceProductRow {
  product_id: string | null
  sku: string | null
  title: string | null
  unit_price: number | null
  quantity: number | null
}

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function readMobileOrder(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  orderId: string
): Promise<MobileOrder | null> {
  const { data, error } = await admin
    .from('orders')
    .select(
      `
      id, name, total_value, created_at, stage_id,
      stage:pipeline_stages(id, name, color, pipeline_id),
      pipeline:pipelines(id, name),
      order_tags(tag:tags(id, name, color))
    `
    )
    .eq('id', orderId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as unknown as OrderReadRow
  const stage = unwrapSingle(row.stage)
  const pipeline = unwrapSingle(row.pipeline)
  if (!stage || !pipeline) return null

  const tags: MobileTag[] = []
  for (const ot of row.order_tags ?? []) {
    if (ot?.tag) {
      tags.push({
        id: ot.tag.id,
        name: ot.tag.name,
        color: ot.tag.color,
      })
    }
  }

  return {
    id: row.id,
    name: row.name,
    total: row.total_value ?? 0,
    currency: 'COP',
    stage_id: row.stage_id,
    stage_name: stage.name,
    stage_color: stage.color,
    pipeline_id: pipeline.id,
    pipeline_name: pipeline.name,
    created_at: row.created_at,
    tags,
  }
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: sourceOrderId } = await ctx.params

    let json: unknown = {}
    // Body is optional (targetStageId) — accept empty.
    try {
      const text = await req.text()
      if (text.length > 0) json = JSON.parse(text)
    } catch {
      throw new MobileValidationError('bad_request', 'Invalid JSON body')
    }

    const parsed = RecompraOrderRequestSchema.safeParse(json)
    if (!parsed.success) {
      throw new MobileValidationError('bad_request', 'Invalid payload')
    }

    const admin = createAdminClient()

    // 1. Verify source order belongs to workspace + read its products.
    const { data: srcOrder, error: srcErr } = await admin
      .from('orders')
      .select('id, order_products:order_products(product_id, sku, title, unit_price, quantity)')
      .eq('id', sourceOrderId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (srcErr) {
      console.error('[mobile-api/recompra] source query failed', srcErr)
      throw srcErr
    }
    if (!srcOrder) {
      throw new MobileNotFoundError(
        'not_found',
        'Source order not found in workspace'
      )
    }

    const srcProducts = ((srcOrder as { order_products: SourceProductRow[] })
      .order_products ?? [])
      .filter(
        (p): p is SourceProductRow & { sku: string; title: string; unit_price: number; quantity: number } =>
          typeof p.sku === 'string' &&
          typeof p.title === 'string' &&
          typeof p.unit_price === 'number' &&
          typeof p.quantity === 'number'
      )

    if (srcProducts.length === 0) {
      throw new MobileValidationError(
        'source_empty',
        'El pedido origen no tiene productos — no se puede recomprar'
      )
    }

    // 2. Regla 3 — domain call. recompraOrder enforces pipeline name lookup
    //    + stage validation + transactional cleanup (rollback on failure).
    const result = await domainRecompraOrder(
      { workspaceId, source: 'mobile-api' },
      {
        sourceOrderId,
        targetStageId: parsed.data.targetStageId ?? null,
        products: srcProducts.map((p) => ({
          product_id: p.product_id,
          sku: p.sku,
          title: p.title,
          unit_price: p.unit_price,
          quantity: p.quantity,
        })),
      }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no existe') || msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'recompra_failed')
    }

    // 3. Read back the new order in the wire shape.
    const order = await readMobileOrder(admin, workspaceId, result.data!.orderId)
    if (!order) {
      throw new Error('recompra order not readable')
    }

    const body = RecompraOrderResponseSchema.parse({ order })

    return NextResponse.json(body, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
