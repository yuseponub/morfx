/**
 * CRM Orchestrator
 * Phase 15.6: Sandbox Evolution
 *
 * Routes CRM commands from the conversational flow to the appropriate CRM agent.
 * The conversational agent (Somnio) never calls CRM agents directly.
 */

import { crmAgentRegistry } from './crm-agent-registry'
import type { CrmCommand, CrmAgentResult, CrmExecutionMode } from './types'

export class CrmOrchestrator {
  /**
   * Route a command to the appropriate CRM agent and execute it.
   *
   * @param command - The CRM command to execute
   * @param mode - dry-run (mock) or live (real DB operations)
   * @returns Result from the CRM agent
   */
  async route(command: CrmCommand, mode: CrmExecutionMode): Promise<CrmAgentResult> {
    const agent = crmAgentRegistry.getAgentForCommand(command.type)

    if (!agent) {
      return {
        success: false,
        agentId: 'unknown',
        commandType: command.type,
        toolCalls: [],
        tokensUsed: [],
        mode,
        timestamp: new Date().toISOString(),
        error: {
          code: 'NO_AGENT',
          message: `No CRM agent registered for command type: ${command.type}`,
        },
      }
    }

    return agent.execute(command, mode)
  }

  /**
   * Check if a command type has a registered handler.
   */
  canHandle(commandType: string): boolean {
    return crmAgentRegistry.getAgentForCommand(commandType as never) !== undefined
  }
}

/** Singleton orchestrator instance */
export const crmOrchestrator = new CrmOrchestrator()
