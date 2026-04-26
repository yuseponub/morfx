// ============================================================================
// Test fixtures shared across all routing tests.
// Phase: agent-lifecycle-router (standalone)
//
// Used by:
//   - Plan 02 (this — schema.test.ts, domain.test.ts, domain-extensions.test.ts)
//   - Plan 03 (engine + cache + facts tests)
//   - Plan 05 (dry-run tests)
//   - Plan 06 (admin form tests)
// ============================================================================

import type { RoutingRule } from '@/lib/domain/routing'

export const validClassifierRule: Omit<
  RoutingRule,
  'id' | 'created_at' | 'updated_at' | 'created_by_user_id' | 'created_by_agent_id'
> = {
  workspace_id: 'a3843b3f-c337-4836-92b5-89c58bb98490',
  schema_version: 'v1',
  rule_type: 'lifecycle_classifier',
  name: 'in_transit_active_order',
  priority: 100,
  conditions: {
    all: [
      { fact: 'activeOrderStage', operator: 'equal', value: 'transit' },
    ],
  },
  event: { type: 'route', params: { lifecycle_state: 'in_transit' } },
  active: true,
}

export const validRouterRule: Omit<
  RoutingRule,
  'id' | 'created_at' | 'updated_at' | 'created_by_user_id' | 'created_by_agent_id'
> = {
  workspace_id: 'a3843b3f-c337-4836-92b5-89c58bb98490',
  schema_version: 'v1',
  rule_type: 'agent_router',
  name: 'in_transit_to_postsale',
  priority: 100,
  conditions: {
    all: [
      { fact: 'lifecycle_state', operator: 'equal', value: 'in_transit' },
      { fact: 'tags', operator: 'doesNotContain', value: 'forzar_humano' },
    ],
  },
  event: { type: 'route', params: { agent_id: 'somnio-recompra-v1' } },
  active: true,
}

export const validRouterRule_humanHandoff: typeof validRouterRule = {
  ...validRouterRule,
  name: 'forzar_humano_handoff',
  priority: 1000,
  conditions: {
    all: [
      { fact: 'tags', operator: 'arrayContainsAny', value: ['forzar_humano'] },
    ],
  },
  event: { type: 'route', params: { agent_id: null } }, // null = human handoff (D-16)
}

export const ruleWithPathField = {
  ...validClassifierRule,
  conditions: {
    all: [
      // CVE-2025-1302 surface — Pitfall 2: schema rejects `path` via additionalProperties:false
      { fact: 'activeOrderStage', operator: 'equal', value: 'transit', path: '$.stage' },
    ],
  },
}

export const ruleWithUnknownLifecycleState = {
  ...validClassifierRule,
  event: { type: 'route', params: { lifecycle_state: 'invalid_state' } },
}

export const ruleWithNestedAnyAll = {
  ...validClassifierRule,
  conditions: {
    all: [
      {
        any: [
          { fact: 'activeOrderStage', operator: 'equal', value: 'transit' },
          { fact: 'activeOrderStage', operator: 'equal', value: 'preparation' },
        ],
      },
      { fact: 'isClient', operator: 'equal', value: true },
    ],
  },
}

/**
 * Helper to construct a complete RoutingRule from partial overrides.
 * Used by tests that need to mutate single fields while preserving valid shape.
 */
export function makeRule(overrides: Partial<RoutingRule> = {}): RoutingRule {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    workspace_id: 'a3843b3f-c337-4836-92b5-89c58bb98490',
    schema_version: 'v1',
    rule_type: 'lifecycle_classifier',
    name: 'test_rule',
    priority: 100,
    conditions: { all: [{ fact: 'isClient', operator: 'equal', value: true }] },
    event: { type: 'route', params: { lifecycle_state: 'new_prospect' } },
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by_user_id: null,
    created_by_agent_id: null,
    ...overrides,
  }
}
