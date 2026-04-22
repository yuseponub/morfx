// ============================================================================
// Unit test — `checkKillSwitch` helper from automation-runner (D-07 layer 2,
// D-20, D-25).
//
// WARNING 3 fix: imports the exported helper DIRECTLY (not a re-implementation
// inline). This guarantees that if the runner's kill-switch logic changes in
// the future (e.g. threshold hardcoded from 5 → 10), the regression is caught
// at test time, not in production.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkKillSwitch } from '@/inngest/functions/automation-runner'

/**
 * Build a chainable admin-client mock that supports the kill-switch query shape:
 *   .from('order_stage_history')
 *     .select('id', { count: 'exact', head: true })
 *     .eq('order_id', ...)
 *     .neq('source', 'manual')
 *     .gt('changed_at', ...)
 */
function buildAdminMock(response: { count: number | null; error: { message: string } | null }) {
  const gt = vi.fn().mockResolvedValue(response)
  const neq = vi.fn(() => ({ gt }))
  const eq = vi.fn(() => ({ neq }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return {
    admin: { from } as unknown as ReturnType<
      typeof import('@/lib/supabase/admin').createAdminClient
    >,
    gt,
    neq,
    eq,
    select,
    fromFn: from,
  }
}

describe('checkKillSwitch (automation-runner exported helper)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('count=0 → shouldSkip=false (below threshold)', async () => {
    const { admin, fromFn, gt } = buildAdminMock({ count: 0, error: null })
    const result = await checkKillSwitch(admin, 'order-123')
    expect(fromFn).toHaveBeenCalledWith('order_stage_history')
    expect(gt).toHaveBeenCalledWith('changed_at', expect.any(String))
    expect(result).toEqual({ shouldSkip: false, recentChanges: 0 })
  })

  it('count=3 → shouldSkip=false (still below threshold=5)', async () => {
    const { admin } = buildAdminMock({ count: 3, error: null })
    const result = await checkKillSwitch(admin, 'order-123')
    expect(result).toEqual({ shouldSkip: false, recentChanges: 3 })
  })

  it('count=5 → shouldSkip=false (equal to threshold, NOT strictly greater)', async () => {
    const { admin } = buildAdminMock({ count: 5, error: null })
    const result = await checkKillSwitch(admin, 'order-123')
    expect(result.shouldSkip).toBe(false)
    expect(result.recentChanges).toBe(5)
  })

  it('count=6 → shouldSkip=true (strictly greater than threshold)', async () => {
    const { admin } = buildAdminMock({ count: 6, error: null })
    const result = await checkKillSwitch(admin, 'order-123')
    expect(result).toEqual({ shouldSkip: true, recentChanges: 6 })
  })

  it('query error → shouldSkip=false (fail-open, Pattern 5 RESEARCH)', async () => {
    const { admin } = buildAdminMock({ count: null, error: { message: 'db down' } })
    const result = await checkKillSwitch(admin, 'order-123')
    expect(result).toEqual({ shouldSkip: false, recentChanges: 0 })
  })

  it('custom threshold=10 overrides default=5', async () => {
    const { admin } = buildAdminMock({ count: 7, error: null })
    const result = await checkKillSwitch(admin, 'order-123', 10)
    expect(result.shouldSkip).toBe(false) // 7 <= 10
    expect(result.recentChanges).toBe(7)
  })

  it('custom windowMs passed to changed_at filter', async () => {
    const { admin, gt } = buildAdminMock({ count: 0, error: null })
    const before = Date.now()
    await checkKillSwitch(admin, 'order-123', 5, 30_000)
    const gtCalls = gt.mock.calls as unknown as Array<[string, string]>
    const call = gtCalls[0][1]
    const callMs = new Date(call).getTime()
    // sinceIso should be ~30s before test start
    expect(before - callMs).toBeGreaterThanOrEqual(29_000)
    expect(before - callMs).toBeLessThanOrEqual(31_500)
  })

  it('filters by neq("source", "manual") — human drags are not counted', async () => {
    const { admin, neq } = buildAdminMock({ count: 0, error: null })
    await checkKillSwitch(admin, 'order-123')
    expect(neq).toHaveBeenCalledWith('source', 'manual')
  })
})
