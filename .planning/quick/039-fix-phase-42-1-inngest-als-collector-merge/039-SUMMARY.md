---
phase: quick-039
plan: 039
type: quick
completed: 2026-04-09
verified: 2026-04-09
status: verified-in-production
commits:
  - e757bb8 # Task 1: mergeFrom + revert probes
  - 7fd031b # Task 2: __obs encoding + outer merge
  - ace557f # Task 3 (docs): plan + summary + STATE
verification:
  deploy_commit: 0fdbfc3 # hotfix paralelo que desbloqueo deploy (exclude apps/)
  deploy_time_utc: 2026-04-09T20:39:13Z
  post_fix_samples:
    - agent_id: godentist
      queries: 34
      ai_calls: 1
      tokens: 5274
      cost_usd: 0.0071
    - agent_id: godentist
      queries: 30
      ai_calls: 1
      tokens: 5688
      cost_usd: 0.0076
    - agent_id: somnio-v3
      queries: 20
      ai_calls: 1
      tokens: 5498
      cost_usd: 0.0076
  anti_recursion_count: 0
  regression: none
files_modified:
  - src/lib/observability/collector.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/inngest/functions/agent-production.ts
---

# Quick 039 — Fix Phase 42.1 Inngest + ALS Collector Merge

## One-liner

Encode observability captures in `step.run` return value (`__obs`) so they survive Inngest replay-lambda boundaries, merged into the outer per-iteration collector before flush.

## Problem

Phase 42.1 activation captured exactly **7 events, 0 queries, 0 AI calls** per turn across all bots in production, despite the flag being ON and infrastructure verified healthy. See `.planning/phases/42.1-observabilidad-bots-produccion/BUG-INNGEST-ALS-FIX-CONTEXT.md` for the full diagnostic journey.

## Root cause

Each Inngest iteration is a separate Vercel lambda with its own JS heap:

- Lambda #2 executes the `step.run('process-message')` callback exactly once. Queries + AI calls captured via AsyncLocalStorage inside that callback land in lambda #2's collector instance.
- Lambda #3 (the flush iteration) constructs a **brand-new empty collector** and returns the cached step output without re-running the callback. Lambda #2's collector is garbage collected when its HTTP response is sent.
- The **only state** that crosses the lambda boundary is the serialized `step.run` return value.

Every previous attempt (including commit `479fe18` which re-wrapped with `runWithCollector` inside the step) ignored this fundamental constraint.

## Fix

### 1. `src/lib/observability/collector.ts` (Task 1 + Task 2 type widening)

Added public `mergeFrom(other)` method that:

- Accepts `readonly unknown[]` in array positions (accepts both raw `ObservabilityCollector` snapshots and `JsonifyObject`-wrapped payloads from Inngest step outputs — Inngest types wrap outputs so `Date` instances are typed as strings after serialization).
- Pushes events/queries/aiCalls from the other collector.
- Coerces `recordedAt` fields from ISO strings back to `Date` (Inngest JSON-serializes step outputs, but `flush.ts` calls `.toISOString()` downstream, so the coercion is required for persistence to work).
- Re-sorts all three arrays by `recordedAt` with `sequence` tiebreaker and re-assigns monotonic sequence numbers globally so the UI timeline renders cleanly across merged + closure-appended events.
- Updates `sequenceCounter` to stay ahead of merged content, so subsequent `turn_completed` / post-merge events receive correct higher sequence numbers.
- Wrapped in try/catch per REGLA 6 (collector never throws from instrumentation).

### 2. `src/lib/agents/production/webhook-processor.ts` (Task 1)

Reverted the Phase 42.1 diagnostic probes (commits `83c4321`, `2e924ec`):

- Removed `import { getCollector } from '@/lib/observability'` (no other usage in file).
- Removed the `[42.1 PROBE]` logger.info + `probeCollector?.recordEvent(...)` block at the entry of `processMessageWithAgent`.

