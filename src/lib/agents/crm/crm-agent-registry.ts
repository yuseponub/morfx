/**
 * CRM Agent Registry
 * Phase 15.6: Sandbox Evolution
 *
 * Singleton registry for CRM agents. Agents self-register.
 */

import type { CrmAgent, CrmAgentInfo, CrmCommandType } from './types'

class CrmAgentRegistryImpl {
  private agents = new Map<string, CrmAgent>()

  /** Register a CRM agent */
  register(agent: CrmAgent): void {
    if (this.agents.has(agent.id)) {
      console.warn(`[CrmAgentRegistry] Agent already registered: ${agent.id}`)
      return
    }
    this.agents.set(agent.id, agent)
  }

  /** Get a CRM agent by ID. Throws if not found. */
  get(id: string): CrmAgent {
    const agent = this.agents.get(id)
    if (!agent) {
      throw new Error(`CRM agent not found: ${id}`)
    }
    return agent
  }

  /** Find the agent that handles a given command type */
  getAgentForCommand(commandType: CrmCommandType): CrmAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.supportedCommands.includes(commandType)) {
        return agent
      }
    }
    return undefined
  }

  /** List all registered CRM agents (for UI dropdown) */
  listAgents(): CrmAgentInfo[] {
    return Array.from(this.agents.values()).map(agent => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      supportedCommands: agent.supportedCommands,
    }))
  }

  /** Check if an agent is registered */
  has(id: string): boolean {
    return this.agents.has(id)
  }
}

/** Singleton CRM agent registry */
export const crmAgentRegistry = new CrmAgentRegistryImpl()
