/**
 * Somnio Sales Agent v3 — Module Entry Point
 *
 * Self-registers in the agent registry on import.
 * v3 is a separate agent from v1 — both can coexist.
 */

import { agentRegistry } from '../registry'
import { somnioV3Config, SOMNIO_V3_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(somnioV3Config)

// Re-export public API
export { SOMNIO_V3_AGENT_ID } from './config'
export { processMessage } from './somnio-v3-agent'
export type { V3AgentInput, V3AgentOutput } from './types'
