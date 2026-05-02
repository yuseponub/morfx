/**
 * Somnio Sales Agent v4 — Module Entry Point
 *
 * Self-registers in the agent registry on import (side-effect on first import).
 * v4 is a separate agent from v3 — both can coexist.
 *
 * Standalone: somnio-sales-v4
 * Cloned conceptually from somnio-v3/index.ts (D-24 — no source-level import).
 *
 * Consumers que importan este módulo (registrarán a v4 al cold-start):
 *   - src/lib/agents/production/webhook-processor.ts (pre-warm Promise.all) — Plan 12
 *   - src/app/(dashboard)/agentes/routing/editor/page.tsx (registry list) — Plan 12
 *   - src/inngest/functions/agent-timers-v4.ts (Plan 08)
 *
 * NOTA: `processMessage` se exportará en Plan 07 cuando exista somnio-v4-agent.ts.
 * Hasta entonces, este módulo solo registra config y expone tipos.
 */

import { agentRegistry } from '../registry'
import { somnioV4Config } from './config'

// Self-register on module import (D-13 — sin esta llamada el routing engine
// throws "unregistered agent_id" → fallback_legacy en cold-start).
agentRegistry.register(somnioV4Config)

// Re-export public API
export { SOMNIO_V4_AGENT_ID, SOMNIO_WORKSPACE_ID } from './config'
export type { V4AgentInput, V4AgentOutput } from './types'
export { processMessage } from './somnio-v4-agent'
