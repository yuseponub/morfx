/**
 * Somnio Recompra Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import.
 * Separate agent from Somnio v3 — both can coexist.
 */

import { agentRegistry } from '../registry'
import { somnioRecompraConfig, SOMNIO_RECOMPRA_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(somnioRecompraConfig)

// Re-export public API
export { SOMNIO_RECOMPRA_AGENT_ID } from './config'
export { processMessage } from './somnio-recompra-agent'
export type { V3AgentInput, V3AgentOutput } from './types'
