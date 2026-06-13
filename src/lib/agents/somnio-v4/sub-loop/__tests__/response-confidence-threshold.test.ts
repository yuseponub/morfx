/**
 * Tests de getResponseConfidenceThreshold (v4-gate-confidence-fixes D-03).
 * Patrón idéntico a threshold.ts — cache 60s + fallback 0.70.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getResponseConfidenceThreshold,
  __clearResponseConfidenceThresholdCache,
} from '../response-confidence-threshold'

// Mock createAdminClient (same pattern as other threshold tests)
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))
import { createAdminClient } from '@/lib/supabase/admin'

function mockSupabase(value: unknown | null, error: unknown | null = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: value !== null ? { value } : null, error })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  ;(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ from })
}

describe('getResponseConfidenceThreshold', () => {
  beforeEach(() => {
    __clearResponseConfidenceThresholdCache()
    vi.clearAllMocks()
  })

  it('retorna 0.70 (default) cuando la key no existe en platform_config', async () => {
    mockSupabase(null)
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.70)
  })

  it('retorna el valor de platform_config cuando es válido', async () => {
    mockSupabase(0.55)
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.55)
  })

  it('retorna 0.70 cuando el valor es mayor que 1 (fuera de rango)', async () => {
    mockSupabase(1.5)
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.70)
  })

  it('retorna 0.70 cuando hay error de DB', async () => {
    mockSupabase(null, new Error('DB error'))
    const result = await getResponseConfidenceThreshold()
    expect(result).toBe(0.70)
  })

  it('retorna cached value en segunda llamada sin hit a DB', async () => {
    mockSupabase(0.60)
    await getResponseConfidenceThreshold()  // primera — hit DB
    const result = await getResponseConfidenceThreshold()  // segunda — cache
    expect(result).toBe(0.60)
    expect(createAdminClient).toHaveBeenCalledTimes(1)  // DB solo 1 vez
  })
})
