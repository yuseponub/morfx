/**
 * Somnio Sales v3 — PW Confirmation Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import (side-effect).
 *
 * Imported by:
 * - src/app/(dashboard)/agentes/routing/editor/page.tsx (dropdown population)
 * - src/lib/agents/production/webhook-processor.ts (pre-warm cold lambdas — LEARNING B-001 agent-lifecycle-router)
 * - src/inngest/functions/pw-confirmation-preload-and-invoke.ts (anti-B-001 cold-import pre-warm)
 * - src/lib/agents/engine/v3-production-runner.ts (dynamic import — Plan 11 branch)
 *
 * Separate agent from somnio-sales-v3 — both can coexist (D-03).
 *
 * Plan 11 (Wave 5): added `processMessage` re-export so V3ProductionRunner can
 * `await import('../somnio-pw-confirmation')` and invoke it directly (matching
 * the recompra pattern in v3-production-runner.ts).
 */

import { agentRegistry } from '../registry'
import { somnioPwConfirmationConfig } from './config'

// Self-register on module import
agentRegistry.register(somnioPwConfirmationConfig)

// Re-export public API
export { SOMNIO_PW_CONFIRMATION_AGENT_ID } from './config'
export { processMessage } from './somnio-pw-confirmation-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
