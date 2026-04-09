---
phase: quick-039
plan: 039
type: execute
wave: 1
depends_on: []
files_modified:
  - src/inngest/functions/agent-production.ts
  - src/lib/agents/production/webhook-processor.ts
  - src/lib/observability/collector.ts
autonomous: true

must_haves:
  truths:
    - "A real user message into Somnio V3 / GoDentist / Recompra produces an agent_observability_turns row with query_count > 0 and ai_call_count > 0"
    - "The debug panel timeline renders queries and AI calls in recordedAt order with no sequence collisions"
    - "Bot keeps responding normally — no regression in agent behavior"
    - "Flush itself is not captured (no rows for agent_observability_* tables in agent_observability_queries)"
    - "tsc --noEmit is clean"
  artifacts:
    - path: "src/inngest/functions/agent-production.ts"
      provides: "process-message step returns {engineResult, __obs} and outer handler merges __obs into the outer collector before flush"
      contains: "__obs"
    - path: "src/lib/agents/production/webhook-processor.ts"
      provides: "clean pipeline entry without probe logging / getCollector import"
    - path: "src/lib/observability/collector.ts"
      provides: "public merge helper (or exposed sequenceCounter) so external code can push pre-recorded events/queries/aiCalls and re-normalize sequence numbers"
  key_links:
    - from: "src/inngest/functions/agent-production.ts step.run('process-message')"
      to: "outer collector (post-step merge block)"
      via: "__obs payload serialized by Inngest and replayed in the flush iteration"
      pattern: "__obs"
    - from: "agent-production.ts post-turn block"
      to: "collector.flush()"
      via: "merged events+queries+aiCalls with monotonic sequence by recordedAt"
      pattern: "recordedAt"
---

<objective>
Fix Phase 42.1 activation bug: Inngest replay-based memoization discards the in-memory ObservabilityCollector used inside `step.run` callbacks, so queries (0) and AI calls (0) never reach the final flush iteration. Only closure-based events from the outer handler survive.

The fix encodes observability data in the `step.run('process-message')` return value so Inngest serializes and caches it. The outer handler then merges the cached `__obs` payload into its fresh-per-iteration collector before calling flush.

Purpose: Unblock Phase 42.1 activation. Without this, the entire production observability system is useless — it captures exactly 7 events and nothing else per turn, regardless of bot.

Output: Turns table populated with query_count > 0 and ai_call_count > 0; debug panel renders full timelines with expandable AI calls.

