/**
 * Agent Registry
 * Phase 13: Agent Engine Core - Plan 02
 *
 * Centralized registry for agent configurations.
 * Agents are registered at application startup and accessed by ID.
 */

import type { AgentConfig } from './types'
import { AgentNotFoundError } from './errors'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('agent-registry')

/**
 * Registry for managing agent configurations.
 *
 * Agents are code-defined (not database-stored) for simplicity.
 * Each agent has: ID, name, Claude model configs, available tools,
 * state machine definition, and confidence thresholds.
 *
 * @example
 * ```typescript
 * agentRegistry.register({
 *   id: 'somnio-sales',
 *   name: 'Somnio Sales Agent',
 *   // ... full config
 * })
 *
 * const agent = agentRegistry.get('somnio-sales')
 * ```
 */
export class AgentRegistry {
  private agents = new Map<string, AgentConfig>()

  /**
   * Register a new agent configuration.
   * Overwrites if agent with same ID already exists.
   */
  register(config: AgentConfig): void {
    // Validate required fields
    if (!config.id || !config.name) {
      throw new Error('Agent config must have id and name')
    }
    if (!config.intentDetector?.systemPrompt) {
      throw new Error('Agent config must have intentDetector.systemPrompt')
    }
    if (!config.orchestrator?.systemPrompt) {
      throw new Error('Agent config must have orchestrator.systemPrompt')
    }

    this.agents.set(config.id, config)
    logger.info({ agentId: config.id, name: config.name }, 'Agent registered')
  }

  /**
   * Get agent configuration by ID.
   * @throws AgentNotFoundError if agent doesn't exist
   */
  get(agentId: string): AgentConfig {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new AgentNotFoundError(agentId)
    }
    return agent
  }

  /**
   * Check if agent exists in registry.
   */
  has(agentId: string): boolean {
    return this.agents.has(agentId)
  }

  /**
   * Get all registered agents.
   */
  list(): AgentConfig[] {
    return Array.from(this.agents.values())
  }

  /**
   * Get list of agent IDs.
   */
  listIds(): string[] {
    return Array.from(this.agents.keys())
  }

  /**
   * Unregister an agent (mainly for testing).
   */
  unregister(agentId: string): boolean {
    const deleted = this.agents.delete(agentId)
    if (deleted) {
      logger.info({ agentId }, 'Agent unregistered')
    }
    return deleted
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.agents.clear()
    logger.info('All agents cleared from registry')
  }

  /**
   * Get count of registered agents.
   */
  get size(): number {
    return this.agents.size
  }
}

/** Singleton instance of the agent registry */
export const agentRegistry = new AgentRegistry()
