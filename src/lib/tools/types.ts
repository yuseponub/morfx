/**
 * Tool System Type Definitions
 * Phase 3: Action DSL Core - Plan 01
 *
 * MCP-compatible tool definitions with forensic logging support.
 * All tools use JSON Schema for input/output validation.
 */

import type { Permission } from '@/lib/permissions'

// ============================================================================
// Tool Result Types (Response Contract for Real Handlers)
// ============================================================================

/**
 * Error type classification for tool execution failures.
 * Used by agents to determine appropriate recovery action.
 */
export type ToolErrorType =
  | 'validation_error'
  | 'not_found'
  | 'duplicate'
  | 'external_api_error'
  | 'permission_denied'
  | 'rate_limited'
  | 'timeout'
  | 'internal_error'

/**
 * Successful tool execution result.
 * Contains the full resource data so agents can use it without additional queries.
 */
export interface ToolSuccess<T> {
  success: true
  /** Full resource data (contact, order, message, etc.) */
  data: T
  /** CRM resource URL, e.g., /crm/contactos/{id} */
  resource_url?: string
  /** WhatsApp message ID from 360dialog (wamid) */
  message_id?: string
}

/**
 * Failed tool execution result.
 * Contains structured error information for agent decision-making.
 */
export interface ToolError {
  success: false
  error: {
    /** Error classification */
    type: ToolErrorType
    /** Machine-readable error code, e.g., 'PHONE_DUPLICATE' */
    code: string
    /** Human-readable message in Spanish */
    message: string
    /** Suggested recovery action, e.g., 'Use crm.contact.read para buscar el contacto existente' */
    suggestion?: string
    /** Whether the agent should retry this operation */
    retryable: boolean
  }
}

/**
 * Discriminated union for tool execution results.
 * All real tool handlers return this type.
 * Use `result.success` to discriminate between success and error.
 */
export type ToolResult<T> = ToolSuccess<T> | ToolError

// ============================================================================
// Tool Modules & Categories
// ============================================================================

/**
 * Module categorization for tools
 */
export type ToolModule = 'crm' | 'whatsapp' | 'system'

/**
 * Request source for execution context
 */
export type RequestSource = 'ui' | 'api' | 'agent' | 'webhook'

/**
 * Execution status
 */
export type ExecutionStatus = 'success' | 'error' | 'dry_run'

// ============================================================================
// Tool Metadata
// ============================================================================

/**
 * Tool metadata following MCP specification
 * Provides AI agents with structured information about the tool
 */
export interface ToolMetadata {
  /** Module the tool belongs to */
  module: ToolModule
  /** Entity the tool operates on (e.g., 'contact', 'order', 'message') */
  entity: string
  /** Action the tool performs (e.g., 'create', 'update', 'delete', 'send') */
  action: string
  /** Whether the action can be undone */
  reversible: boolean
  /** Whether the action requires human approval before execution */
  requiresApproval: boolean
  /** Side effects of the action (e.g., 'creates_record', 'sends_message') */
  sideEffects: string[]
  /** Required permissions from src/lib/permissions.ts */
  permissions: Permission[]
}

// ============================================================================
// JSON Schema Types (simplified for tool definitions)
// ============================================================================

/**
 * JSON Schema property definition
 */
export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null'
  description?: string
  enum?: unknown[]
  items?: JsonSchemaProperty
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  default?: unknown
  format?: string
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  pattern?: string
  additionalProperties?: boolean | JsonSchemaProperty
}

/**
 * JSON Schema object type (for tool inputs/outputs)
 */
export interface JsonSchemaObject {
  type: 'object'
  properties: Record<string, JsonSchemaProperty>
  required?: string[]
  additionalProperties?: boolean
  description?: string
}

// ============================================================================
// Tool Schema Definition
// ============================================================================

/**
 * Tool schema definition (MCP-compatible)
 * Defines the tool's interface for AI agents and validation
 */
export interface ToolSchema<TInput = unknown, TOutput = unknown> {
  /** Tool identifier in format module.entity.action (e.g., 'crm.contact.create') */
  name: string
  /** Human-readable description of what the tool does */
  description: string
  /** JSON Schema for input validation */
  inputSchema: JsonSchemaObject
  /** JSON Schema for output validation (optional) */
  outputSchema?: JsonSchemaObject
  /** Tool metadata for AI agents */
  metadata: ToolMetadata
  /** TypeScript type hints (for development only) */
  _inputType?: TInput
  _outputType?: TOutput
}

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Request context for forensic logging
 */
export interface RequestContext {
  /** Client IP address */
  ip?: string
  /** Client user agent */
  userAgent?: string
  /** How the request originated */
  source: RequestSource
  /** Additional metadata (e.g., referrer, trace ID) */
  metadata?: Record<string, unknown>
}

/**
 * Execution context provided to every tool invocation
 */
