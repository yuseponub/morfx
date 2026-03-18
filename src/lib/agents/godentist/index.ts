/**
 * GoDentist Appointment Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import.
 * Separate agent from Somnio — both can coexist.
 */

import { agentRegistry } from '../registry'
import { godentistConfig, GODENTIST_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(godentistConfig)

// Re-export public API
export { GODENTIST_AGENT_ID } from './config'
export { processMessage } from './godentist-agent'
export type { V3AgentInput, V3AgentOutput } from './types'
