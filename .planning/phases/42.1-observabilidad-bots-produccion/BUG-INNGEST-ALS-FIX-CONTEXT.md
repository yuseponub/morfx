# Phase 42.1 Activation Bug — Inngest + ALS + In-Memory Collector Incompatibility

**Date discovered:** 2026-04-09
**Status:** Active bug blocking Phase 42.1 activation
**Severity:** Critical — observability captures 0 queries / 0 AI calls despite the code being deployed and the feature flag ON
**Approach:** `/gsd:quick` (targeted bug fix, ~1h)

---

## TL;DR for the next Claude session

Phase 42.1 (Production Bot Observability) is deployed with `OBSERVABILITY_ENABLED=true` in Vercel production. The system captures exactly **7 events per turn, 0 queries, 0 AI calls** across all turns, regardless of the bot (Somnio V3 / GoDentist / Somnio Recompra / Somnio V2).

The root cause is **architectural incompatibility between Inngest's replay-based step memoization and the in-memory `ObservabilityCollector`**. The collector used inside `step.run` callbacks gets discarded because each Inngest iteration is a separate serverless invocation, and the final iteration (that runs the flush) never sees the data captured inside step callbacks.

**Fix:** encode observability data in the `step.run` output so Inngest serializes and caches it. The outer handler merges the cached data into its own collector before flushing.

---

## Evidence Chain (diagnostic journey)

### 1. Deploy / infra verified healthy
- Commit on main includes the fix + probes: `2e924ec` (debug probe), `479fe18` (runWithCollector re-wrap), `1e1830d` (trigger_message_id TEXT), `d947fb5` (GRANTs), `b93bf90` (MORFX_OWNER_USER_ID)
- Vercel project `morfx` (not `morfx-new`) serves `morfx.app`. Latest production deploy confirmed 2026-04-09 ~12:22 COT, built from main HEAD with all fixes above
- `OBSERVABILITY_ENABLED=true` confirmed in Vercel env vars (Production scope)
- `MORFX_OWNER_USER_ID=50e4a60d-8e52-42e9-ac69-db4d7438d0ad` confirmed
- Schema migration applied in prod (5 tables + 12 partitions + 2 RPC helpers)
- GRANTs applied: `GRANT ALL ON TABLE agent_observability_* TO service_role` (fixed SQLSTATE 42501)
- Column type fix applied: `trigger_message_id TEXT` (fixed SQLSTATE 22P02 for wamid IDs)

### 2. What DOES work (captured events)
Every turn has exactly 7 events, ALL from **closure-based** `collector?.recordEvent(...)` calls in `src/inngest/functions/agent-production.ts`:

| # | category | label | source line (approx) |
|---|----------|-------|---------------------|
| 0 | session_lifecycle | turn_started | inside outer handler, before step.run |
| 1 | media_gate | gate_decision | after step.run('media-gate') |
| 2 | classifier | rule-based media routing | after step.run('media-gate') |
| 3 | media_gate | passthrough | after step.run('media-gate'), before step.run('process-message') |
| 4 | mode_transition | null/engine_result | AFTER step.run('process-message') resolves |
| 5 | block_composition | turn_outbound_summary | AFTER step.run('process-message') resolves |
| 6 | session_lifecycle | turn_completed | end of run() |

### 3. What does NOT work (0 captures)
- **0 queries** — the Supabase fetch wrapper (`src/lib/observability/fetch-wrapper.ts`) uses `getCollector()` (ALS-based). Never captures anything.
- **0 AI calls** — the Anthropic fetch wrapper uses `getCollector()` (ALS-based). Never captures anything.
- **0 events** from `getCollector()?.recordEvent(...)` calls in:
  - `src/lib/agents/engine/unified-engine.ts` (silence_timer)
  - `src/lib/agents/somnio-v3/sales-track.ts` (retake, ofi_inter)
  - `src/lib/agents/somnio-v3/response-track.ts` (retake, ofi_inter)
  - `src/lib/agents/somnio/interruption-handler.ts` (interruption_handling, pending_pool)
- **0 fires** of diagnostic probe `logger.info('[42.1 PROBE] processMessageWithAgent entry')` added to `src/lib/agents/production/webhook-processor.ts` line 79-88
- **0 fires** of diagnostic probe `recordEvent('tool_call', 'webhook_processor_entry')` at same location

### 4. Previous failed attempts (DO NOT RETRY)
- **Attempt 1 (commit 479fe18)**: Re-wrap `runWithCollector(collector, () => processMessageWithAgent(...))` INSIDE the `step.run('process-message')` callback. Rationale: restore ALS inside the step boundary. **Result: 0 improvement.** The probe inside `processMessageWithAgent` still doesn't fire.
- **Attempt 2 (commits 83c4321, 2e924ec)**: Add a diagnostic probe at the top of `processMessageWithAgent` using both `logger.info` (fires regardless of collector state) AND `recordEvent` via `getCollector()`. **Result: neither the log nor the event ever appears.**

