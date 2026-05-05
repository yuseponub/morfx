/**
 * GoDentist FB/IG Sibling Agent — Module Entry Point
 *
 * Self-registers in the agent registry on import (side-effect).
 *
 * Imported by:
 * - src/app/(dashboard)/agentes/routing/editor/page.tsx (dropdown population — Wave 3 Plan 05)
 * - src/lib/agents/production/webhook-processor.ts (pre-warm cold lambdas — Wave 3 Plan 05)
 * - src/lib/agents/engine/v3-production-runner.ts (dynamic import — Wave 3 Plan 05)
 *
 * Separate agent from godentist — both can coexist (D-04).
 */

import { agentRegistry } from '../registry'
import { godentistFbIgConfig } from './config'

// Self-register on module import
agentRegistry.register(godentistFbIgConfig)

// Re-export public API
export { GODENTIST_FB_IG_AGENT_ID } from './config'
export { processMessage } from './godentist-fb-ig-agent'
export type { V3AgentInput, V3AgentOutput, TipoAccion } from './types'
