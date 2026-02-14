// ============================================================================
// Phase 19: AI Automation Builder — Type System
// Foundational types for builder sessions, diagram visualization,
// validation, and automation preview.
// ============================================================================

import type {
  TriggerType,
  ActionType,
  AutomationAction,
  ConditionGroup,
} from '@/lib/automations/types'

// Re-export for convenience in builder consumers
export type { TriggerType, ActionType, AutomationAction, ConditionGroup }

// ============================================================================
// BUILDER SESSION
// ============================================================================

/**
 * Builder session — mirrors the builder_sessions DB table.
 * Stores the conversational state between a user and the AI builder.
 */
export interface BuilderSession {
  id: string                    // UUID
  workspace_id: string          // UUID — workspace isolation
  user_id: string               // UUID — session owner
  title: string | null          // AI-generated or user-provided title
  messages: unknown[]           // AI SDK message format (UIMessage[] at runtime)
  automations_created: string[] // UUID[] of automations created from this session
  created_at: string            // ISO timestamp
  updated_at: string            // ISO timestamp
}

// ============================================================================
// DIAGRAM TYPES (React Flow visualization)
// ============================================================================

/** Node types rendered in the automation diagram */
export type DiagramNodeType = 'triggerNode' | 'conditionNode' | 'actionNode'

/**
 * Data payload for a diagram node.
 * Fields are optional based on node type:
 * - triggerNode: triggerType, triggerConfig
 * - conditionNode: conditions
 * - actionNode: actionType, params, delay
 */
export interface DiagramNodeData {
  [key: string]: unknown // Index signature required by @xyflow/react Node<T>
  label: string
  hasError: boolean
  errorMessage?: string
  category?: string
  // Trigger-specific
  triggerType?: TriggerType
  triggerConfig?: Record<string, unknown>
  // Condition-specific
  conditions?: ConditionGroup
  conditionCount?: number
  // Action-specific
  actionType?: ActionType
  params?: Record<string, unknown>
  delay?: { amount: number; unit: 'minutes' | 'hours' | 'days' } | null
}

/**
 * A node in the automation diagram.
 * Follows React Flow's Node concept with typed data payload.
 */
export interface DiagramNode {
  id: string
  type: DiagramNodeType
  position: { x: number; y: number }
  data: DiagramNodeData
}

/**
 * An edge connecting two nodes in the diagram.
 */
export interface DiagramEdge {
  id: string
  source: string
  target: string
  animated: boolean
}

/**
 * Complete diagram state: nodes, edges, and any validation errors.
 */
export interface DiagramData {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  validationErrors: DiagramValidationError[]
}

/** Validation error associated with a specific node */
export interface DiagramValidationError {
  nodeId: string
  message: string
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validation result for a single node in the diagram.
 */
export interface ValidationResult {
  nodeId: string
  valid: boolean
  errors: string[]
}

/**
 * Resource validation — checks that referenced workspace resources exist.
 * Used when the AI builder references pipelines, stages, tags, etc.
 */
export interface ResourceValidation {
  type: 'pipeline' | 'stage' | 'tag' | 'template' | 'user'
  name: string
  found: boolean
  id: string | null
  details: string | null
}

// ============================================================================
// BUILDER TOOL CONTEXT
// ============================================================================

/**
 * Context passed to AI builder tool handlers.
 * Provides workspace and user identity for data access.
 */
export interface BuilderToolContext {
  workspaceId: string
  userId: string
}

// ============================================================================
// AUTOMATION PREVIEW
// ============================================================================

/**
 * Complete preview of an automation before it is saved.
 * Produced by the AI builder after constructing the automation flow.
 * Includes diagram visualization, resource checks, and warnings.
 */
export interface AutomationPreviewData {
  name: string
  description: string
  trigger_type: TriggerType
  trigger_config: Record<string, unknown>
  conditions: ConditionGroup | null
  actions: AutomationAction[]
  diagram: DiagramData
  resourceValidations: ResourceValidation[]
  hasCycles: boolean
  duplicateWarning: string | null
  /** When modifying an existing automation, this is its UUID */
  existingAutomationId?: string
}

// ============================================================================
// BUILDER MESSAGE
// ============================================================================

/**
 * BuilderMessage — type alias for AI SDK UIMessage.
 *
 * At runtime, messages in BuilderSession.messages are UIMessage instances
 * from the 'ai' package. We store them as unknown[] in the DB (JSONB)
 * and cast when reading.
 *
 * Import UIMessage from 'ai' package at the usage site:
 *   import type { UIMessage } from 'ai'
 *
 * This type exists as documentation; the actual type is owned by AI SDK.
 */
export type BuilderMessage = unknown

// ============================================================================
// DIAGRAM NODE TYPE CONSTANTS
// ============================================================================

/** Available diagram node types as const array for iteration */
export const DIAGRAM_NODE_TYPES = ['triggerNode', 'conditionNode', 'actionNode'] as const

/** Resource types that can be validated */
export const RESOURCE_VALIDATION_TYPES = ['pipeline', 'stage', 'tag', 'template', 'user'] as const
