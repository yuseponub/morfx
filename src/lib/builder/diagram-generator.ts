// ============================================================================
// Phase 19: AI Automation Builder — Diagram Generator
// Converts automation form data into React Flow nodes/edges for visualization.
// Pure server-side module with no React dependencies.
// ============================================================================

import { TRIGGER_CATALOG, ACTION_CATALOG } from '@/lib/automations/constants'
import type { TriggerType, ActionType, AutomationAction, ConditionGroup } from '@/lib/automations/types'
import type {
  DiagramData,
  DiagramNode,
  DiagramEdge,
  DiagramValidationError,
  ResourceValidation,
} from '@/lib/builder/types'

// ============================================================================
// Layout Constants
// ============================================================================

const CENTER_X = 250
const Y_SPACING = 120
const START_Y = 0

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Look up the Spanish label for a trigger type from TRIGGER_CATALOG.
 * Falls back to the raw type string if not found.
 */
export function getTriggerLabel(triggerType: string): string {
  const entry = TRIGGER_CATALOG.find((t) => t.type === triggerType)
  return entry?.label ?? triggerType
}

/**
 * Look up the Spanish label for an action type from ACTION_CATALOG.
 * Falls back to the raw type string if not found.
 */
export function getActionLabel(actionType: string): string {
  const entry = ACTION_CATALOG.find((a) => a.type === actionType)
  return entry?.label ?? actionType
}

/**
 * Get the category (CRM, WhatsApp, Tareas) for a trigger type.
 * Falls back to 'Otro' if not found.
 */
export function getTriggerCategory(triggerType: string): string {
  const entry = TRIGGER_CATALOG.find((t) => t.type === triggerType)
  return entry?.category ?? 'Otro'
}

/**
 * Get the category for an action type.
 * Falls back to 'Otro' if not found.
 */
export function getActionCategory(actionType: string): string {
  const entry = ACTION_CATALOG.find((a) => a.type === actionType)
  return entry?.category ?? 'Otro'
}

// ============================================================================
// Condition Counting
// ============================================================================

/**
 * Count the number of leaf conditions in a ConditionGroup tree.
 * Leaf conditions are Condition objects (have a `field` property).
 * ConditionGroups (have `logic` + `conditions`) are recursed into.
 */
function countLeafConditions(group: ConditionGroup): number {
  let count = 0
  for (const item of group.conditions) {
    if ('logic' in item && 'conditions' in item) {
      // Nested ConditionGroup
      count += countLeafConditions(item as ConditionGroup)
    } else {
      // Leaf Condition
      count += 1
    }
  }
  return count
}

// ============================================================================
// Validation Error Mapping
// ============================================================================

/**
 * Map resource validation results to node-level errors.
 *
 * Strategy:
 * - Pipeline/stage validations from trigger_config -> nodeId 'trigger'
 * - Pipeline/stage/tag/template/user validations from actions -> nodeId 'action-{index}'
 *
 * Since ResourceValidation doesn't carry a nodeId, we infer based on type:
 * - Resources referenced in the trigger config get 'trigger' nodeId
 * - Resources referenced in actions get the corresponding 'action-{index}' nodeId
 *
 * For simplicity, this function maps all failed validations to the validationErrors
 * array with inferred nodeIds. The caller passes the full automation context.
 */
function mapValidationErrors(
  validationResults: ResourceValidation[],
  triggerConfig: Record<string, unknown>,
  actions: { type: string; params: Record<string, unknown> }[]
): DiagramValidationError[] {
  const errors: DiagramValidationError[] = []
  const failedValidations = validationResults.filter((v) => !v.found)

  for (const validation of failedValidations) {
    const nodeId = inferNodeId(validation, triggerConfig, actions)
    const message = validation.details ?? `${validation.type} "${validation.name}" no encontrado`
    errors.push({ nodeId, message })
  }

  // Also add warnings for templates that exist but are not approved
  const templateWarnings = validationResults.filter(
    (v) => v.type === 'template' && v.found && v.details !== null
  )
  for (const warning of templateWarnings) {
    const nodeId = inferNodeId(warning, triggerConfig, actions)
    errors.push({ nodeId, message: warning.details! })
  }

  return errors
}

/**
 * Infer which diagram node a resource validation belongs to.
 * Checks trigger_config first, then each action's params.
 */
