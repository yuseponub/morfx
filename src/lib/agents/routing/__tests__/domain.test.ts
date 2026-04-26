// ============================================================================
// Tests for src/lib/domain/routing.ts (Plan 02 Task 2).
// Phase: agent-lifecycle-router (standalone)
//
// Coverage:
//   - upsertRule: rejects invalid (Pitfall 2 path field) — DB never reached
//   - upsertRule: valid rule writes to from('routing_rules').upsert
//   - listRules: filters by workspace_id (Regla 3 multi-tenant)
//   - deleteRule: soft delete via UPDATE active=false (NOT DELETE)
//   - recordAuditLog: accepts all 4 reasons (D-16) and rejects invalid before insert
//   - listFactsCatalog: returns active facts ordered by name
//   - getMaxUpdatedAt: returns ISO string from rules (Plan 03 cache version-column)
//   - loadActiveRulesForWorkspace: splits classifier vs router rules
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ruleWithPathField, validClassifierRule, makeRule } from './fixtures'

// Mock @/lib/supabase/admin BEFORE importing the module under test.
const mockSupabase: { from: ReturnType<typeof vi.fn> } = { from: vi.fn() }
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockSupabase,
}))

import {
  upsertRule,
  listRules,
  deleteRule,
  recordAuditLog,
  listFactsCatalog,
  getMaxUpdatedAt,
  loadActiveRulesForWorkspace,
  type RoutingAuditEntry,
} from '@/lib/domain/routing'

const ctx = { workspaceId: 'a3843b3f-c337-4836-92b5-89c58bb98490' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('upsertRule', () => {
  it('rejects invalid rule (path field — Pitfall 2)', async () => {
    const result = await upsertRule(ctx, ruleWithPathField as any)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/schema|path|validation/i)
    }
    expect(mockSupabase.from).not.toHaveBeenCalled() // never reaches DB
  })

  it('inserts valid rule via from(routing_rules).upsert', async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null })
    const selectMock = vi.fn().mockReturnValue({ single: singleMock })
    const upsertMock = vi.fn().mockReturnValue({ select: selectMock })
    mockSupabase.from.mockReturnValue({ upsert: upsertMock })

    const result = await upsertRule(ctx, validClassifierRule)
    expect(result.success).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('routing_rules')
    expect(upsertMock).toHaveBeenCalled()
    // Multi-tenant safety: workspace_id forced to ctx.workspaceId in payload
    const payload = upsertMock.mock.calls[0][0]
    expect(payload.workspace_id).toBe(ctx.workspaceId)
    expect(typeof payload.updated_at).toBe('string')
  })
})

describe('listRules', () => {
  it('filters by workspace_id and orders by priority DESC', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: [makeRule()], error: null })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqMock }),
    })

    const result = await listRules(ctx)
    expect(result.success).toBe(true)
    expect(mockSupabase.from).toHaveBeenCalledWith('routing_rules')
    expect(eqMock).toHaveBeenCalledWith('workspace_id', ctx.workspaceId)
    expect(orderMock).toHaveBeenCalledWith('priority', { ascending: false })
  })
})

describe('deleteRule', () => {
  it('does soft delete (UPDATE active=false), not DELETE', async () => {
    const eq2Mock = vi.fn().mockResolvedValue({ data: null, error: null })
    const eq1Mock = vi.fn().mockReturnValue({ eq: eq2Mock })
    const updateMock = vi.fn().mockReturnValue({ eq: eq1Mock })
    mockSupabase.from.mockReturnValue({ update: updateMock })

    const result = await deleteRule(ctx, 'rule-id-1')
    expect(result.success).toBe(true)
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ active: false }),
    )
    // workspace_id filter
    expect(eq1Mock).toHaveBeenCalledWith('workspace_id', ctx.workspaceId)
    // id filter
    expect(eq2Mock).toHaveBeenCalledWith('id', 'rule-id-1')
  })
})

