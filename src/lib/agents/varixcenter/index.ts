/**
 * Varixcenter — Module Entry Point
 *
 * Self-registra en agentRegistry on import (side-effect).
 *
 * Agente NUEVO (NO sibling) — coexiste con godentist/godentist-fb-ig (D-01, Regla 6).
 * No reemplaza ningún agente existente; se activa 100% vía routing rule manual sobre
 * el workspace target (sin feature flag — ver Wave 6 / Plan 11).
 *
 * Imported por (Wave futura — registro/dispatch):
 * - el editor de routing (dropdown population)
 * - el webhook-processor (pre-warm cold lambdas + dispatch)
 * - el production runner (dynamic import)
 */

import { agentRegistry } from '../registry'
import { varixcenterConfig } from './config'

// Self-register on module import (side-effect)
agentRegistry.register(varixcenterConfig)

// Re-export public API
export { VARIXCENTER_AGENT_ID } from './config'
export { processMessage } from './varixcenter-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