These failures proved that the issue isn't ALS propagation per se — it's that the collector instance the step.run callback uses gets **lost** between the step execution and the final flush.

---

## Root Cause (confirmed)

Inngest's execution model for functions with `step.run(...)`:

```
Webhook → Inngest receives event → POST /api/inngest (Vercel lambda #1)
  - Function body runs from top
  - Reaches step.run('media-gate')
  - Callback executes, returns gateResult
  - Inngest serializes gateResult, stores in event log
  - Lambda #1 returns HTTP 206 "partial"
  - Inngest makes a second HTTP call
  
POST /api/inngest (Vercel lambda #2 — DIFFERENT lambda, fresh heap)
  - Function body runs from top AGAIN
  - const collector = new ObservabilityCollector(...) ← NEW instance
  - collector.recordEvent('session_lifecycle', 'turn_started', ...)
  - Reaches step.run('media-gate')
  - Returns CACHED gateResult (callback NOT re-run)
  - collector.recordEvent('media_gate', 'gate_decision', ...) ← fires
  - collector.recordEvent('classifier', 'rule-based media routing', ...) ← fires
  - collector.recordEvent('media_gate', 'passthrough', ...) ← fires
  - Reaches step.run('process-message')
  - Executes callback (first time this is seen):
    - Inside callback: runWithCollector(collector, processMessageWithAgent(...))
    - collector here is lambda #2's instance
    - processMessageWithAgent runs, makes Supabase queries + Claude calls
    - Fetch wrapper fires, records into collector (lambda #2's instance)
    - 7 queries + 3 AI calls in collector.queries / collector.aiCalls
    - Returns result
  - Inngest serializes result, stores in event log
  - Lambda #2 returns HTTP 206 "partial"
  - Inngest makes a third HTTP call

POST /api/inngest (Vercel lambda #3 — ANOTHER fresh heap, DIFFERENT from #2)
  - Function body runs from top AGAIN
  - const collector = new ObservabilityCollector(...) ← BRAND NEW instance (empty)
  - collector.recordEvent('session_lifecycle', 'turn_started', ...) ← fires
  - step.run('media-gate') returns cached ← no callback
  - collector.recordEvent('media_gate', 'gate_decision', ...) ← fires
  - collector.recordEvent('classifier', 'rule-based media routing', ...) ← fires
  - collector.recordEvent('media_gate', 'passthrough', ...) ← fires
  - step.run('process-message') returns cached result ← callback NOT re-run
    → The queries/aiCalls captured in lambda #2's collector ARE LOST FOREVER
    → Lambda #2's collector was garbage collected when lambda #2's response was sent
  - collector.recordEvent('mode_transition', ...) ← fires
  - collector.recordEvent('block_composition', ...) ← fires
  - collector.recordEvent('session_lifecycle', 'turn_completed', ...) ← fires
  - Reaches step.run('observability-flush')
  - Executes collector.flush() — flushes lambda #3's collector to DB
  - But lambda #3's collector only has the 7 closure-based events
  - No queries, no ai_calls
  - Returns
```

**The smoking gun**: lambda #3's collector (the one that gets flushed) has no access to lambda #2's collector state. Each lambda has its own JS heap. Nothing in Inngest's model propagates the collector across iterations except the serialized `step.run` return value.

---

## The Fix (design)

### Core idea
Encode observability data INSIDE the `step.run` output so Inngest serializes it, caches it, and makes it available in subsequent iterations. The outer handler merges the data from the step output into its own collector before calling flush.

### Changes required

**1. `src/inngest/functions/agent-production.ts` — `whatsappAgentProcessor`**

Replace the current `process-message` step.run:

```typescript
// BEFORE (attempt 1, commit 479fe18):
const result = await step.run('process-message', async () => {
  const { processMessageWithAgent } = await import('@/lib/agents/production/webhook-processor')
  const invokePipeline = () => processMessageWithAgent({...})
  return collector
    ? runWithCollector(collector, invokePipeline)
    : invokePipeline()
})
```

With:

