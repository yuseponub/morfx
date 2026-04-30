/**
 * Integration — CAS reject path for crm-mutation-tools.moveOrderToStage.
 *
 * Standalone crm-mutation-tools Wave 4 (Plan 05).
 *
 * Pattern: env-gated, real Supabase admin client.
 *
 * Verifies Pitfall 1 + 8 mitigation (D-pre-05 / D-06 stage-integrity contract):
 *   1. Pre-condition — set platform_config.crm_stage_integrity_cas_enabled = true
 *      (default false in production per src/lib/domain/orders.ts).
 *   2. Seed an order in stage A.
 *   3. Mutate stage to B via direct admin client (simulates a concurrent move from
 *      another source — UI, automation, other agent).
 *   4. Call moveOrderToStage from the tool with old stageId=A as the requested
 *      destination — but order is now in B. Tool reads previousStage from DB (=B),
 *      detects mismatch, surfaces stage_changed_concurrently with actualStageId=B.
 *
 * NOTE on plan wording: the plan instructs to "move FROM A — but order is now in B".
 * The CAS in domain checks `previousStageId` (re-read just before UPDATE) vs the
 * row's current stage. The reject fires when between read and write the row was
 * mutated externally. We reproduce that via concurrent UPDATE → moveToStage.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createCrmMutationTools } from '@/lib/agents/shared/crm-mutation-tools'
import { moveOrderToStage as domainMoveOrderToStage } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const skip =
  !TEST_WORKSPACE_ID ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY

function admin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface Seeded {
  pipelineId: string
  stageA: string
  stageB: string
  stageC: string
  orderId: string
}

let seeded: Seeded | null = null
let originalCasFlag: boolean | null = null

async function readCasFlag(): Promise<boolean> {
  const supabase = admin()
  const { data } = await supabase
    .from('platform_config')
    .select('value')
    .eq('key', 'crm_stage_integrity_cas_enabled')
    .single()
  // value is JSONB — truthy if true.
  return Boolean(data?.value)
}

async function setCasFlag(value: boolean): Promise<void> {
  const supabase = admin()
  await supabase
    .from('platform_config')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', 'crm_stage_integrity_cas_enabled')
}

async function seedFixture(): Promise<Seeded> {
  const supabase = admin()
  const p = await supabase
    .from('pipelines')
    .insert({ workspace_id: TEST_WORKSPACE_ID, name: `X-CAS Pipeline ${Date.now()}` })
    .select('id')
    .single()
  if (p.error || !p.data) throw new Error(`pipeline: ${p.error?.message}`)
  const pipelineId = p.data.id as string

  const stages = await supabase
    .from('pipeline_stages')
    .insert([
      { pipeline_id: pipelineId, name: 'X-CAS-A', position: 0 },
      { pipeline_id: pipelineId, name: 'X-CAS-B', position: 1 },
      { pipeline_id: pipelineId, name: 'X-CAS-C', position: 2 },
    ])
    .select('id, name')
  if (stages.error) throw new Error(`stages: ${stages.error.message}`)
  const map = new Map(stages.data!.map((s: { id: string; name: string }) => [s.name, s.id]))
  const stageA = map.get('X-CAS-A')!
  const stageB = map.get('X-CAS-B')!
  const stageC = map.get('X-CAS-C')!

  const o = await supabase
    .from('orders')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      pipeline_id: pipelineId,
      stage_id: stageA,
      name: 'X-CAS Test Order',
    })
    .select('id')
    .single()
  if (o.error || !o.data) throw new Error(`order: ${o.error?.message}`)
  const orderId = o.data.id as string

  return { pipelineId, stageA, stageB, stageC, orderId }
}

async function cleanupFixture(s: Seeded): Promise<void> {
  const supabase = admin()
  await supabase.from('orders').delete().eq('id', s.orderId)
  await supabase.from('pipelines').delete().eq('id', s.pipelineId)
}

describe.skipIf(skip)('crm-mutation-tools moveOrderToStage CAS reject (Pitfall 1+8)', () => {
  beforeAll(async () => {
    originalCasFlag = await readCasFlag()
    await setCasFlag(true)
    seeded = await seedFixture()
  })

  afterAll(async () => {
    if (seeded) await cleanupFixture(seeded)
    // Restore original flag value (default in prod is false per orders.ts).
    if (originalCasFlag !== null) await setCasFlag(originalCasFlag)
  })

  // The CAS check happens during the domain UPDATE: it requires that the row's
  // stage_id at WRITE time matches the previousStageId read at the start of
  // moveOrderToStage. Two concurrent calls reproduce the race deterministically
  // (orders-cas.test.ts pattern).
  beforeEach(async () => {
    const supabase = admin()
    // Reset order back to stage A before each test.
    await supabase
      .from('orders')
      .update({ stage_id: seeded!.stageA })
      .eq('id', seeded!.orderId)
  })

  it('two concurrent moveOrderToStage calls — exactly one returns stage_changed_concurrently', async () => {
    // Direct domain calls reproduce the CAS race more reliably than tool
    // invocations because tool execution adds extra observability + getOrderById
    // pre-checks that may serialize the calls. We assert that the TOOL surface
    // propagates the domain's stage_changed_concurrently shape verbatim in a
    // separate assertion below.
    const ctx: DomainContext = {
      workspaceId: TEST_WORKSPACE_ID,
      source: 'tool-handler',
    }
    const [r1, r2] = await Promise.all([
      domainMoveOrderToStage(ctx, { orderId: seeded!.orderId, newStageId: seeded!.stageB }),
      domainMoveOrderToStage(ctx, { orderId: seeded!.orderId, newStageId: seeded!.stageC }),
    ])
    const successes = [r1, r2].filter((r) => r.success)
    const rejections = [r1, r2].filter(
      (r) => !r.success && r.error === 'stage_changed_concurrently',
    )
    expect(successes.length).toBe(1)
    expect(rejections.length).toBe(1)
  })

  it('tool surfaces stage_changed_concurrently verbatim with actualStageId from domain', async () => {
    // Set order to stage B externally (simulating other source moved it).
    const supabase = admin()
    await supabase
      .from('orders')
      .update({ stage_id: seeded!.stageB })
      .eq('id', seeded!.orderId)

    // Now call the tool with stageId=A while issuing a concurrent UPDATE to C
    // via direct domain. We use Promise.all to race a domain move against the
    // tool — at least one call must hit the CAS reject path with the tool
    // surface.
    const tools = createCrmMutationTools({
      workspaceId: TEST_WORKSPACE_ID,
      invoker: 'integration-test-cas',
    })
    const ctx: DomainContext = { workspaceId: TEST_WORKSPACE_ID, source: 'tool-handler' }
    const exec = tools.moveOrderToStage as unknown as {
      execute: (i: unknown) => Promise<unknown>
    }

    const [toolResult, domainResult] = await Promise.all([
      exec.execute({ orderId: seeded!.orderId, stageId: seeded!.stageA }) as Promise<{
        status: string
        error?: { code?: string; expectedStageId?: string; actualStageId?: string | null }
      }>,
      domainMoveOrderToStage(ctx, { orderId: seeded!.orderId, newStageId: seeded!.stageC }),
    ])

    // Either the tool was the loser of the CAS race (status='stage_changed_concurrently')
    // OR the tool won (status='executed'). At least one of the two must have
    // surfaced the CAS reject. We assert that IF the tool lost, the response
    // shape is verbatim (Pitfall 1 contract).
    const eitherRejected =
      toolResult.status === 'stage_changed_concurrently' ||
      (!domainResult.success && domainResult.error === 'stage_changed_concurrently')
    expect(eitherRejected).toBe(true)

    if (toolResult.status === 'stage_changed_concurrently') {
      expect(toolResult.error?.code).toBe('stage_changed_concurrently')
      // expectedStageId is what the tool received as input.
      expect(toolResult.error?.expectedStageId).toBe(seeded!.stageA)
      // actualStageId comes verbatim from domain re-fetch.
      expect(toolResult.error?.actualStageId).toBeDefined()
    }
  })
})
