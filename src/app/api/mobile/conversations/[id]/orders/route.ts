// GET /api/mobile/conversations/:id/orders — recent orders for the
// conversation's linked contact, shaped for the in-chat CRM drawer.
//
// Phase 43 Plan 10a. Read-only endpoint (Regla 3 applies to mutations only).
// Uses createAdminClient to bypass RLS and filters by workspace_id +
// contact_id (derived from the conversation). Limit 10, ordered by
// created_at DESC.
//
// Contract: MobileRecentOrdersResponseSchema in shared/mobile-api/schemas.ts.
//
// Shape translation:
//   - `total_value` column -> `total` wire field (number, COP).
//   - `stage` join -> flattened as stage_id/stage_name/stage_color.
//   - `pipeline` join -> flattened as pipeline_id/pipeline_name (needed by
//     Plan 10b stage-picker to know which pipeline to show stages from).
//   - tags from `order_tags` junction.
//
// If the conversation has no linked contact, returns `{ orders: [] }` —
// never an error (the drawer renders the empty state in that case).

import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'

import {
  MobileRecentOrdersResponseSchema,
  type MobileOrder,
  type MobileTag,
} from '../../../../../../../shared/mobile-api/schemas'

import { requireMobileAuth } from '../../../_lib/auth'
import {
  MobileNotFoundError,
  toMobileErrorResponse,
} from '../../../_lib/errors'

export const dynamic = 'force-dynamic'

const RECENT_LIMIT = 10

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

interface OrderRow {
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

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId } = await requireMobileAuth(req)
    const { id: conversationId } = await ctx.params

    const admin = createAdminClient()

    // 1. Resolve contact id from the conversation (workspace-scoped).
    const { data: convo, error: convoErr } = await admin
      .from('conversations')
      .select('id, contact_id')
      .eq('id', conversationId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (convoErr) {
      console.error('[mobile-api/orders:list] convo query failed', convoErr)
      throw convoErr
    }
    if (!convo) {
      throw new MobileNotFoundError(
        'not_found',
        'Conversation not found in workspace'
      )
    }

    const contactId = (convo as { contact_id: string | null }).contact_id
    if (!contactId) {
      // Unknown contact => empty list (drawer empty state in Plan 10b).
      const body = MobileRecentOrdersResponseSchema.parse({ orders: [] })
      return NextResponse.json(body, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    }

    // 2. Fetch recent orders (limit, DESC by created_at).
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
      .eq('workspace_id', workspaceId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(RECENT_LIMIT)

    if (error) {
      console.error('[mobile-api/orders:list] orders query failed', error)
      throw error
    }

    const rows = (data ?? []) as unknown as OrderRow[]

    const orders: MobileOrder[] = []
    for (const row of rows) {
      const stage = unwrapSingle(row.stage)
      const pipeline = unwrapSingle(row.pipeline)
      // Skip orders with no stage / pipeline — data integrity should prevent
      // this but defensive programming keeps the response valid per schema.
      if (!stage || !pipeline) continue

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

      orders.push({
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
      })
    }

    const body = MobileRecentOrdersResponseSchema.parse({ orders })

    return NextResponse.json(body, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (err) {
    return toMobileErrorResponse(err)
  }
}
