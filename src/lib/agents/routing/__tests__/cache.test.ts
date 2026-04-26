// ============================================================================
// Plan 03 Task 2 — cache (LRU + version-column revalidation) tests
//
// Mocks @/lib/domain/routing entirely so no DB call escapes. Tests cover:
//   - first call hits DB
//   - second call within TTL + same maxUpdatedAt → no full reload
//   - version delta triggers reload (Pattern 3)
//   - invalid rules are skipped + warning (Pitfall 5)
//   - same-priority collision → keep first + warning (Pitfall 1 defense)
//   - invalidateWorkspace clears single-workspace cache
//   - max=100 eviction policy
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeRule, ruleWithPathField } from './fixtures'

const mockLoadActive = vi.fn()
const mockGetMaxUpdated = vi.fn()
vi.mock('@/lib/domain/routing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/domain/routing')>(
    '@/lib/domain/routing',
  )
  return {
    ...actual,
    loadActiveRulesForWorkspace: (...args: never[]) => mockLoadActive(...args),
    getMaxUpdatedAt: (...args: never[]) => mockGetMaxUpdated(...args),
  }
})

import { getRulesForWorkspace, invalidateWorkspace, _clearAllCache } from '../cache'

const ws = 'a3843b3f-c337-4836-92b5-89c58bb98490'

beforeEach(() => {
  vi.clearAllMocks()
  _clearAllCache()
  // Sensible default — no rules in DB. Tests override per-case.
  mockLoadActive.mockResolvedValue({
    success: true,
    data: { classifierRules: [], routerRules: [] },
  })
  mockGetMaxUpdated.mockResolvedValue({ success: true, data: null })
})

describe('cache: getRulesForWorkspace', () => {
  it('first call hits DB via loadActiveRulesForWorkspace', async () => {
    const r = await getRulesForWorkspace(ws)
    expect(mockLoadActive).toHaveBeenCalledOnce()
    expect(r.classifierRules.length).toBe(0)
  })

  it('second call within TTL with same maxUpdatedAt → returns cached, no full reload', async () => {
    const r1 = makeRule({ id: 'r1', updated_at: '2026-04-25T10:00:00Z' })
    mockLoadActive.mockResolvedValue({
      success: true,
      data: { classifierRules: [r1], routerRules: [] },
    })
    mockGetMaxUpdated.mockResolvedValue({ success: true, data: '2026-04-25T10:00:00Z' })

    await getRulesForWorkspace(ws)
    expect(mockLoadActive).toHaveBeenCalledTimes(1)

    // Subsequent call: max unchanged → no reload (still 1).
    await getRulesForWorkspace(ws)
    expect(mockLoadActive).toHaveBeenCalledTimes(1)
  })

  it('detects version delta via getMaxUpdatedAt → triggers reload (Pattern 3)', async () => {
    const r1 = makeRule({ id: 'r1', updated_at: '2026-04-25T10:00:00Z' })
    const r2 = makeRule({ id: 'r2', priority: 99, updated_at: '2026-04-25T11:00:00Z' })

    // First call: only r1, watermark = T1.
    mockLoadActive.mockResolvedValueOnce({
      success: true,
      data: { classifierRules: [r1], routerRules: [] },
    })
    mockGetMaxUpdated.mockResolvedValueOnce({ success: true, data: '2026-04-25T10:00:00Z' })
    await getRulesForWorkspace(ws)

    // Watermark shifts to T2 (admin added r2).
    mockGetMaxUpdated.mockResolvedValueOnce({ success: true, data: '2026-04-25T11:00:00Z' })
    mockLoadActive.mockResolvedValueOnce({
      success: true,
      data: { classifierRules: [r1, r2], routerRules: [] },
    })
    // Reload reads the watermark again at the end of the reload (cache.ts contract).
    mockGetMaxUpdated.mockResolvedValueOnce({ success: true, data: '2026-04-25T11:00:00Z' })

    const r = await getRulesForWorkspace(ws)
    expect(mockLoadActive).toHaveBeenCalledTimes(2)
    expect(r.classifierRules.length).toBe(2)
  })

  it('skips invalid rules (Pitfall 5) and logs warning', async () => {
    const validR = makeRule({ id: '00000000-0000-0000-0000-0000000000aa', priority: 100 })
    // ruleWithPathField is the fixture that adds a `path` leaf — Ajv rejects via
    // additionalProperties:false in leafCondition.
    const invalidR = {
      ...ruleWithPathField,
      id: '00000000-0000-0000-0000-0000000000bb',
      priority: 90,
    } as never
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLoadActive.mockResolvedValue({
      success: true,
      data: { classifierRules: [validR, invalidR], routerRules: [] },
    })
    mockGetMaxUpdated.mockResolvedValue({ success: true, data: null })

    const r = await getRulesForWorkspace(ws)
    expect(r.classifierRules.length).toBe(1)
    expect(r.classifierRules[0].id).toBe('00000000-0000-0000-0000-0000000000aa')
    expect(warn).toHaveBeenCalled()
  })

  it('detects same-priority collision runtime, keeps first (Pitfall 1 defense)', async () => {
    const r1 = makeRule({
      id: '00000000-0000-0000-0000-00000000aaaa',
      priority: 100,
      rule_type: 'lifecycle_classifier',
    })
    const r2 = makeRule({
      id: '00000000-0000-0000-0000-00000000bbbb',
      priority: 100,
      rule_type: 'lifecycle_classifier',
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLoadActive.mockResolvedValue({
      success: true,
      data: { classifierRules: [r1, r2], routerRules: [] },
    })

    const r = await getRulesForWorkspace(ws)
    expect(r.classifierRules.length).toBe(1)
    expect(r.classifierRules[0].id).toBe('00000000-0000-0000-0000-00000000aaaa')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('priority collision'))
  })

  it('invalidateWorkspace clears cache for that workspace', async () => {
    await getRulesForWorkspace(ws)
    invalidateWorkspace(ws)
    await getRulesForWorkspace(ws)
    expect(mockLoadActive).toHaveBeenCalledTimes(2) // reloaded after invalidate
  })

  it('cache max=100 — 101st workspace evicts oldest', async () => {
    for (let i = 0; i < 101; i++) {
      await getRulesForWorkspace(`00000000-0000-0000-0000-00000000${i.toString().padStart(4, '0')}`)
    }
    // ws-0 should have been evicted; calling again triggers reload.
    const initialCalls = mockLoadActive.mock.calls.length
    await getRulesForWorkspace('00000000-0000-0000-0000-000000000000')
    expect(mockLoadActive.mock.calls.length).toBeGreaterThan(initialCalls)
  })

  it('on DB error in loadActiveRulesForWorkspace returns empty rule set (graceful degradation)', async () => {
    mockLoadActive.mockResolvedValue({ success: false, error: 'connection timeout' })
    const r = await getRulesForWorkspace(ws)
    expect(r.classifierRules).toEqual([])
    expect(r.routerRules).toEqual([])
    expect(r.maxUpdatedAt).toBeNull()
  })
})
