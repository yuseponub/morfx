# Phase 42.1 — Pre-Activation Smoke Tests

**Date:** 2026-04-07
**Plan:** 42.1-11 (activation)
**Executor:** Claude (automated) + user (production checkpoint)

## Summary

| # | Test | Scope | Status | Notes |
|---|------|-------|--------|-------|
| 1 | AsyncLocalStorage propagation in Next 16 / Node | Local (tsx) | PASS | 7/7 sub-checks pass |
| 2 | Anti-recursion (collector does NOT capture observability writes) | Production | DEFERRED to Task 3 checkpoint | requires live schema + flag ON; user validates during activation |
| 3 | Sandbox Debug Panel — no regression | Manual UI | DEFERRED to Task 3 checkpoint | requires running dev server + visual review by user |

**Blocking?** No. Test 1 (the only test that can be automated locally without a deployed schema) passed cleanly. Tests 2 and 3 are gated to the production checkpoint by design — see rationale below.

---

## Test 1 — AsyncLocalStorage propagation (PASS)

**Goal:** Confirm that `runWithCollector(collector, fn)` makes the collector available via `getCollector()` everywhere inside `fn`'s async subtree, including across event loop hops, and that `getCollector()` returns `null` outside the run.

**Why it matters:** ALS is the foundation of the entire observability module. If ALS broke under Next 16 / Node 20+, the fetch wrapper, the domain layer instrumentation, and the AI call wrapper would all silently no-op (or worse, leak across turns).

**Method:**
1. Created throwaway script `scripts/smoke/als-smoke-test.ts` (deleted post-run).
2. Imported `runWithCollector`, `getCollector`, `ObservabilityCollector` from the public barrel `src/lib/observability/index.ts`.
3. Instantiated a collector with smoke values (`agentId: 'somnio-v3'`, `triggerKind: 'system_event'`).
4. Inside `runWithCollector`, executed 6 sub-checks; outside, executed 1 sub-check.
5. Ran with `npx tsx scripts/smoke/als-smoke-test.ts`.

**Sub-checks:**

| # | Sub-check | Result |
|---|-----------|--------|
| 1 | `getCollector()` immediately inside `runWithCollector` | PASS |
| 2 | After `await Promise.resolve()` (microtask) | PASS |
| 3 | After `await setTimeout(10)` (macrotask hop) | PASS |
| 4 | Inside a nested helper async fn called from inside the run | PASS |
| 5 | Inside `Promise.all` branch A (with internal setTimeout) | PASS |
| 6 | Inside `Promise.all` branch B (with internal setTimeout) | PASS |
| 7 | Outside the run, `getCollector()` returns `null` | PASS |

**Output:**
```
[PASS] immediate getCollector
[PASS] after Promise.resolve()
[PASS] after setTimeout(10)
[PASS] nested helper async fn
[PASS] Promise.all branch A
[PASS] Promise.all branch B
[PASS] outside run -> null

ALS smoke test: PASS
```

**Cleanup:** `scripts/smoke/als-smoke-test.ts` and the `scripts/smoke/` directory were deleted after the run, as required by the plan.

**Caveat — Vercel Node runtime:** The automated test runs under local Node (tsx). Vercel serverless Node functions use the same `node:async_hooks` ALS implementation, and 42.1-RESEARCH.md (Pattern 1) already documented that Inngest handlers run in plain Node serverless (not Edge) where ALS is supported. The activation runbook nevertheless includes a final ALS check post-deploy: "send 1 message → confirm `agent_observability_turns` row appears with non-empty `events`/`queries`/`ai_calls`". If ALS were broken in Vercel Node, those child counters would be zero — that single integration check would catch it.

---

## Test 2 — Anti-recursion (DEFERRED to Task 3 checkpoint)

**Goal:** Confirm that the observability collector does NOT capture its own writes (Pitfall 1 from 42.1-RESEARCH.md). Specifically, `agent_observability_queries` MUST NOT contain rows whose `table_name` matches `agent_observability_*` or `agent_prompt_versions`.