function inferNodeId(
  validation: ResourceValidation,
  triggerConfig: Record<string, unknown>,
  actions: { type: string; params: Record<string, unknown> }[]
): string {
  // Check if the resource is referenced in the trigger config
  if (validation.type === 'pipeline') {
    if (triggerConfig.pipelineId === validation.name || triggerConfig.pipelineId === validation.id) {
      return 'trigger'
    }
  }
  if (validation.type === 'stage') {
    if (triggerConfig.stageId === validation.name || triggerConfig.stageId === validation.id) {
      return 'trigger'
    }
  }

  // Check each action
  for (let i = 0; i < actions.length; i++) {
    const params = actions[i].params
    const actionType = actions[i].type

    if (validation.type === 'pipeline') {
      if (
        params.pipelineId === validation.name ||
        params.pipelineId === validation.id ||
        params.targetPipelineId === validation.name ||
        params.targetPipelineId === validation.id
      ) {
        return `action-${i}`
      }
    }

    if (validation.type === 'stage') {
      if (
        params.stageId === validation.name ||
        params.stageId === validation.id ||
        params.targetStageId === validation.name ||
        params.targetStageId === validation.id
      ) {
        return `action-${i}`
      }
    }

    if (validation.type === 'tag' && params.tagName === validation.name) {
      return `action-${i}`
    }

    if (validation.type === 'template' && params.templateName === validation.name) {
      return `action-${i}`
    }

    if (validation.type === 'user' && params.assignToUserId === validation.name) {
      return `action-${i}`
    }
  }

  // Default: attach to trigger if no specific match found
  return 'trigger'
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Convert automation form data into React Flow diagram data.
 *
 * Layout: Vertical top-to-bottom, centered at x=250.
 * - Trigger node at y=0
 * - Condition node (if present) at y=120
 * - Action nodes sequentially after
 *
 * Nodes are connected sequentially with animated edges.
 * Validation errors are mapped to individual nodes.
 */
export function automationToDiagram(
  automation: {
    name: string
    trigger_type: string
    trigger_config: Record<string, unknown>
    conditions?: ConditionGroup | null
    actions: AutomationAction[]
  },
  validationResults: ResourceValidation[]
): DiagramData {
  const nodes: DiagramNode[] = []
  const edges: DiagramEdge[] = []
  let yOffset = START_Y

  // Map validation errors to node-level
  const validationErrors = mapValidationErrors(
    validationResults,
    automation.trigger_config,
    automation.actions
  )

  // Helper: check if a nodeId has errors
  const getNodeError = (nodeId: string) => {
    const error = validationErrors.find((e) => e.nodeId === nodeId)
    return {
      hasError: !!error,
      errorMessage: error?.message,
    }
  }

  // ---- Trigger Node (always first) ----
  const triggerError = getNodeError('trigger')
  nodes.push({
    id: 'trigger',
    type: 'triggerNode',
    position: { x: CENTER_X, y: yOffset },
    data: {
      label: getTriggerLabel(automation.trigger_type),
      triggerType: automation.trigger_type as TriggerType,
      triggerConfig: automation.trigger_config,
      category: getTriggerCategory(automation.trigger_type),
      hasError: triggerError.hasError,
      errorMessage: triggerError.errorMessage,
    },
  })

  let previousNodeId = 'trigger'
  yOffset += Y_SPACING

  // ---- Condition Node (if conditions present) ----
  if (automation.conditions) {
    const conditionCount = countLeafConditions(automation.conditions)

    nodes.push({
      id: 'conditions',
      type: 'conditionNode',
      position: { x: CENTER_X, y: yOffset },
      data: {
        label: 'Condiciones',
        conditions: automation.conditions,
        conditionCount,
        hasError: false,
      },
    })

    edges.push({
      id: `${previousNodeId}-conditions`,
      source: previousNodeId,
      target: 'conditions',
      animated: true,
    })

    previousNodeId = 'conditions'
    yOffset += Y_SPACING
  }

  // ---- Action Nodes (one per action) ----
  for (let i = 0; i < automation.actions.length; i++) {
    const action = automation.actions[i]
    const nodeId = `action-${i}`
    const actionError = getNodeError(nodeId)

    nodes.push({
      id: nodeId,
      type: 'actionNode',
      position: { x: CENTER_X, y: yOffset },
      data: {
        label: getActionLabel(action.type),
        actionType: action.type,
        params: action.params,
        delay: action.delay,
        category: getActionCategory(action.type),
        hasError: actionError.hasError,
        errorMessage: actionError.errorMessage,
      },
    })

    edges.push({
      id: `${previousNodeId}-${nodeId}`,
      source: previousNodeId,
      target: nodeId,
      animated: true,
    })

    previousNodeId = nodeId
    yOffset += Y_SPACING
  }

  return { nodes, edges, validationErrors }
}