describe('recordAuditLog', () => {
  const baseEntry: Omit<RoutingAuditEntry, 'reason'> = {
    workspace_id: ctx.workspaceId,
    contact_id: 'contact-id',
    conversation_id: 'conv-id',
    inbound_message_id: 'msg-id',
    agent_id: 'somnio-recompra-v1',
    lifecycle_state: 'in_transit',
    fired_classifier_rule_id: 'cls-rule-id',
    fired_router_rule_id: 'rt-rule-id',
    facts_snapshot: { activeOrderStage: 'transit' },
    rule_set_version_at_decision: '2026-04-25T10:00:00-05:00',
    latency_ms: 5,
  }

  it.each(['matched', 'human_handoff', 'no_rule_matched', 'fallback_legacy'] as const)(
    'accepts reason="%s" (D-16)',
    async (reason) => {
      const insertMock = vi.fn().mockResolvedValue({ data: null, error: null })
      mockSupabase.from.mockReturnValue({ insert: insertMock })

      const result = await recordAuditLog({ ...baseEntry, reason })
      expect(result.success).toBe(true)
      expect(mockSupabase.from).toHaveBeenCalledWith('routing_audit_log')
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({ reason }),
      )
    },
  )

  it('rejects invalid reason BEFORE insert (defense-in-depth vs DB CHECK)', async () => {
    const insertMock = vi.fn()
    mockSupabase.from.mockReturnValue({ insert: insertMock })

    const result = await recordAuditLog({ ...baseEntry, reason: 'foo' as any })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toMatch(/invalid reason/i)
    }
    expect(insertMock).not.toHaveBeenCalled()
  })
})

describe('listFactsCatalog', () => {
  it('returns active facts ordered by name', async () => {
    const seedFacts = Array.from({ length: 10 }, (_, i) => ({
      name: `fact_${i}`,
      return_type: 'string',
      description: `desc ${i}`,
      examples: [],
      active: true,
    }))
    const orderMock = vi.fn().mockResolvedValue({ data: seedFacts, error: null })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqMock }),
    })

    const result = await listFactsCatalog()
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.length).toBe(10)
    expect(mockSupabase.from).toHaveBeenCalledWith('routing_facts_catalog')
    expect(eqMock).toHaveBeenCalledWith('active', true)
  })
})

describe('getMaxUpdatedAt', () => {
  it('returns max updated_at as ISO string', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: { updated_at: '2026-04-25T10:00:00-05:00' },
      error: null,
    })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqMock }),
    })

    const result = await getMaxUpdatedAt(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBe('2026-04-25T10:00:00-05:00')
  })

  it('returns null when no rules exist (PGRST116)', async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST116', message: 'no rows' },
    })
    const limitMock = vi.fn().mockReturnValue({ single: singleMock })
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock })
    const eqMock = vi.fn().mockReturnValue({ order: orderMock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eqMock }),
    })

    const result = await getMaxUpdatedAt(ctx)
    expect(result.success).toBe(true)
    if (result.success) expect(result.data).toBeNull()
  })
})

describe('loadActiveRulesForWorkspace', () => {
  it('splits rules by rule_type and filters active=true', async () => {
    const allRules = [
      makeRule({ id: '1', rule_type: 'lifecycle_classifier', priority: 100 }),
      makeRule({ id: '2', rule_type: 'lifecycle_classifier', priority: 90 }),
      makeRule({ id: '3', rule_type: 'agent_router', priority: 100 }),
    ]
    const orderMock = vi.fn().mockResolvedValue({ data: allRules, error: null })
    const eq2Mock = vi.fn().mockReturnValue({ order: orderMock })
    const eq1Mock = vi.fn().mockReturnValue({ eq: eq2Mock })
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: eq1Mock }),
    })

    const result = await loadActiveRulesForWorkspace(ctx)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.classifierRules.length).toBe(2)
      expect(result.data.routerRules.length).toBe(1)
    }
    // Verifies the active=true filter was applied
    expect(eq2Mock).toHaveBeenCalledWith('active', true)
    expect(eq1Mock).toHaveBeenCalledWith('workspace_id', ctx.workspaceId)
  })
})
