// ============================================================================
// Phase 17: CRM Automations Engine — Condition Evaluator
// Recursive AND/OR condition group evaluator for automation triggers.
// Pure functions with no external dependencies beyond types.
// ============================================================================

import type { ConditionGroup, Condition, ConditionOperator } from './types'

// ============================================================================
// Nested Value Access
// ============================================================================

/**
 * Access a nested value in an object using dot notation.
 * e.g., getNestedValue({ order: { stage_id: '123' } }, 'order.stage_id') => '123'
 * Returns undefined if any intermediate value is null/undefined.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

// ============================================================================
// Single Condition Evaluation
// ============================================================================

/**
 * Evaluate a single condition against a context object.
 * Returns boolean indicating whether the condition matches.
 *
 * Edge cases:
 * - Missing field: false for all operators except not_exists (true)
 * - Null value: same as missing for comparison operators
 * - Non-numeric for gt/lt/gte/lte: false
 */
export function evaluateCondition(
  condition: Condition,
  context: Record<string, unknown>
): boolean {
  const contextValue = getNestedValue(context, condition.field)
  const conditionValue = condition.value

  return applyOperator(condition.operator, contextValue, conditionValue)
}

/**
 * Apply a condition operator to compare contextValue against conditionValue.
 */
function applyOperator(
  operator: ConditionOperator,
  contextValue: unknown,
  conditionValue: unknown
): boolean {
  switch (operator) {
    case 'exists':
      return contextValue !== null && contextValue !== undefined

    case 'not_exists':
      return contextValue === null || contextValue === undefined

    case 'equals':
      // Missing/null context value: false
      if (contextValue === null || contextValue === undefined) return false
      // String coercion + trim for comparison (prevents whitespace mismatches)
      return String(contextValue).trim() === String(conditionValue).trim()

    case 'not_equals':
      // Missing/null context value: true (it is indeed "not equal" to something)
      if (contextValue === null || contextValue === undefined) return true
      return String(contextValue).trim() !== String(conditionValue).trim()

    case 'contains': {
      if (contextValue === null || contextValue === undefined) return false
      // Array.includes or String.includes
      if (Array.isArray(contextValue)) {
        return contextValue.includes(conditionValue)
      }
      return String(contextValue).includes(String(conditionValue))
    }

    case 'not_contains': {
      if (contextValue === null || contextValue === undefined) return true
      if (Array.isArray(contextValue)) {
        return !contextValue.includes(conditionValue)
      }
      return !String(contextValue).includes(String(conditionValue))
    }

    case 'in': {
      // Context value is in the condition value array
      if (contextValue === null || contextValue === undefined) return false
      if (!Array.isArray(conditionValue)) return false
      return conditionValue.includes(contextValue)
    }

    case 'not_in': {
      if (contextValue === null || contextValue === undefined) return true
      if (!Array.isArray(conditionValue)) return true
      return !conditionValue.includes(contextValue)
    }

    case 'gt':
      return numericCompare(contextValue, conditionValue, (a, b) => a > b)

    case 'lt':
      return numericCompare(contextValue, conditionValue, (a, b) => a < b)

    case 'gte':
      return numericCompare(contextValue, conditionValue, (a, b) => a >= b)

    case 'lte':
      return numericCompare(contextValue, conditionValue, (a, b) => a <= b)

    default:
      // Unknown operator: fail closed (no match)
      return false
  }
}

/**
 * Compare two values numerically. Returns false if either side is not a valid number.
 */
function numericCompare(
  contextValue: unknown,
  conditionValue: unknown,
  comparator: (a: number, b: number) => boolean
): boolean {
  if (contextValue === null || contextValue === undefined) return false
  if (conditionValue === null || conditionValue === undefined) return false

  const numA = parseFloat(String(contextValue))
  const numB = parseFloat(String(conditionValue))

  if (isNaN(numA) || isNaN(numB)) return false

  return comparator(numA, numB)
}

// ============================================================================
// Condition Group Evaluation (Recursive AND/OR)
// ============================================================================

/**
 * Type guard to check if a condition entry is a ConditionGroup (nested group).
 * ConditionGroup has a 'logic' property; Condition does not.
 */
function isConditionGroup(
  entry: Condition | ConditionGroup
): entry is ConditionGroup {
  return 'logic' in entry && ('conditions' in entry)
}

/**
 * Evaluate a condition group recursively.
 *
 * - Empty group (no conditions): returns true (vacuous truth — no conditions = match all)
 * - AND logic: every condition/subgroup must be true
 * - OR logic: at least one condition/subgroup must be true
 * - Nested groups: recurse into evaluateConditionGroup
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: Record<string, unknown>
): boolean {
  // Empty group = vacuous truth (match all)
  if (group.conditions.length === 0) {
    return true
  }

  const results = group.conditions.map((entry) => {
    if (isConditionGroup(entry)) {
      return evaluateConditionGroup(entry, context)
    }
    return evaluateCondition(entry, context)
  })

  // Normalize logic: legacy automations may use "operator" instead of "logic"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logic = group.logic || (group as any).operator || 'AND'

  if (logic === 'AND') {
    return results.every(Boolean)
  }

  // OR logic
  return results.some(Boolean)
}