```typescript
// AFTER (the real fix):
const stepResult = await step.run('process-message', async () => {
  const { processMessageWithAgent } = await import('@/lib/agents/production/webhook-processor')

  // Create a LOCAL collector for this step. It will be discarded when the
  // lambda ends, but its accumulated data is returned below and will be
  // serialized by Inngest as part of the step output.
  const stepCollector = collector
    ? new ObservabilityCollector({
        conversationId,
        workspaceId,
        agentId: await resolveAgentIdForWorkspace(workspaceId),
        turnStartedAt: new Date(),
        triggerMessageId: messageId,
        triggerKind: 'user_message',
      })
    : null

  const engineResult = stepCollector
    ? await runWithCollector(stepCollector, () => processMessageWithAgent({...}))
    : await processMessageWithAgent({...})

  // Encode observability capture in the step output so it survives
  // Inngest's memoization boundary. Kept under __obs to avoid polluting
  // the SomnioEngineResult type visible to callers.
  return {
    engineResult,
    __obs: stepCollector ? {
      events: stepCollector.events,
      queries: stepCollector.queries,
      aiCalls: stepCollector.aiCalls,
    } : null,
  }
})

const result = stepResult.engineResult

// Merge the step's captured observability into the outer collector so it
// survives to the final flush iteration. On subsequent Inngest iterations
// (replays), this block runs using the CACHED stepResult, which includes
// __obs. The outer collector is fresh in each iteration but always gets
// the same __obs merged back in, so the flush iteration has complete data.
if (collector && stepResult.__obs) {
  for (const e of stepResult.__obs.events) {
    // Preserve original sequence/recordedAt, but deduplicate against any
    // events we might already have in the outer collector (from previous
    // iterations' closure recordEvent calls). Since outer-handler events
    // are appended BEFORE and AFTER the step.run, the sequence numbers
    // from stepCollector fall in the middle.
    collector.events.push(e)
  }
  for (const q of stepResult.__obs.queries) collector.queries.push(q)
  for (const a of stepResult.__obs.aiCalls) collector.aiCalls.push(a)
}
```

Key consideration: **sequence numbers**. The outer `collector.sequence` counter is used by closure-based recordEvent calls. The stepCollector has its own sequence counter starting at 0. When merging, there will be sequence collisions (e.g., outer sequence 0-3 are turn_started + media_gate + classifier + passthrough; stepCollector sequence 0+ are all the pipeline events).

**Resolution options:**
- A) Let outer sequences be consecutive (0, 1, 2, 3, then step events re-numbered 4, 5, ...), then mode_transition/block_composition continue (N+1, N+2). Post-merge, re-number everything based on recordedAt timestamp. Simplest.
- B) Pre-allocate a sequence range for the step (e.g., start stepCollector at sequence 100 to avoid collision). Ugly.
- C) Use `recordedAt` timestamps as the true ordering key (already stored, the UI can sort by that). Accept sequence collisions as a known quirk. Easiest code-wise.

**Recommended: option C.** The UI already sorts by sequence in `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx` line ~75. Change it to sort by `(recordedAt, sequence)` as a tiebreaker. This keeps merge logic trivial.

Actually even simpler: after merging, re-sort all three arrays by recordedAt and re-assign sequence numbers monotonically. That's ~10 lines of code and guarantees clean ordering.

**2. `src/lib/agents/production/webhook-processor.ts`**

Revert the diagnostic probes (commits 83c4321, 2e924ec) — they're no-ops anyway since ALS was broken, and they clutter the code. Remove the `getCollector` import if no other use.

Specifically remove:
```typescript
// Remove these lines (added by probe commits):
import { getCollector } from '@/lib/observability'  // only used by probe
// ... and the probe block at lines ~79-92
```

**3. `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx`**

If using option C (sort by recordedAt), update the merge logic to sort by recordedAt as primary key. If using the re-sort approach, no UI change needed.

### Type changes

`src/lib/observability/collector.ts` already exposes `events`, `queries`, `aiCalls` as public arrays. They are mutable. The merge pushes into them directly. No type changes needed.

The step.run return type changes from `SomnioEngineResult` to `{engineResult: SomnioEngineResult, __obs: {...} | null}`. The outer code extracts `engineResult` and uses it as before. No downstream changes.

### Size impact of step outputs

Each step output now carries:
- `events`: up to ~30 items per turn (category + label + payload object)
- `queries`: up to ~20 items per turn (tableName, operation, filters, body, duration)
- `aiCalls`: up to ~4 items per turn (model, purpose, messages array, response content, tokens)

Typical payload: ~20-50 KB per step output. Inngest step outputs are stored in the event log. Inngest default max is ~4 MB per step, so we're well within limits. No chunking needed.

---

## Verification Plan

After the fix:

1. **Build check**: `npx tsc --noEmit` clean. `pnpm run build` if WSL Google Fonts isn't out (known issue).

2. **Deploy**: push to main. Vercel auto-deploy (or manual redeploy if the flaky GitHub→Vercel integration needs a nudge).

3. **Live test**: send 1 message to each bot (Somnio V3, GoDentist, Recompra) from a conversation where the agent is enabled (`workspace_agent_config.agent_enabled = true` and `conversations.agent_conversational` is null or true; also no WPP/P/W/RECO tag on contact).

