// ============================================================================
// Tests for src/lib/agents/routing/schema/validate.ts (Ajv-compiled validator).
// Phase: agent-lifecycle-router (standalone) — Plan 02 Task 1.
//
// Coverage:
//   - 8 lifecycle_state enum (D-03)
//   - 15 operators
//   - Pitfall 2 mitigation: additionalProperties:false on leafCondition rejects `path` field
//   - Schema version pinning (v1 only)
//   - Priority bounds (1..100000)
//   - Nested any/all conditions
//   - Human handoff (agent_id: null) per D-16
// ============================================================================

import { describe, it, expect } from 'vitest'
import { validateRule } from '../schema/validate'
import {
  validClassifierRule,
  validRouterRule,
  validRouterRule_humanHandoff,
  ruleWithPathField,
  ruleWithUnknownLifecycleState,
  ruleWithNestedAnyAll,
} from './fixtures'

describe('validateRule (rule-v1.schema.json)', () => {
  it('accepts valid classifier rule', () => {
    const result = validateRule(validClassifierRule)
    expect(result.ok).toBe(true)
  })

  it('accepts valid router rule with agent_id string', () => {
    const result = validateRule(validRouterRule)
    expect(result.ok).toBe(true)
  })

  it('accepts router rule with agent_id null (human handoff per D-16)', () => {
    const result = validateRule(validRouterRule_humanHandoff)
    expect(result.ok).toBe(true)
  })

  it('rejects rule with path field in leaf condition (Pitfall 2 — CVE-2025-1302)', () => {
    const result = validateRule(ruleWithPathField)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const allErrors = result.errors.join(' ')
      expect(allErrors).toMatch(/path|additionalProperties/)
    }
  })

  it('rejects rule with unknown lifecycle_state', () => {
    const result = validateRule(ruleWithUnknownLifecycleState)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/enum|invalid_state|oneOf/)
    }
  })

  it('rejects rule with schema_version != v1', () => {
    const result = validateRule({ ...validClassifierRule, schema_version: 'v2' as 'v1' })
    expect(result.ok).toBe(false)
  })

  it('accepts nested any-inside-all conditions', () => {
    const result = validateRule(ruleWithNestedAnyAll)
    expect(result.ok).toBe(true)
  })

  it('rejects priority below 1', () => {
    const result = validateRule({ ...validClassifierRule, priority: 0 })
    expect(result.ok).toBe(false)
  })

  it('rejects priority above 100000', () => {
    const result = validateRule({ ...validClassifierRule, priority: 100001 })
    expect(result.ok).toBe(false)
  })

  it('rejects empty name', () => {
    const result = validateRule({ ...validClassifierRule, name: '' })
    expect(result.ok).toBe(false)
  })
})