Those probes were no-ops because ALS propagation across the Inngest step boundary was already broken — they only existed to confirm the broken path.

### 3. `src/inngest/functions/agent-production.ts` (Task 2)

Replaced the `step.run('process-message')` block:

**Before:**
```typescript
const result = await step.run('process-message', async () => {
  const { processMessageWithAgent } = await import('@/lib/agents/production/webhook-processor')
  const invokePipeline = () => processMessageWithAgent({...})
  return collector ? runWithCollector(collector, invokePipeline) : invokePipeline()
})
```

**After:**
```typescript
const stepResult = await step.run('process-message', async () => {
  const { processMessageWithAgent } = await import('@/lib/agents/production/webhook-processor')

  // Create a LOCAL collector whose state will be serialized in step output.
  const stepCollector = collector
    ? new ObservabilityCollector({
        conversationId: collector.conversationId,
        workspaceId: collector.workspaceId,
        agentId: collector.agentId,
        turnStartedAt: collector.turnStartedAt,
        triggerMessageId: collector.triggerMessageId,
        triggerKind: collector.triggerKind,
      })
    : null

  const invokePipeline = () => processMessageWithAgent({...})

  const engineResult = stepCollector
    ? await runWithCollector(stepCollector, invokePipeline)
    : await invokePipeline()

  return {
    engineResult,
    __obs: stepCollector
      ? { events: stepCollector.events, queries: stepCollector.queries, aiCalls: stepCollector.aiCalls }
      : null,
  }
})

const result = stepResult.engineResult

if (collector && stepResult.__obs) {
  collector.mergeFrom(stepResult.__obs)
}
```

The mergeFrom call runs on **every** Inngest replay using the **cached** `stepResult`, so even though the outer `collector` is a brand-new instance in each iteration, it always ends up with the same merged data before flush.

## Why this works

1. Step outputs are deterministic across Inngest replays (cached after the first lambda that runs them).
2. The outer handler executes top-to-bottom on every replay, including the `mergeFrom` call which operates on the cached `__obs`.
3. Closure-based `collector?.recordEvent(...)` calls in the outer handler (turn_started, media_gate, classifier, passthrough, mode_transition, block_composition, turn_completed — 14 call sites preserved) continue to push into the fresh outer collector. When mergeFrom renormalizes sequences by `recordedAt`, the combined timeline is monotonic.
4. The flush iteration (final Inngest lambda) ends up with a collector containing: closure events + merged step events + merged queries + merged AI calls, all sequenced correctly.

## REGLA 6 preservation

Agent behavior is unchanged:

- `runWithCollector` still wraps `invokePipeline` — the wrapping collector is `stepCollector` instead of the outer one, but downstream pipeline code resolves via ALS identically.
- All 14 closure `collector?.recordEvent` call sites in the outer handler preserved byte-identical.
- The pipeline code (`processMessageWithAgent`, `UnifiedEngine`, `V3ProductionRunner`, fetch wrappers) is untouched.
- No feature flag toggling — this is a pure mechanical fix to how observability data crosses the Inngest lambda boundary. When `OBSERVABILITY_ENABLED=false`, `collector` is null and the entire merge path is bypassed: behavior reverts to exactly the pre-fix baseline (stepCollector also null, no runWithCollector wrap, result extracted from `stepResult.engineResult` which still contains the real `SomnioEngineResult`).

## Payload size

Each step output now carries ~20-50 KB extra (up to 30 events + 20 queries + 4 AI calls). Well under Inngest's 4 MB step output limit. No chunking needed.

## Verification

- `npx tsc --noEmit` clean for the 3 modified files (pre-existing unrelated errors remain in `src/app/(dashboard)/crm/*`, `src/app/api/webhooks/twilio/status/route.ts`, `src/lib/agents/somnio/__tests__/*`, `src/lib/tools/rate-limiter.ts` — all out of scope for quick/039).
- `grep` verification:
  - `__obs` appears in both production site (step.run return) and consumption site (`collector.mergeFrom`) in `agent-production.ts`.
  - Two `new ObservabilityCollector` call sites (outer handler + step-local).
  - 14 `collector?.recordEvent` calls preserved.
  - `mergeFrom` method defined in `collector.ts`.
  - Zero `42.1 PROBE` / `getCollector` references in `webhook-processor.ts`.
