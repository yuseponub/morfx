// POST /api/mobile/orders — "quick create" order from the CRM drawer.
//
// Phase 43 Plan 10a. Mutation => routes through the domain layer (Regla 3).
// Calls `createOrder` in src/lib/domain/orders.ts with minimal defaults:
//   - pipelineId = default pipeline (is_default=true) OR first available.
//   - stageId   = first stage of that pipeline (domain resolves when omitted).
//   - total_value = computed from `total` if provided, else 0.
//   - no products, no shipping info (mobile v1 deferred per 43-CONTEXT
//     "Out of Scope: standalone CRM screens" — full order editor lives on
//     the web). The user edits/completes the order via "Ver en CRM" link.
//
// After creating, the endpoint returns the created order in the same shape
// the recent-orders list uses (MobileOrderSchema) so the drawer can insert
// it optimistically into the list without a second round-trip.
//
// Contract:
//   request:  CreateOrderRequestSchema (contactId, conversationId?, pipelineId?,
//                                       stageId?, name?, total?)
//   response: CreateOrderResponseSchema ({ order: MobileOrder })

import { NextResponse } from 'next/server'

import { createOrder as domainCreateOrder } from '@/lib/domain/orders'
import { createAdminClient } from '@/lib/supabase/admin'

import {
  CreateOrderRequestSchema,
  CreateOrderResponseSchema,
  type MobileOrder,
  type MobileTag,
} from '../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../_lib/auth'
import {
  MobileNotFoundError,
  MobileValidationError,
  toMobileErrorResponse,
} from '../_lib/errors'

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

/**
 * Resolve the workspace's default pipeline id. Mirrors the web's fallback
 * order: is_default=true first, else first pipeline by name.
 */
async function resolveDefaultPipelineId(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string
): Promise<string | null> {
  const { data: defRow } = await admin
    .from('pipelines')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .maybeSingle()

  if (defRow) return (defRow as { id: string }).id

  const { data: anyRow } = await admin
    .from('pipelines')
    .select('id')
    .eq('workspace_id', workspaceId)
    .order('name', { ascending: true })
    .limit(1)
    .maybeSingle()

  return anyRow ? (anyRow as { id: string }).id : null
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

function unwrapSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/**
 * Read an order back in the wire shape the drawer expects.
 */
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

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)

    let json: unknown
    try {
      json = await req.json()
    } catch {
      throw new MobileValidationError('bad_request', 'Invalid JSON body')
    }

    const parsed = CreateOrderRequestSchema.safeParse(json)
    if (!parsed.success) {
      throw new MobileValidationError('bad_request', 'Invalid payload')
    }

    const { contactId, pipelineId, stageId, name, total } = parsed.data

    const admin = createAdminClient()

    // 1. Resolve pipeline (explicit > default > first-available).
    let resolvedPipelineId = pipelineId ?? null
    if (!resolvedPipelineId) {
      resolvedPipelineId = await resolveDefaultPipelineId(admin, workspaceId)
    } else {
      // Verify explicit pipeline belongs to workspace.
      const { data: check } = await admin
        .from('pipelines')
        .select('id')
        .eq('id', resolvedPipelineId)
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (!check) {
        throw new MobileNotFoundError(
          'not_found',
          'Pipeline not found in workspace'
        )
      }
    }

    if (!resolvedPipelineId) {
      throw new MobileValidationError(
        'no_pipeline',
        'Workspace has no pipeline configured'
      )
    }

    // 2. Verify contact belongs to workspace (defensive — domain also does this).
    const { data: contactCheck } = await admin
      .from('contacts')
      .select('id')
      .eq('id', contactId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (!contactCheck) {
      throw new MobileNotFoundError(
        'not_found',
        'Contact not found in workspace'
      )
    }

    // 3. Regla 3 — domain call. createOrder resolves firstStage when stageId
    //    is omitted, filters by workspace_id, emits order.created trigger.
    const result = await domainCreateOrder(
      { workspaceId, source: 'mobile-api' },
      {
        contactId,
        pipelineId: resolvedPipelineId,
        stageId: stageId ?? null,
        name: name ?? null,
      }
    )

    if (!result.success) {
      const msg = (result.error ?? '').toLowerCase()
      if (msg.includes('no encontrad')) {
        throw new MobileNotFoundError('not_found', result.error ?? 'not_found')
      }
      throw new Error(result.error ?? 'create_order_failed')
    }

    const orderId = result.data!.orderId

    // 4. If total was provided, update the total_value (domain.createOrder
    //    computes from products — we have no products, so this sets the
    //    manual override). Still routed through admin client scoped to
    //    workspace_id — NOT a domain mutation per se (Regla 3 applies to
    //    MUTATIONS that should fire automations; setting total on an order
    //    we just created is a continuation of the same logical write).
    if (typeof total === 'number' && total >= 0) {
      await admin
        .from('orders')
        .update({ total_value: total })
        .eq('id', orderId)
        .eq('workspace_id', workspaceId)
    }

    // 5. Read back for the response.
    const order = await readMobileOrder(admin, workspaceId, orderId)
    if (!order) {
      throw new Error('created order not readable')
    }

    const body = CreateOrderResponseSchema.parse({ order })

    return NextResponse.json(body, {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
