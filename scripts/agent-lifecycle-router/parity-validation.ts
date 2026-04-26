/**
 * Plan 07 Task 3 — Dry-run parity validation Somnio 30d
 *
 * Loads Somnio's active routing_rules from production and replays them
 * against the last 30 days of inbound messages. Outputs distribution
 * before/after + list of changed decisions for human review.
 *
 * Usage: npx tsx scripts/agent-lifecycle-router/parity-validation.ts
 *
 * Notes:
 * - dry-run NEVER writes audit log (D-10 invariant; Plan 05 verified).
 * - Reads against production DB but writes nothing (safe to run anytime).
 * - For 100% parity (D-15), `summary.changed_count` should be 0 given
 *   Somnio.recompra_enabled=true (no message hits Rule 2 priority 900).
 */

import 'dotenv/config'
import { agentRegistry } from '@/lib/agents/registry'

async function main() {
  // Force ordered agent registration via dynamic await import (tsx defers static
  // import side-effects asynchronously — without this, routeAgent's validation
  // `agentRegistry.has(agent_id)` fails with race condition).
  await import('@/lib/agents/somnio-recompra')
  await import('@/lib/agents/somnio-v3')
  await import('@/lib/agents/somnio')
  await import('@/lib/agents/godentist')

  // Lazy-load these AFTER agents to avoid bundling the registry check into
  // a different module instance.
  const { dryRunReplay } = await import('@/lib/agents/routing/dry-run')
  const { listRules } = await import('@/lib/domain/routing')

  const SOMNIO_WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490'
  const DAYS_BACK = parseInt(process.env.PARITY_DAYS_BACK ?? '30', 10)
  const LIMIT = parseInt(process.env.PARITY_LIMIT ?? '200', 10)

  console.log(`\n=== Dry-run parity validation ===`)
  console.log(`Workspace: ${SOMNIO_WORKSPACE_ID} (Somnio)`)
  console.log(`Days back: ${DAYS_BACK}`)
  console.log(`Limit: ${LIMIT}\n`)

  // Sanity check: agent registry must include the IDs the rules emit.
  const requiredAgents = ['somnio-recompra-v1', 'somnio-sales-v3', 'somnio-sales-v1', 'godentist']
  const missing = requiredAgents.filter((id) => !agentRegistry.has(id))
  if (missing.length > 0) {
    console.error(`Agent registry missing required IDs: ${missing.join(', ')}`)
    process.exit(1)
  }
  console.log(`Agent registry OK: ${requiredAgents.join(', ')} all registered\n`)

  const rulesResult = await listRules({ workspaceId: SOMNIO_WORKSPACE_ID })
  if (!rulesResult.success) {
    console.error('Failed to load rules:', rulesResult.error)
    process.exit(1)
  }

  const candidateRules = (rulesResult.data ?? []).filter((r) => r.active)
  console.log(`Loaded ${candidateRules.length} active rules:`)
  for (const r of candidateRules) {
    console.log(`  - [${r.priority}] ${r.name} (${r.rule_type})`)
  }
  console.log()

  if (candidateRules.length === 0) {
    console.error('No active rules found — abort.')
    process.exit(1)
  }

  console.log('Running dry-run replay...')
  const t0 = Date.now()
  const result = await dryRunReplay({
    workspaceId: SOMNIO_WORKSPACE_ID,
    candidateRules,
    daysBack: DAYS_BACK,
    limit: LIMIT,
  })
  const elapsedMs = Date.now() - t0

  console.log(`\nReplay complete in ${(elapsedMs / 1000).toFixed(2)}s`)
  console.log(`\n=== Summary ===`)
  console.log(`total_inbound:   ${result.total_inbound}`)
  console.log(`changed_count:   ${result.summary.changed_count}`)
  if (result.total_inbound > 0) {
    const pct = ((result.summary.changed_count / result.total_inbound) * 100).toFixed(2)
    console.log(`changed pct:     ${pct}%`)
  }

  console.log(`\n=== Distribution BEFORE (current rules / flag OFF) ===`)
  console.log(JSON.stringify(result.summary.before, null, 2))

  console.log(`\n=== Distribution AFTER (candidate rules / flag ON) ===`)
  console.log(JSON.stringify(result.summary.after, null, 2))

  console.log(`\n=== First 20 changed decisions ===`)
  const changed = result.decisions.filter((d) => d.changed)
  if (changed.length === 0) {
    console.log('(no changes — 100% parity)')
  } else {
    for (const d of changed.slice(0, 20)) {
      const before = d.current_decision
        ? `${d.current_decision.reason}/${d.current_decision.agent_id ?? 'null'}`
        : 'no_current'
      const after = `${d.candidate_decision.reason}/${d.candidate_decision.agent_id ?? 'null'}`
      console.log(`  conv=${d.conversation_id} contact=${d.contact_id}: ${before} → ${after}`)
    }
    if (changed.length > 20) {
      console.log(`  ... and ${changed.length - 20} more`)
    }
  }

  console.log()
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