4. **Expected DB state** after 3 real turns:
   ```sql
   SELECT agent_id, event_count, query_count, ai_call_count, total_tokens, total_cost_usd
   FROM agent_observability_turns
   WHERE started_at > now() - interval '5 minutes'
   ORDER BY started_at DESC;
   ```
   - `event_count`: 10-30 (7 closure events + step pipeline events)
   - `query_count`: 5-20 (session load, history, contact, tags, etc.)
   - `ai_call_count`: 1-4 (at least comprehension, possibly classifier + minifrase + paraphraser)
   - `total_tokens`: > 0
   - `total_cost_usd`: > 0

5. **UI check**: open the inbox, select one of the test conversations, click the Bug icon in the chat header. The panel should show the new turn. Click it → timeline should show queries, AI calls expandable with full prompt + messages + response.

6. **Anti-recursion**: verify the flush itself is not captured:
   ```sql
   SELECT count(*)
   FROM agent_observability_queries
   WHERE table_name LIKE 'agent_observability_%'
      OR table_name = 'agent_prompt_versions';
   ```
   Expected: 0. (flush uses `createRawAdminClient` which bypasses the fetch wrapper.)

---

## Context You'll Need

### Known-good state of the 5 contacts for phone `+573137549286`

From earlier queries, 4 duplicate contacts exist for the same phone. All have tags removed except one that still has "CAB" (not a skip tag). Safe for testing.

### Workspaces with broken agent config (unrelated, flagged during diagnosis)

Workspace `36a74890-aad6-4804-838c-57904b1c9328` has `workspace_agent_config.agent_enabled = null` (possibly missing row). All conversations in this workspace fall through `isAgentEnabledForConversation` returning false. **Not a bug of Phase 42.1** — these conversations legitimately don't run the agent. They still produce 7-event pass-through turns in the observability tables, which is correct.

Test with a conversation in a workspace where agent_enabled = true (e.g., `f0241182-f79b-4bc6-b0ed-b5f6eb20c514` for godentist or `a3843b3f-c337-4836-92b5-89c58bb98490` for somnio-sales-v3).

### Separate bug to file (not blocking)

`resolveAgentIdForWorkspace` in `agent-production.ts` defaults to `'somnio-v2'` when the workspace config mapping fails. This means turns from unknown/misconfigured workspaces are labeled `somnio-v2` in the observability table even if the real agent is different. The user noticed this. It's a classification bug, not a capture bug. Fix in a follow-up by making the fallback return an 'unknown' value or by logging a warning when the mapping doesn't match.

### Files to consult in the fix

- `src/inngest/functions/agent-production.ts` (main change)
- `src/lib/agents/production/webhook-processor.ts` (revert probes)
- `src/lib/observability/collector.ts` (confirm public fields)
- `src/lib/observability/flush.ts` (confirm it uses events/queries/aiCalls directly)
- `src/app/(dashboard)/whatsapp/components/debug-panel-production/turn-detail.tsx` (sort key)

### Planning artifacts

- `.planning/phases/42.1-observabilidad-bots-produccion/42.1-CONTEXT.md` (original scope)
- `.planning/phases/42.1-observabilidad-bots-produccion/42.1-RESEARCH.md` (patterns, pitfalls; does NOT document this particular Inngest replay issue)
- `.planning/phases/42.1-observabilidad-bots-produccion/42.1-05-SUMMARY.md` (Plan 05 — agent-production.ts wiring, with documented deviation that deeper pipeline events were deferred)
- `.planning/phases/42.1-observabilidad-bots-produccion/42.1-11-SUMMARY.md` (Plan 11 partial — activation in progress)
- `.planning/phases/42.1-observabilidad-bots-produccion/activation-runbook.md`

### Git state

Latest commits (all on main, all deployed):
```
2e924ec debug(42.1): log ALS collector state at webhook-processor entry [REVERT]
83c4321 debug(42.1): add ALS propagation probe in webhook-processor entry [REVERT]
479fe18 fix(42.1-05): re-wrap runWithCollector inside step.run for ALS propagation [KEEP — harmless]
1e1830d fix(42.1-01): trigger_message_id must be TEXT not UUID [KEEP]
d947fb5 fix(42.1-01): grant service_role privileges on observability tables [KEEP]
b93bf90 fix(42.1-09): reuse MORFX_OWNER_USER_ID for super-user gate [KEEP]
```

The new commit should revert only the probe commits (83c4321, 2e924ec) and apply the merge fix.

---

## Success criteria for the fix session

- [ ] Turns table shows query_count > 0 and ai_call_count > 0 for a real user message
- [ ] Debug panel renders a complete timeline with queries and AI calls
- [ ] System prompt / messages / response visible when expanding an AI call row
- [ ] No regression on agent behavior (bot keeps responding normally)
- [ ] No recursion (flush not captured as queries)
- [ ] Build clean, tsc clean, no new TypeScript errors
