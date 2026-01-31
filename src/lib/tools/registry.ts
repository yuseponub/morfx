/**
 * Tool Registry
 * Phase 3: Action DSL Core - Plan 02, Task 3
 *
 * Singleton registry that manages tool registration, discovery, and validation.
 * Uses Ajv with compiled validators for 10x faster validation.
 */

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import type {
  ToolSchema,
  RegisteredTool,
  ToolHandler,
  ToolMetadata,
  ToolModule,
} from './types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('registry')

/**
 * Validation error thrown when tool inputs fail JSON Schema validation
 */
export class ToolValidationError extends Error {
  public readonly errors: NonNullable<Ajv['errors']>
  public readonly toolName: string

  constructor(errors: Ajv['errors'], toolName: string) {
    const errorMessages = errors
      ?.map((e) => `${e.instancePath || 'root'}: ${e.message}`)
      .join(', ')
    super(`Validation failed for tool ${toolName}: ${errorMessages}`)
    this.name = 'ToolValidationError'
    this.errors = errors ?? []
    this.toolName = toolName
  }

  /**
   * Get errors in a simplified format for API responses
   */
  toJSON() {
    return {
      name: this.name,
      toolName: this.toolName,
      errors: this.errors.map((e) => ({
        path: e.instancePath || 'root',
        message: e.message || 'Unknown error',
        keyword: e.keyword,
        params: e.params,
      })),
    }
  }
}

/**
 * Error thrown when a tool is not found in the registry
 */
export class ToolNotFoundError extends Error {
  public readonly toolName: string

  constructor(toolName: string) {
    super(`Unknown tool: ${toolName}`)
    this.name = 'ToolNotFoundError'
    this.toolName = toolName
  }
}

/**
 * Error thrown when registering a tool with invalid configuration
 */
export class ToolRegistrationError extends Error {
  public readonly toolName: string

  constructor(toolName: string, reason: string) {
    super(`Cannot register tool ${toolName}: ${reason}`)
    this.name = 'ToolRegistrationError'
    this.toolName = toolName
  }
}

/**
 * Internal type for registered tools with compiled validator
 */
type RegisteredToolWithValidator = RegisteredTool & {
  _validate: ReturnType<Ajv['compile']>
}

/**
 * Tool Registry - Singleton that manages tool registration, discovery, and validation
 *
 * Features:
 * - JSON Schema validation with Ajv (compiled validators for performance)
 * - Tool discovery via listTools()
 * - Permission checking against user roles
 * - MCP-compatible tool schemas
 *
 * @example
 * // Register a tool
 * toolRegistry.register(
 *   {
 *     name: 'crm.contact.create',
 *     description: 'Create a new contact',
 *     inputSchema: { type: 'object', properties: {...} },
 *     metadata: { module: 'crm', entity: 'contact', action: 'create', ... }
 *   },
 *   async (input, ctx, dryRun) => { ... }
 * )
 *
 * // List available tools
 * const tools = toolRegistry.listTools()
 *
 * // Validate inputs
 * toolRegistry.validateInputs('crm.contact.create', { name: 'John' })
 */
class ToolRegistry {
  private ajv: Ajv
  private tools: Map<string, RegisteredToolWithValidator>

  constructor() {
    this.ajv = new Ajv({
      strict: true, // Enforce strict schema rules
      allErrors: true, // Return all validation errors, not just first
      useDefaults: true, // Apply default values from schema
      coerceTypes: false, // Don't coerce types (be strict)
    })
    addFormats(this.ajv) // Add email, uri, date-time, etc.

    this.tools = new Map()

    logger.info({ event: 'registry_initialized' })
  }