export interface ExecutionContext {
  /** User ID (null for API-only calls without user context) */
  userId: string | null
  /** Workspace ID (always required) */
  workspaceId: string
  /** Session ID for tracking related operations */
  sessionId?: string
  /** Agent session ID for tracing agent conversation tool calls */
  agent_session_id?: string
  /** Request metadata for forensic logging */
  requestContext: RequestContext
}

// ============================================================================
// Execution Options & Results
// ============================================================================

/**
 * Options for tool execution
 */
export interface ExecutionOptions {
  /** If true, validate and simulate without persisting changes */
  dryRun?: boolean
  /** Execution context (always required) */
  context: ExecutionContext
  /** Skip logging this execution (use sparingly) */
  skipLogging?: boolean
}

/**
 * Error details for failed executions
 */
export interface ExecutionError {
  /** Error message */
  message: string
  /** Error code (e.g., 'VALIDATION_ERROR', 'PERMISSION_DENIED') */
  code?: string
  /** Stack trace (only in development) */
  stack?: string
  /** Additional error details */
  details?: Record<string, unknown>
}

/**
 * Result of a tool execution
 */
export interface ToolExecutionResult<T = unknown> {
  /** Execution ID (UUID from database) */
  id: string
  /** Tool name that was executed */
  toolName: string
  /** Execution status */
  status: ExecutionStatus
  /** Tool outputs (varies by tool) */
  outputs: T
  /** Execution duration in milliseconds */
  durationMs: number
  /** Error details if status is 'error' */
  error?: ExecutionError
}

// ============================================================================
// Database Records
// ============================================================================

/**
 * Tool execution record (matches database schema)
 */
export interface ToolExecutionRecord {
  id: string
  workspace_id: string
  tool_name: string
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
  status: ExecutionStatus
  error_message?: string
  error_stack?: string
  started_at: string
  completed_at: string
  duration_ms: number
  user_id?: string
  session_id?: string
  request_context: RequestContext
  snapshot_before?: Record<string, unknown>
  snapshot_after?: Record<string, unknown>
  batch_id?: string
  related_executions?: string[]
  /** Agent session ID for tracing tool calls within a conversation. NOT NULL when invoked by agent. */
  agent_session_id?: string
  created_at: string
}

/**
 * API Key record (matches database schema)
 */
export interface ApiKeyRecord {
  id: string
  workspace_id: string
  name: string
  key_prefix: string
  permissions: string[]
  revoked: boolean
  revoked_at?: string
  revoked_by?: string
  last_used_at?: string
  created_by: string
  created_at: string
  expires_at?: string
}

// ============================================================================
// Tool Handler & Registration
// ============================================================================

/**
 * Snapshot provider function for reversible tools
 * Called before execution to capture state for undo
 */
export type SnapshotProvider<TInput = unknown> = (
  input: TInput,
  context: ExecutionContext
) => Promise<Record<string, unknown> | null>

/**
 * Tool handler function signature
 */
export type ToolHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: ExecutionContext,
  dryRun: boolean
) => Promise<TOutput>

/**
 * Registered tool with handler
 */
export interface RegisteredTool<TInput = unknown, TOutput = unknown>
  extends ToolSchema<TInput, TOutput> {
  /** Handler function that executes the tool */
  handler: ToolHandler<TInput, TOutput>
  /** Optional snapshot provider for reversible operations */
  snapshotProvider?: SnapshotProvider<TInput>
}

// ============================================================================
// Batch Execution
// ============================================================================

/**
 * Batch execution item
 */
export interface BatchItem {
  /** Tool name to execute */
  tool: string
  /** Input parameters */
  inputs: Record<string, unknown>
  /** Reference to use outputs from previous items (e.g., '$0.contactId') */
  references?: Record<string, string>
}

/**
 * Batch execution options
 */
export interface BatchOptions {
  /** If true, rollback all operations on any failure */
  atomic: boolean
  /** Execution context */
  context: ExecutionContext
}

/**
 * Batch execution result
 */
export interface BatchResult {
  /** Batch ID for tracking */
  batchId: string
  /** Overall status */
  status: ExecutionStatus
  /** Individual execution results */
  results: ToolExecutionResult[]
  /** Total duration in milliseconds */
  durationMs: number
  /** Number of successful executions */
  successCount: number
  /** Number of failed executions */
  errorCount: number
}

// ============================================================================
// Tool Discovery (for AI agents)
// ============================================================================

/**
 * Tool listing for AI agent discovery
 * Simplified view without handlers
 */
export interface ToolListing {
  name: string
  description: string
  inputSchema: JsonSchemaObject
  outputSchema?: JsonSchemaObject
  metadata: ToolMetadata
}

/**
 * Tools grouped by module for organized discovery
 */
export interface ToolsByModule {
  crm: ToolListing[]
  whatsapp: ToolListing[]
  system: ToolListing[]
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation error from JSON Schema validation
 */
export interface ValidationError {
  path: string
  message: string
  keyword: string
  params?: Record<string, unknown>
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}