**Why deferred:** This test requires:
1. The 42.1 schema applied (only present in production — we do not maintain a local Supabase mirror with this migration).
2. The flag `OBSERVABILITY_ENABLED=true`.
3. A live turn that exercises the entire flush path.

The defensive design that prevents recursion is `createRawAdminClient()` (used by the repository, the flush function, and the prompt-version helpers — all instrumented call sites that read/write observability tables), which is intentionally NOT wrapped by the fetch instrumentation. This was set up in Plans 02 and 07 and re-validated in Plan 09. The test below VALIDATES the design end-to-end against a real production turn.

**Test plan (executed by user during Task 3 checkpoint, runbook Step 3):**

After activating the flag and sending the first test message:

```sql
-- Expected: 0 rows
SELECT count(*)
FROM agent_observability_queries
WHERE table_name LIKE 'agent_observability_%'
   OR table_name = 'agent_prompt_versions';
```

**Pass criterion:** `count = 0`.

**Fallback / cleanup if recursion is detected:**
1. Set `OBSERVABILITY_ENABLED=false` immediately (rollback step from runbook).
2. Manually purge the offending rows: `DELETE FROM agent_observability_queries WHERE table_name LIKE 'agent_observability_%' OR table_name = 'agent_prompt_versions'`.
3. File a P0 ticket and re-investigate which call site is going through the instrumented client instead of the raw admin client.

---

## Test 3 — Sandbox Debug Panel regression (DEFERRED to Task 3 checkpoint)

**Goal:** Confirm that the production observability work (Plans 02-10) did NOT regress the existing `/sandbox` debug panel that was shipped earlier in v4.0 (Debug Panel v4.0 standalone).

**Why deferred:** Cannot be automated from this agent — requires:
- Running `pnpm dev` on a workstation.
- Visiting `/sandbox`.
- Triggering a turn through the sandbox UI.
- Visually comparing the debug panel against memory / a screenshot of the prior baseline.

**Why low risk:** The sandbox debug panel and the production debug panel use **completely separate** components and data sources:
- Sandbox: uses the existing v4.0 debug capture pipeline that lives in the sandbox UnifiedEngine adapter; no shared code with `src/lib/observability/`.
- Production: new components under `src/components/whatsapp/debug-panel-production/` (Plans 09-10), wired via a NEW server action `getTurnsByConversationAction`, reading from NEW tables `agent_observability_*`.

The only shared touch point is `src/components/whatsapp/inbox-layout.tsx` where the production debug panel was added behind a super-user gate. The change uses a CONDITIONAL JSX branch (Plan 09 SUMMARY explicitly notes the byte-identical path for non-super-users — `<ChatView flex-1 />` is unchanged when `debugPanelOpen && isSuperUser` is false). Sandbox does not use `inbox-layout.tsx`.

**Test plan (executed by user during Task 3 checkpoint, runbook Step 3):**

1. Open `/sandbox` in the deployed environment (or local dev).
2. Run a turn against any agent.
3. Open the existing debug panel.
4. Confirm: timeline renders, events render, AI calls render — IDENTICAL to behavior before Phase 42.1.

**Pass criterion:** No visual or functional differences from baseline.

**Fail action:** Rollback the flag (irrelevant — sandbox is independent of the flag, so rollback would not help). Instead, file a P0 and revert the component changes from Plans 09-10.

---

## Conclusion

Test 1 passed automatically. Tests 2 and 3 are gated to the production checkpoint by their nature — both require live conditions (production schema + flag ON, or visual UI inspection) that this autonomous executor cannot reach. The activation runbook (`activation-runbook.md`) folds both deferred tests into Step 3 of the user-driven verification.

**Go / no-go for activation:** GO — proceed to Task 2 (runbook + push) and then Task 3 (user checkpoint).