Root cause (confirmed): Each Inngest iteration is a separate Vercel lambda with its own JS heap. The step.run callback runs ONCE (in lambda #2) and records into lambda #2's collector. Lambda #3 (the flush iteration) constructs a brand-new empty collector and returns the cached step result without re-running the callback, so lambda #2's queries/aiCalls are garbage collected forever. The ONLY state that crosses the lambda boundary is the serialized step.run return value.
</objective>

<execution_context>
@/home/jose147/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/42.1-observabilidad-bots-produccion/BUG-INNGEST-ALS-FIX-CONTEXT.md
@src/inngest/functions/agent-production.ts
@src/lib/agents/production/webhook-processor.ts
@src/lib/observability/collector.ts
@src/lib/observability/flush.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expose collector merge helper and revert probes</name>
  <files>
    src/lib/observability/collector.ts
    src/lib/agents/production/webhook-processor.ts
  </files>
  <action>
**1. `src/lib/observability/collector.ts`**

Add a public method `mergeFrom(other)` that absorbs another collector's captured arrays and re-normalizes sequence numbers by `recordedAt` ascending (stable fallback to original sequence for ties). Implementation:

```typescript
/**
 * Merge another collector's captured data into this one. Used to work
 * around Inngest's lambda-boundary memoization: a step.run callback creates
 * a local collector, returns its raw arrays in the step output, and the
 * outer handler (running in a later replay lambda with a fresh collector)
 * merges them here before flush.
 *
 * After merging, all three arrays are re-sorted by recordedAt and assigned
 * monotonic sequence numbers so the UI timeline renders cleanly.
 */
mergeFrom(other: {
  events: ObservabilityEvent[]
  queries: ObservabilityQuery[]
  aiCalls: ObservabilityAiCall[]
}): void {
  for (const e of other.events) this.events.push(e)
  for (const q of other.queries) this.queries.push(q)
  for (const a of other.aiCalls) this.aiCalls.push(a)

  // Re-normalize sequence by recordedAt across all three arrays combined,
  // so the timeline is monotonic. Stable within the same millisecond by
  // falling back to original sequence.
  type Anchored = { recordedAt: Date; sequence: number; bucket: 'e'|'q'|'a'; idx: number }
  const anchors: Anchored[] = []
  this.events.forEach((e, idx) => anchors.push({ recordedAt: e.recordedAt, sequence: e.sequence, bucket: 'e', idx }))
  this.queries.forEach((q, idx) => anchors.push({ recordedAt: q.recordedAt, sequence: q.sequence, bucket: 'q', idx }))
  this.aiCalls.forEach((a, idx) => anchors.push({ recordedAt: a.recordedAt, sequence: a.sequence, bucket: 'a', idx }))

  anchors.sort((x, y) => {
    const dt = x.recordedAt.getTime() - y.recordedAt.getTime()
    if (dt !== 0) return dt
    return x.sequence - y.sequence
  })

  let seq = 0
  for (const anchor of anchors) {
    const target =
      anchor.bucket === 'e' ? this.events[anchor.idx] :
      anchor.bucket === 'q' ? this.queries[anchor.idx] :
      this.aiCalls[anchor.idx]
    target.sequence = seq++
  }
  // Keep the internal counter ahead of anything we might still append later
  // in the same iteration (e.g. turn_completed event fired after the merge).
  this.sequenceCounter = seq
}
```

Notes:
- `sequenceCounter` is currently `private`. Keep it private; `mergeFrom` is a method on the same class so it has access.
- `events`, `queries`, `aiCalls` are declared `readonly` but that only prevents reassignment of the field, not push — existing code already pushes into them. Keep as-is.
- Do NOT change the recordEvent / recordQuery / recordAiCall signatures. Do NOT touch flush.ts.

**2. `src/lib/agents/production/webhook-processor.ts`**

Revert the probe commits (83c4321, 2e924ec):
- Remove the `import { getCollector } from '@/lib/observability'` line (line ~23) UNLESS another symbol in the file still uses it — grep first to confirm it is only used by the probe.
- Remove the probe block inside `processMessageWithAgent` around lines ~74-95 (the `const probeCollector = getCollector()` + `logger.info('[42.1 PROBE]' ...)` + `probeCollector?.recordEvent('tool_call', 'webhook_processor_entry', ...)` block). Keep any code that existed before the probes were added.

Do NOT revert commit 479fe18 (`runWithCollector` re-wrap) here — that lives in agent-production.ts and gets replaced in Task 2.
  </action>
  <verify>
- `npx tsc --noEmit` clean for both files.
- `grep -n "42.1 PROBE" src/lib/agents/production/webhook-processor.ts` returns nothing.
- `grep -n "getCollector" src/lib/agents/production/webhook-processor.ts` returns nothing (if it was only used by the probe).
- `grep -n "mergeFrom" src/lib/observability/collector.ts` shows the new method defined.
  </verify>
  <done>
Probes removed from webhook-processor.ts. `ObservabilityCollector.mergeFrom({events, queries, aiCalls})` exists, pushes all three arrays into the receiver, re-sorts by recordedAt with sequence tiebreaker, and re-assigns monotonic sequence numbers. `tsc --noEmit` clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Encode __obs in process-message step output and merge in outer handler</name>
  <files>
    src/inngest/functions/agent-production.ts
  </files>
  <action>
Replace the current `step.run('process-message', ...)` block in `whatsappAgentProcessor` (around line 294) with the __obs-encoding pattern from BUG-INNGEST-ALS-FIX-CONTEXT.md.

**Changes:**

1. **Imports at top of file**: ensure `ObservabilityCollector` is imported from `@/lib/observability/collector` (or the barrel) alongside the existing `runWithCollector` import. Add it if not already present.

2. **Replace the step.run block**. Current shape (do not literally match whitespace — find it by the `await step.run('process-message', async () => {` marker):

```typescript
const result = await step.run('process-message', async () => {
  const { processMessageWithAgent } = await import('@/lib/agents/production/webhook-processor')
  const invokePipeline = () => processMessageWithAgent({ ... })
  // Phase 42.1 fix: re-wrap with runWithCollector INSIDE step.run.
  return collector
    ? runWithCollector(collector, invokePipeline)
    : invokePipeline()
})
```

Replace with:

```typescript
const stepResult = await step.run('process-message', async () => {
  const { processMessageWithAgent } = await import('@/lib/agents/production/webhook-processor')

  // Inngest replay boundary: a step.run callback runs in ONE lambda only.
  // Any in-memory state mutated inside the callback is garbage collected
  // when that lambda returns. Later replay iterations get the cached step
  // output but never re-execute the callback, so a collector captured here
  // via ALS would be invisible to the flush iteration.
  //
  // Fix: create a LOCAL collector scoped to this step, run the pipeline
  // under it, and return its captured arrays as part of the step output so
  // Inngest serializes + caches them. The outer handler merges the cached
  // __obs into its own (per-iteration fresh) collector before flush.
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

  const invokePipeline = () => processMessageWithAgent({
    conversationId,
    contactId,
    messageContent: gateResult.text,
    workspaceId,
    phone,
    messageTimestamp,
  })

  const engineResult = stepCollector
    ? await runWithCollector(stepCollector, invokePipeline)
    : await invokePipeline()

  return {
    engineResult,
    __obs: stepCollector
      ? {
          events: stepCollector.events,
          queries: stepCollector.queries,
          aiCalls: stepCollector.aiCalls,
        }
      : null,
  }
})

const result = stepResult.engineResult

// Merge the step-captured observability into the outer collector so it
// survives to the flush iteration. This runs on every Inngest replay
// using the CACHED stepResult, so even though `collector` is a brand-new
// instance in each iteration, it ends up with the same merged data every
// time.
if (collector && stepResult.__obs) {
  collector.mergeFrom(stepResult.__obs)
}
```

3. **Sanity checks** (read and confirm before editing):
   - `collector` is the outer handler's ObservabilityCollector, created earlier in `whatsappAgentProcessor` outside of step.run. Confirm its construction site exposes `conversationId`, `workspaceId`, `agentId`, `turnStartedAt`, `triggerMessageId`, `triggerKind` as public (or at least readable) fields. If any are private, read them from the surrounding closure variables instead of `collector.X`.
   - Do NOT move `collector` construction inside the step — it must stay in the outer handler so closure-based `collector?.recordEvent(...)` calls for `turn_started`, `media_gate`, `classifier`, `passthrough`, `mode_transition`, `block_composition`, `turn_completed` keep working.
   - Do NOT change the closure-based `recordEvent` calls anywhere else in the function.
   - Leave `step.run('observability-flush', ...)` (or equivalent flush call) untouched. It already flushes `collector`, which after the merge contains everything.

4. **Type safety**: the step output type changes from `SomnioEngineResult` to `{ engineResult: SomnioEngineResult; __obs: {...} | null }`. The local variable `result` still holds `SomnioEngineResult` after the `stepResult.engineResult` assignment, so downstream code is untouched. Confirm `tsc --noEmit` is clean.

5. **Payload size**: each step output now carries up to ~30 events + ~20 queries + ~4 AI calls. Typical 20-50 KB, well under Inngest's 4 MB step limit. No chunking needed.
  </action>
  <verify>
- `npx tsc --noEmit` clean.
- `grep -n "__obs" src/inngest/functions/agent-production.ts` shows both the production site (inside step.run return) and the consumption site (collector.mergeFrom).
- `grep -n "new ObservabilityCollector" src/inngest/functions/agent-production.ts` shows the outer collector AND the stepCollector (two call sites).
- `grep -n "collector?.recordEvent" src/inngest/functions/agent-production.ts` still shows the 6 closure-based calls (turn_started, gate_decision, classifier, passthrough, mode_transition, block_composition, turn_completed) — the fix must not have deleted them.
- Agent behavior unchanged: run the app locally (or at least start `pnpm dev`) and confirm no runtime errors importing agent-production.ts.
  </verify>
  <done>
`step.run('process-message')` returns `{ engineResult, __obs }`. The outer handler extracts `result = stepResult.engineResult` and (when collector is active) calls `collector.mergeFrom(stepResult.__obs)` before the flush step. `tsc --noEmit` clean. All existing closure-based recordEvent calls preserved.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Deploy to Vercel and verify capture in production</name>
  <what-built>
Inngest step-boundary observability fix: `process-message` step now returns its captured events/queries/aiCalls inside `__obs`, and the outer handler merges them into the per-iteration collector before flushing. Probe diagnostics reverted from webhook-processor.ts.
  </what-built>
  <how-to-verify>
**Pre-deploy (Claude runs these before the checkpoint):**

1. `git status` — confirm only the 3 files are modified: `src/inngest/functions/agent-production.ts`, `src/lib/agents/production/webhook-processor.ts`, `src/lib/observability/collector.ts`.
2. `git add src/inngest/functions/agent-production.ts src/lib/agents/production/webhook-processor.ts src/lib/observability/collector.ts`
3. Commit with message:
   ```
   fix(42.1): merge step-local observability into outer collector across Inngest replays

   Root cause: each Inngest iteration is a separate Vercel lambda with its
   own JS heap. step.run callbacks only execute in ONE iteration; later
   iterations return the cached result without re-running the callback, so
   any collector mutated inside the callback is garbage collected and
   invisible to the flush iteration.

   Fix: create a local collector inside step.run, encode its arrays in the
   step output under __obs, and merge that payload into the outer
   (per-iteration fresh) collector before flush. This produces the same
   final state on every replay because step outputs are deterministic.

   Revert probe commits 83c4321, 2e924ec (they were no-ops anyway).
   Keep 479fe18 conceptually — the runWithCollector call now wraps the
   stepCollector instead of the outer one.
   ```
4. `git push origin main`

**Post-deploy verification (USER runs these after Vercel deploy completes):**

1. Wait for Vercel production deploy on `morfx` project to finish (~2-3 min).
2. Send **one real text message** to each of these bots from a conversation where the agent is enabled:
   - Somnio V3 (workspace `a3843b3f-c337-4836-92b5-89c58bb98490`)
   - GoDentist (workspace `f0241182-f79b-4bc6-b0ed-b5f6eb20c514`)
   - Somnio Recompra (if accessible)
3. Wait ~10s for Inngest to finish each turn.
4. Run this SQL in Supabase production:
   ```sql
   SELECT agent_id, event_count, query_count, ai_call_count, total_tokens, total_cost_usd, started_at
   FROM agent_observability_turns
   WHERE started_at > now() - interval '10 minutes'
   ORDER BY started_at DESC;
   ```
5. **Expected**: each row has `query_count >= 5`, `ai_call_count >= 1`, `total_tokens > 0`, `total_cost_usd > 0`, `event_count >= 10`.
6. Anti-recursion check:
   ```sql
   SELECT count(*) FROM agent_observability_queries
   WHERE table_name LIKE 'agent_observability_%' OR table_name = 'agent_prompt_versions';
   ```
   Expected: 0.
7. UI check: open inbox → select one of the test conversations → click Bug icon in chat header → new turn should appear → clicking it should show a timeline with query rows and AI call rows (expandable to show prompts + messages + responses).
8. Regression check: the bot should have replied normally to each test message. If any bot is silent or responds incorrectly, STOP and report.
  </how-to-verify>
  <resume-signal>
Reply "approved" if all 3 bots show query_count > 0 and ai_call_count > 0, recursion check returns 0, UI shows full timelines, and bot replies are normal.

Otherwise describe what is broken (which bot, what the DB shows, any errors in Vercel logs or Supabase logs) and Claude will diagnose further.
  </resume-signal>
</task>

</tasks>

<verification>
- `agent_observability_turns.query_count > 0` and `ai_call_count > 0` for each of the 3 bots tested
- Debug panel in `/whatsapp` inbox renders query + AI call rows in the timeline
- AI call rows expand to show system prompt + messages + response
- No rows in `agent_observability_queries` referencing observability tables (no recursion)
- Bot behavior unchanged (still replies, no errors in Vercel logs)
- `npx tsc --noEmit` clean
</verification>

<success_criteria>
- [ ] Task 1 complete: mergeFrom added to collector, probes reverted from webhook-processor
- [ ] Task 2 complete: __obs encoded in step.run return, outer handler merges before flush
- [ ] Task 3 checkpoint passed: real turns in production show query_count > 0 and ai_call_count > 0 across Somnio V3 / GoDentist / Recompra
- [ ] No regression in bot behavior
- [ ] No flush recursion
- [ ] tsc clean
</success_criteria>

<output>
After completion, create `.planning/quick/039-fix-phase-42-1-inngest-als-collector-merge/039-SUMMARY.md` documenting:
- Final code changes (file paths + what changed)
- Git commit SHA
- Production verification results (actual query_count / ai_call_count numbers per bot)
- Any deviation from the plan
- Follow-up items (e.g. the `resolveAgentIdForWorkspace` classification bug mentioned in BUG-INNGEST-ALS-FIX-CONTEXT.md "Separate bug to file" section)
</output>