- Commits pushed to `origin main`: `7fd031b` (Task 2) on top of `e757bb8` (Task 1).

## Deviations from plan

1. **mergeFrom signature widened** (not in original plan): The first attempt used the exact signature from the plan (`events: ObservabilityEvent[]`, etc.). It failed tsc because Inngest wraps step outputs in `JsonifyObject<T>` at the type level, making `Date` fields typed as strings. Relaxed to `readonly unknown[]` with internal `as ObservabilityEvent` casts. The runtime behavior is identical — type safety is enforced by the callers (only two in practice: test-time same-process merges and the agent-production handler).

2. **recordedAt coercion added to mergeFrom** (not in original plan): `flush.ts` calls `.toISOString()` on `recordedAt` during persistence, which would crash on ISO strings. Added `new Date(value)` coercion at merge time to handle both raw Date (same-process) and string (post-JSON-roundtrip) inputs.

3. **Commit pipeline concurrency incident**: A parallel agent working on Phase 43 mobile features was committing concurrently. The first attempt at the Task 2 commit (`d96611e`, later discarded) unexpectedly picked up unrelated staged files (`shared/mobile-api/schemas.ts`, `tsconfig.json`) instead of the observability changes. A `git reset --soft HEAD~1` recovered the situation, the orphaned staged files were recommitted upstream as `e26b848` by the parallel agent, and the Task 2 commit was redone cleanly as `7fd031b` with only the 2 intended files. No work lost, but worth noting for future agents running in parallel execution.

## Production verification (PENDING — Task 3 checkpoint)

The code is deployed to Vercel (push of `7fd031b` at commit time). The user must now:

1. Wait for Vercel production deploy on `morfx` project to finish (~2-3 min).
2. Send one real text message to each of:
   - Somnio V3 (workspace `a3843b3f-c337-4836-92b5-89c58bb98490`)
   - GoDentist (workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)
   - Somnio Recompra (if accessible)
3. Wait ~10s per turn for Inngest to finish.
4. Run in Supabase production:
   ```sql
   SELECT agent_id, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, started_at
   FROM agent_observability_turns
   WHERE started_at > now() - interval '10 minutes'
   ORDER BY started_at DESC;
   ```
   **Expected:** each row `query_count >= 5`, `ai_call_count >= 1`, `total_tokens > 0`, `total_cost_usd > 0`, `event_count >= 10`.
5. Anti-recursion check:
   ```sql
   SELECT count(*) FROM agent_observability_queries
   WHERE table_name LIKE 'agent_observability_%' OR table_name = 'agent_prompt_versions';
   ```
   Expected: 0.
6. UI check: inbox → test conversation → Bug icon in header → new turn → clickable timeline with query rows and expandable AI calls.
7. **Regression check:** bot replied normally to each test message.

After verification, the user should edit this SUMMARY to record actual numbers per bot.

## Follow-ups filed (from BUG-INNGEST-ALS-FIX-CONTEXT.md)

1. **`resolveAgentIdForWorkspace` classification bug**: Defaults to `'somnio-v2'` when the workspace config mapping fails. Turns from unknown/misconfigured workspaces are labeled `somnio-v2` in the observability table even when the real agent is different. Not a capture bug — a classification bug. Recommendation: return an `'unknown'` bucket (add to `AgentId` union) and log a warning when the mapping misses. Out of scope for quick/039.

2. **`turnStartedAt` cross-replay drift**: The outer collector is reconstructed on every Inngest replay with `turnStartedAt: new Date()`, so the `started_at` persisted by flush can differ slightly across replays. Not observed as a problem yet (flush only runs once per turn, on the final replay), but worth tracking. Out of scope for quick/039.
