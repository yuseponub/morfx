// ============================================================================
// Unit test — `logCascadeCap` helper from automation-runner (D-07 layer 3,
// D-18, D-25).
//
// WARNING 3 fix: imports the exported helper DIRECTLY, so the insert payload
// shape for `order_stage_history` rows with `source='cascade_capped'` is
// validated at test time. If the runner's cap-audit logic drifts (e.g. label
// wording changes, cascade_depth dropped), tests fail.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logCascadeCap } from '@/inngest/functions/automation-runner'
import { MAX_CASCADE_DEPTH } from '@/lib/automations/constants'

/**
 * Build an admin-client mock that supports the cascade-cap insert shape:
 *   .from('order_stage_history').insert({...})
 */
function buildAdminMock() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn(() => ({ insert }))
  return {
    admin: { from } as unknown as ReturnType<
      typeof import('@/lib/supabase/admin').createAdminClient
    >,
    insert,
    fromFn: from,
  }
}

describe('logCascadeCap (automation-runner exported helper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('inserts row with source=cascade_capped + actor_label + cascade_depth + trigger_event', async () => {
    const { admin, insert, fromFn } = buildAdminMock()
    await logCascadeCap(admin, {
      orderId: 'order-abc',
      workspaceId: 'ws-1',
      prevStageId: 'stage-A',
      newStageId: 'stage-B',
      cascadeDepth: MAX_CASCADE_DEPTH,
      triggerType: 'order.stage_changed',
    })

    expect(fromFn).toHaveBeenCalledWith('order_stage_history')
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toMatchObject({
      order_id: 'order-abc',
      workspace_id: 'ws-1',
      previous_stage_id: 'stage-A',
      new_stage_id: 'stage-B',
      source: 'cascade_capped',
      actor_id: null,
      actor_label: `Cascade capped at depth ${MAX_CASCADE_DEPTH}`,
      cascade_depth: MAX_CASCADE_DEPTH,
      trigger_event: 'order.stage_changed',
    })
  })

  it('newStageId fallback: null → uses prevStageId', async () => {
    const { admin, insert } = buildAdminMock()
    await logCascadeCap(admin, {
      orderId: 'order-abc',
      workspaceId: 'ws-1',
      prevStageId: 'stage-A',
      newStageId: null,
      cascadeDepth: 3,
      triggerType: 'order.stage_changed',
    })
    const payload = insert.mock.calls[0][0] as { new_stage_id: string }
    expect(payload.new_stage_id).toBe('stage-A')
  })

  it('newStageId fallback: null AND prevStageId null → empty string', async () => {
    const { admin, insert } = buildAdminMock()
    await logCascadeCap(admin, {
      orderId: 'order-abc',
      workspaceId: 'ws-1',
      prevStageId: null,
      newStageId: null,
      cascadeDepth: 3,
      triggerType: 'order.stage_changed',
    })
    const payload = insert.mock.calls[0][0] as { new_stage_id: string }
    expect(payload.new_stage_id).toBe('')
  })

  it('actor_label scales with cascadeDepth value', async () => {
    const { admin, insert } = buildAdminMock()
    await logCascadeCap(admin, {
      orderId: 'o',
      workspaceId: 'w',
      prevStageId: null,
      newStageId: 'x',
      cascadeDepth: 7,
      triggerType: 'order.stage_changed',
    })
    const payload = insert.mock.calls[0][0] as { actor_label: string }
    expect(payload.actor_label).toBe('Cascade capped at depth 7')
  })

  it('actor_id is always null (system action, no authenticated actor)', async () => {
    const { admin, insert } = buildAdminMock()
    await logCascadeCap(admin, {
      orderId: 'o',
      workspaceId: 'w',
      prevStageId: null,
      newStageId: 'x',
      cascadeDepth: 3,
      triggerType: 'order.stage_changed',
    })
    const payload = insert.mock.calls[0][0] as { actor_id: string | null }
    expect(payload.actor_id).toBeNull()
  })

  it('trigger_event is preserved literally (useful for debugging non-stage_changed runners in the future)', async () => {
    const { admin, insert } = buildAdminMock()
    await logCascadeCap(admin, {
      orderId: 'o',
      workspaceId: 'w',
      prevStageId: null,
      newStageId: 'x',
      cascadeDepth: 3,
      triggerType: 'order.stage_changed',
    })
    const payload = insert.mock.calls[0][0] as { trigger_event: string }
    expect(payload.trigger_event).toBe('order.stage_changed')
  })
})
