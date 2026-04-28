/**
 * Somnio Sales v3 — PW Confirmation — Engine Wrapper (sandbox / dev usage)
 *
 * Production usage goes through V3ProductionRunner (see Plan 11 Task 3 branch
 * in `src/lib/agents/engine/v3-production-runner.ts`) which calls
 * `processMessage(v3Input as any)` directly. This wrapper is a placeholder for
 * sandbox / dev integration if/when needed (e.g. PW confirmation playground
 * page mirroring `/sandbox/recompra`).
 *
 * Plan 11 §must_haves explicitly accepts a stub-minimum implementation here
 * (`engine-pw-confirmation.ts es opcional (wrapper para sandbox usage —
 * clonar de engine-recompra.ts si util, NO si el agente es 100% production-only
 * via Inngest)`). V1 ships as a thin pass-through; V1.1 may add sandbox
 * SandboxState ↔ AgentState mapping if a sandbox UI is built.
 */

import { processMessage } from './somnio-pw-confirmation-agent'
import type { V3AgentInput, V3AgentOutput } from './types'

/**
 * Run the PW-confirmation agent end-to-end on a single turn.
 *
 * Thin wrapper: delegates to `processMessage` from the agent module. Kept
 * as a separate export so future sandbox integration can layer adapter glue
 * (DB-less storage, fake CRM context, etc.) on top without disturbing the
 * production path.
 */
export async function runEngine(input: V3AgentInput): Promise<V3AgentOutput> {
  return processMessage(input)
}

/**
 * Re-export of the underlying agent processMessage so callers that prefer the
 * canonical name (matching recompra/somnio-recompra-agent.ts:processMessage)
 * have a single import surface.
 */
export { processMessage }
