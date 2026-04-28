/**
 * Somnio Sales v3 — PW Confirmation Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import (side-effect).
 *
 * Imported by:
 * - src/app/(dashboard)/agentes/routing/editor/page.tsx (dropdown population)
 * - src/lib/agents/production/webhook-processor.ts (pre-warm cold lambdas — LEARNING B-001 agent-lifecycle-router)
 *
 * Separate agent from somnio-sales-v3 — both can coexist (D-03).
 *
 * NOTE: `processMessage` is added in Plan 11 (engine-pw-confirmation +
 * somnio-pw-confirmation-agent). For Wave 1 (Plan 03) only the registration
 * side-effect matters — Plan 11 will add the export here.
 */

import { agentRegistry } from '../registry'
import { somnioPwConfirmationConfig } from './config'

// Self-register on module import
agentRegistry.register(somnioPwConfirmationConfig)

// Re-export public API
export { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