  /**
   * Register a tool with its schema and handler
   *
   * @throws ToolRegistrationError if tool name format is invalid
   * @throws ToolRegistrationError if tool with same name already registered
   *
   * @example
   * toolRegistry.register(
   *   {
   *     name: 'crm.contact.create',
   *     description: 'Create a contact in the CRM',
   *     inputSchema: {
   *       type: 'object',
   *       properties: {
   *         name: { type: 'string' },
   *         phone: { type: 'string' }
   *       },
   *       required: ['name', 'phone'],
   *       additionalProperties: false
   *     },
   *     metadata: {
   *       module: 'crm',
   *       entity: 'contact',
   *       action: 'create',
   *       reversible: false,
   *       requiresApproval: false,
   *       sideEffects: ['creates_record'],
   *       permissions: ['contacts.create']
   *     }
   *   },
   *   async (input, ctx, dryRun) => {
   *     if (dryRun) return { contactId: 'preview', created: false }
   *     // Real implementation here
   *     return { contactId: 'c-123', created: true }
   *   }
   * )
   */
  register<TInput = unknown, TOutput = unknown>(
    schema: ToolSchema<TInput, TOutput>,
    handler: ToolHandler<TInput, TOutput>
  ): void {
    // Validate tool name format: module.entity.action
    const nameParts = schema.name.split('.')
    if (nameParts.length !== 3) {
      throw new ToolRegistrationError(
        schema.name,
        `Invalid name format. Expected: module.entity.action (e.g., 'crm.contact.create')`
      )
    }

    // Validate name parts match metadata
    const [module, entity, action] = nameParts
    if (
      module !== schema.metadata.module ||
      entity !== schema.metadata.entity ||
      action !== schema.metadata.action
    ) {
      throw new ToolRegistrationError(
        schema.name,
        `Name parts don't match metadata. Name: ${schema.name}, Metadata: ${schema.metadata.module}.${schema.metadata.entity}.${schema.metadata.action}`
      )
    }

    // Check for duplicate
    if (this.tools.has(schema.name)) {
      throw new ToolRegistrationError(
        schema.name,
        `Tool already registered`
      )
    }

    // Compile validator for performance (10x faster than runtime compilation)
    const validate = this.ajv.compile(schema.inputSchema as object)

    // Store tool with compiled validator
    this.tools.set(schema.name, {
      ...schema,
      handler: handler as ToolHandler,
      _validate: validate,
    })

    logger.info({
      event: 'tool_registered',
      tool_name: schema.name,
      module: schema.metadata.module,
      permissions: schema.metadata.permissions,
    })
  }

  /**
   * Get a registered tool by name
   *
   * @throws ToolNotFoundError if tool not found
   */
  getTool(name: string): RegisteredToolWithValidator {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new ToolNotFoundError(name)
    }
    return tool
  }

  /**
   * Validate inputs against tool's JSON Schema
   *
   * @throws ToolValidationError if validation fails
   * @throws ToolNotFoundError if tool not found
   */
  validateInputs(toolName: string, inputs: unknown): void {
    const tool = this.getTool(toolName)

    if (!tool._validate(inputs)) {
      throw new ToolValidationError(tool._validate.errors, toolName)
    }
  }

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean {
    return this.tools.has(name)
  }

  /**
   * List all registered tools (for discovery)
   * Returns schema without handler (safe to expose to AI agents)
   */
  listTools(): ToolSchema[] {
    return Array.from(this.tools.values()).map(
      ({ _validate, handler, snapshotProvider, ...schema }) => schema
    )
  }

  /**
   * List tools filtered by module
   */
  listToolsByModule(module: ToolModule): ToolSchema[] {
    return this.listTools().filter((t) => t.metadata.module === module)
  }

  /**
   * List tools filtered by required permission
   */
  listToolsByPermission(permission: string): ToolSchema[] {
    return this.listTools().filter((t) =>
      t.metadata.permissions.includes(permission as any)
    )
  }

  /**
   * List tools filtered by entity
   */
  listToolsByEntity(entity: string): ToolSchema[] {
    return this.listTools().filter((t) => t.metadata.entity === entity)
  }

  /**
   * Get tool names grouped by module (for UI organization)
   */
  getToolsByModule(): Record<ToolModule, string[]> {
    const result: Record<ToolModule, string[]> = {
      crm: [],
      whatsapp: [],
      system: [],
    }

    for (const [name, tool] of this.tools) {
      result[tool.metadata.module].push(name)
    }

    return result
  }

  /**
   * Get tool count (for debugging/metrics)
   */
  get size(): number {
    return this.tools.size
  }

  /**
   * Clear all registered tools (for testing only)
   * @internal
   */
  _clear(): void {
    this.tools.clear()
    logger.debug({ event: 'registry_cleared' })
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry()

// Export class for testing
export { ToolRegistry }
