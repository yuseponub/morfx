/**
 * Integration test — CAS rechaza UPDATE concurrente en moveOrderToStage.
 * D-04 + D-25 RESEARCH (crm-stage-integrity) §Validation Architecture.
 *
 * Requiere env vars — ver .env.test.example en la raiz del repo.
 * Si env vars missing -> tests SKIP (no fail, no pass silencioso).
 *
 * Corre contra Supabase real (admin client con service_role). Usa TEST_WORKSPACE_ID
 * aislado — nunca usar workspace productivo.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { moveOrderToStage } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
const STAGE_A = process.env.TEST_STAGE_A ?? ''
const STAGE_B = process.env.TEST_STAGE_B ?? ''
const STAGE_C = process.env.TEST_STAGE_C ?? ''

const envReady = Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID &&
  TEST_PIPELINE_ID && STAGE_A && STAGE_B && STAGE_C
)

const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

// ---------- helpers (only invoked when envReady) ----------

async function seedOrder(stageId: string): Promise<string> {
  const { data, error } = await admin!
    .from('orders')
    .insert({
      workspace_id: TEST_WORKSPACE_ID,
      stage_id: stageId,
      pipeline_id: TEST_PIPELINE_ID,
      name: 'TEST CAS',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function setFlag(key: string, value: boolean) {
  // platform_config.value es JSONB — escribir booleano como valor JSON
  await admin!
    .from('platform_config')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key)
}

async function cleanupOrder(orderId: string) {
  // ON DELETE CASCADE de orders borra order_stage_history tambien
  await admin!.from('orders').delete().eq('id', orderId)
}

const ctx: DomainContext = {
  workspaceId: TEST_WORKSPACE_ID,
  source: 'server-action',
  actorId: null,
  actorLabel: 'test',
}

// ---------- tests ----------

describe.skipIf(!envReady)('moveOrderToStage CAS (flag ON)', () => {
  let orderId: string

  beforeEach(async () => {
    await setFlag('crm_stage_integrity_cas_enabled', true)
    orderId = await seedOrder(STAGE_A)
  })

  afterEach(async () => {
    await setFlag('crm_stage_integrity_cas_enabled', false)
    await cleanupOrder(orderId)
  })

  it('CAS rechaza 2do UPDATE concurrente con mismo previousStageId', async () => {
    // Ambos leen previousStageId=A simultaneamente; solo uno commitea el UPDATE.
    const [r1, r2] = await Promise.all([
      moveOrderToStage(ctx, { orderId, newStageId: STAGE_B }),
      moveOrderToStage(ctx, { orderId, newStageId: STAGE_C }),
    ])

    const successes = [r1, r2].filter((r) => r.success)
    const rejections = [r1, r2].filter(
      (r) => !r.success && r.error === 'stage_changed_concurrently',
    )

    expect(successes.length).toBe(1)
    expect(rejections.length).toBe(1)
    expect((rejections[0] as { data?: { currentStageId?: string | null } }).data?.currentStageId)
      .toBeDefined()
  })

  it('same-stage drop NO dispara CAS reject (short-circuit Pitfall 2)', async () => {
    const result = await moveOrderToStage(ctx, { orderId, newStageId: STAGE_A })
    expect(result.success).toBe(true)
    // Short-circuit antes del CAS: history NO recibe row
    const { count } = await admin!
      .from('order_stage_history')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
    expect(count ?? 0).toBe(0)
  })

  it('history insert best-effort: actor_id invalido no rompe move (Pitfall 3)', async () => {
    // actor_id con UUID valido pero no presente en auth.users -> FK violation en INSERT
    // history. El move ya succeded; console.error loggea pero retorna success.
    const result = await moveOrderToStage(
      { ...ctx, actorId: '00000000-0000-0000-0000-000000000000' },
      { orderId, newStageId: STAGE_B },
    )
    expect(result.success).toBe(true)
  })
})

describe.skipIf(!envReady)('moveOrderToStage legacy (flag OFF)', () => {
  let orderId: string

  beforeEach(async () => {
    await setFlag('crm_stage_integrity_cas_enabled', false)
    orderId = await seedOrder(STAGE_A)
  })

  afterEach(async () => {
    await cleanupOrder(orderId)
  })

  it('flag OFF -> UPDATE sin CAS, comportamiento byte-identical al actual', async () => {
    const result = await moveOrderToStage(ctx, { orderId, newStageId: STAGE_B })
    expect(result.success).toBe(true)

    // Historia SI se escribe (D-18: additive sin flag)
    const { count } = await admin!
      .from('order_stage_history')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
    expect(count ?? 0).toBe(1)
  })
})
