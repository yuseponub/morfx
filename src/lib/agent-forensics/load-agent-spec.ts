/**
 * Load a bot's behavior spec from disk.
 *
 * Files live at `src/lib/agent-specs/{id}.md` and are included in the Vercel
 * lambda bundle via `next.config.ts` `outputFileTracingIncludes`
 * (re-added in Plan 04 Task 1 of `agent-forensics-panel` — see
 * 01-SUMMARY.md Post-ship Issue 1 for the rationale of the rollback+shift-right).
 *
 * NO module-scope caching (Pitfall 3) — Vercel lambdas cold-start per
 * invocation and a cache wouldn't help. Spec files are <10KB each;
 * overhead trivial. Spec changes reflect immediately (no redeploy).
 *
 * Valid agent IDs: 'somnio-sales-v3' | 'somnio-recompra-v1' | 'godentist'.
 * Throws for unknown ids so the auditor never silently loads a wrong file.
 *
 * Source: RESEARCH.md §Code Examples lines 726-751 (agent-forensics-panel).
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

const SPEC_IDS = new Set<string>([
  'somnio-sales-v3',
  'somnio-recompra-v1',
  'godentist',
])

export async function loadAgentSpec(agentId: string): Promise<string> {
  if (!SPEC_IDS.has(agentId)) {
    throw new Error(`Unknown agent spec: ${agentId}`)
  }
  const filePath = path.join(
    process.cwd(),
    'src/lib/agent-specs',
    `${agentId}.md`,
  )
  return readFile(filePath, 'utf-8')
}
