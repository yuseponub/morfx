/**
 * Integration test — order_stage_history es append-only (D-13 + D-25).
 *
 * Verifica que el trigger plpgsql (Plan 01 migration) bloquea UPDATE y DELETE
 * sobre order_stage_history incluso con service_role (RLS bypass). La unica
 * operacion permitida es INSERT; cualquier otra mutation debe fallar con un
 * mensaje que contenga 'append-only'.
 *
 * Requiere env vars — ver .env.test.example en la raiz del repo.
 * Si env vars missing -> tests SKIP (WARNING 2 pattern).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_PIPELINE_ID = process.env.TEST_PIPELINE_ID ?? ''
const STAGE_A = process.env.TEST_STAGE_A ?? ''

const envReady = Boolean(
  SUPABASE_URL && SERVICE_ROLE_KEY && TEST_WORKSPACE_ID &&
  TEST_PIPELINE_ID && STAGE_A,
)

const admin = envReady ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null

describe.skipIf(!envReady)('order_stage_history append-only enforcement', () => {
  let orderId: string
  let historyId: string

  beforeEach(async () => {
    const { data: order, error: oerr } = await admin!
      .from('orders')
      .insert({
        workspace_id: TEST_WORKSPACE_ID,
        stage_id: STAGE_A,
        pipeline_id: TEST_PIPELINE_ID,
        name: 'TEST RLS',
      })
      .select('id')
      .single()
    if (oerr) throw oerr
    orderId = order.id as string

    const { data: row, error: herr } = await admin!
      .from('order_stage_history')
      .insert({
        order_id: orderId,
        workspace_id: TEST_WORKSPACE_ID,
        previous_stage_id: null,
        new_stage_id: STAGE_A,
        source: 'system',
        actor_label: 'rls-test',
      })
      .select('id')
      .single()
    if (herr) throw herr
    historyId = row.id as string
  })

  afterEach(async () => {
    // ON DELETE CASCADE del orders FK borra la row de history tambien
    // (cascade es permitido por el trigger — solo mutations directas fallan).
    await admin!.from('orders').delete().eq('id', orderId)
  })

  it('INSERT succeeds', () => {
    expect(historyId).toBeTruthy()
  })

  it('UPDATE rejected by trigger with service_role', async () => {
    const { error } = await admin!
      .from('order_stage_history')
      .update({ source: 'manual' })
      .eq('id', historyId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/append-only/i)
  })

  it('DELETE rejected by trigger with service_role', async () => {
    const { error } = await admin!
      .from('order_stage_history')
      .delete()
      .eq('id', historyId)
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/append-only/i)
  })
})
