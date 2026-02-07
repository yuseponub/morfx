/**
 * CRM Agent System
 * Phase 15.6: Sandbox Evolution
 *
 * Self-registers CRM agents on import.
 */

export { crmAgentRegistry } from './crm-agent-registry'
export { crmOrchestrator, CrmOrchestrator } from './crm-orchestrator'
export type { CrmAgent, CrmCommand, CrmAgentResult, CrmCommandType, CrmExecutionMode, OrderManagerMode, CrmAgentInfo } from './types'

// Self-register agents
import { OrderManagerAgent } from './order-manager/agent'
import { crmAgentRegistry } from './crm-agent-registry'

crmAgentRegistry.register(new OrderManagerAgent())
