# Phase 42.1 — Activation Runbook

**Goal:** Activate the production bot observability system end-to-end without regressing the production agents.
**Owner:** Jose (super-user)
**Estimated time:** ~90 minutes (10 min deploy + 5 min flag toggle + 1h monitoring window).
**Rollback time:** < 2 minutes (single env var flip + redeploy).

---

## Pre-activacion (ya completado)

- [x] Migration schema applied in production (Plan 01 checkpoint).
- [x] Code instrumented behind feature flag `OBSERVABILITY_ENABLED` (Plans 02-08).
- [x] Production debug panel UI shipped behind super-user gate (Plans 09-10).
- [x] Smoke Test 1 (AsyncLocalStorage) PASS (Plan 11 Task 1, see `smoke-tests.md`).
- [x] Anthropic prices verified against `https://www.anthropic.com/pricing` (`src/lib/observability/pricing.ts`, dated 2026-04-07).
- [x] Code pushed to `main` with flag OFF.

---

## Paso 1: Deploy del codigo con flag OFF

The deploy itself is a no-op for the running agents — `OBSERVABILITY_ENABLED` is not set, so `isObservabilityEnabled()` returns `false`, every collector creation short-circuits to `null`, and `getCollector()` always returns `null`. The fetch wrappers, the domain instrumentation, and the AI call wrapper all hit the no-op fast path. **Net effect: zero behavior change.**

1. Confirm `OBSERVABILITY_ENABLED` is NOT present in Vercel env vars (Production scope):
   - Vercel Dashboard -> morfx -> Settings -> Environment Variables
   - Filter `OBSERVABILITY_ENABLED`. Result should be empty or "(not set)".
2. Wait for the Vercel deploy from `main` to finish (Plan 11 Task 2 push: `49bd386` + `0621c7f` and any subsequent commits). Build status must be green.
3. Smoke check post-deploy (flag OFF):
   - Send 1 real test message to **Somnio V3** through WhatsApp.
   - Confirm the bot responds normally and within the usual latency budget.
   - In Supabase SQL editor:
     ```sql
     SELECT count(*) FROM agent_observability_turns;
     ```
     Expected: **0** (no rows — the flag is OFF and nothing should be captured).
4. Monitor `p50`/`p95` of the agent in Vercel logs / agent latency for ~10 minutes. The numbers must be statistically indistinguishable from the previous baseline (since the flag is OFF the only theoretical overhead is one boolean check per call site).
5. Confirm here: **"deploy ok, flag OFF verified"**

---

## Paso 2: Activar el flag `OBSERVABILITY_ENABLED=true` en Vercel

**PREREQUISITE — `SUPER_USER_EMAIL` env var:**

Plan 09 introduced the `SUPER_USER_EMAIL` environment variable for the production debug panel access control. The server action `getTurnsByConversationAction` calls `assertSuperUser()` which compares the authenticated user's email against this env var; if the env var is unset or does not match, the call throws `FORBIDDEN` even for Jose. **Set this BEFORE flipping the flag, otherwise the panel will show the disabled state for Jose too.**

1. Vercel Dashboard -> morfx -> Settings -> Environment Variables.
2. Add (Production scope only):
   - Key: `SUPER_USER_EMAIL`
   - Value: `<jose's actual email used to log into morfx, e.g. jose@morfx.app>`
3. Add (Production scope only):
   - Key: `OBSERVABILITY_ENABLED`
   - Value: `true`
4. Click "Save". Vercel will warn that env var changes do not propagate until next deploy.
5. Trigger a manual redeploy of `main`:
   - Vercel Dashboard -> Deployments -> latest production deployment -> "..." -> "Redeploy" -> uncheck "Use existing build cache".
6. Wait 2-3 minutes for the redeploy to finish AND for Inngest to roll forward to the new function versions. (Inngest functions hot-swap on next invocation, so the first turn after the deploy will run the new code.)
7. Confirm here: **"flag activado y redeploy live"**

---

## Paso 3: Verificacion post-activacion

This step is where Smoke Tests 2 and 3 (deferred from `smoke-tests.md`) actually execute.

### 3.1 — Send 1 test message per bot

Send one test message through WhatsApp to each of the three bots:

| Bot | How to test |
|-----|-------------|
| Somnio V3 | Send a normal greeting / product question to a Somnio V3 number |
| GoDentist | Send "agendar cita" to a GoDentist number |
| Somnio Recompra | Trigger a recompra flow (or send a message to a Recompra-active conversation) |

After each, confirm the bot responds normally.

### 3.2 — Open the production debug panel

1. Open the morfx app in browser, log in as Jose (super-user).
2. Open WhatsApp inbox.
3. Open the conversation that just received the test message.
4. Look for the **Bug** icon in the chat header. (It only renders for super-users — that's the smoke test for `SUPER_USER_EMAIL` working.)
5. Click the Bug icon -> the production debug panel opens on the right (Allotment split pane).
6. Confirm the master pane shows the new turn (15s polling) with non-zero counters in the row (events / queries / ai_calls).
7. Click the row -> the detail pane fetches `getTurnDetailAction(turnId, startedAt)` and renders:
   - Header: agentId, triggerKind, duration, total tokens, total cost, counts, mode transition (if any).
   - Timeline: events, queries, AI calls interleaved by sequence.
   - Expand a query row -> table_name, operation, status, rowCount, durationMs, columns, filters, requestBody.
   - Expand an AI call row -> model, purpose, token breakdown, cost, latency, **system prompt** (collapsible), messages, response.
8. Repeat for each of the 3 bots.

### 3.3 — Anti-recursion check (Smoke Test 2)

In Supabase SQL editor:

```sql
SELECT count(*)
FROM agent_observability_queries
WHERE table_name LIKE 'agent_observability_%'
   OR table_name = 'agent_prompt_versions';
```

**Expected: 0.**

If `count > 0`, the collector is capturing its own writes -> recursion bug. Immediately:
1. Set `OBSERVABILITY_ENABLED=false` and redeploy (rollback).
2. `DELETE FROM agent_observability_queries WHERE table_name LIKE 'agent_observability_%' OR table_name = 'agent_prompt_versions';`
3. Report back with the offending rows for debugging.

### 3.4 — Sandbox Debug Panel regression (Smoke Test 3)

1. Open `/sandbox` in the deployed environment.
2. Run any agent turn through the sandbox UI.
3. Open the existing sandbox debug panel (the one shipped in v4.0 standalone).
4. Confirm: timeline, events, queries, AI calls all render IDENTICALLY to the pre-42.1 baseline.
5. There should be ZERO functional or visual differences. (Sandbox uses a completely separate code path — no shared components with the new production debug panel.)

If you spot ANY regression, rollback the flag and report which component looks wrong. The sandbox path is independent of the flag, so rollback will not fix it — the rollback is to give us breathing room while we revert the offending Plan 09/10 commits.

### 3.5 — Latency monitoring window (1 hour)

For 1 full hour after activation:

- **Agent p50 latency:** must be `<= baseline + 20ms`. The flush happens AFTER the agent has already returned its response, so the only overhead in the hot path is collector pushes (synchronous, in-memory, microseconds).
- **Flush p95:** search Vercel logs for `"observability flush complete"` (pino log emitted by `src/lib/observability/flush.ts`). The reported `durationMs` field should have a P95 `<= 200ms`. Higher means we should look at batch sizes or partition write hotspots.
- **No new error categories** in Vercel logs related to `observability/*` modules.
- **Bot response correctness** subjectively unchanged across the test conversations.

If anything drifts during the hour, execute the rollback (Section: Rollback instantaneo).

### 3.6 — Volume sanity check

After the hour, in Supabase:

```sql
SELECT
  agent_id,
  count(*)             AS turns,
  avg(events_count)    AS avg_events,
  avg(queries_count)   AS avg_queries,
  avg(ai_calls_count)  AS avg_ai_calls,
  avg(total_cost_usd)  AS avg_cost_usd,
  avg(duration_ms)     AS avg_duration_ms
FROM agent_observability_turns
WHERE started_at > now() - interval '1 hour'
GROUP BY agent_id;
```

Expected ballpark from `42.1-RESEARCH.md` (rough): per turn, ~10-30 events, ~5-20 queries, ~1-4 AI calls. Cost per turn is dominated by Sonnet 4.5 paraphrase calls.

---

## Rollback instantaneo

Triggered if ANY of the following:
- Anti-recursion check fails (Smoke Test 2).
- Sandbox regression detected (Smoke Test 3).
- p50 latency regresses by more than 20ms.
- Flush p95 exceeds 200ms.
- New error spam in Vercel logs for `observability/*`.
- Any bot regresses in correctness.

**Procedure:**
1. Vercel Dashboard -> Settings -> Environment Variables.
2. Either:
   - Set `OBSERVABILITY_ENABLED=false`, OR
   - Delete the `OBSERVABILITY_ENABLED` key entirely (cleaner — same effect since `isObservabilityEnabled()` returns `false` when unset).
3. Save -> Trigger redeploy of `main`.
4. Wait 2-3 minutes for Inngest functions to pick up the new env.
5. New Inngest invocations will hit the no-op fast path immediately: `isObservabilityEnabled()` returns `false` -> `runWithCollector` is never called -> `getCollector()` returns `null` everywhere -> wrappers all skip.
6. **Data already written stays in the partitions** — it will be purged by the daily 30-day retention cron (Plan 08). If you need to wipe it sooner: `TRUNCATE agent_observability_turns CASCADE` (cascades to events, queries, ai_calls partitions). Prompt versions can be purged with `DELETE FROM agent_prompt_versions WHERE first_seen_at > '<rollback time>'` — though there is no harm in keeping them.
7. Confirm rollback by re-running:
   ```sql
   SELECT count(*) FROM agent_observability_turns WHERE started_at > now() - interval '5 minutes';
   ```
   Expected: 0 (no new captures after rollback).

---

## Criterios de exito de la activacion

To declare Phase 42.1 ACTIVE in production, ALL of these must be true:

- [ ] Vercel deploy succeeded with flag OFF (Paso 1.2).
- [ ] Flag-OFF baseline check returned 0 rows in `agent_observability_turns` (Paso 1.3).
- [ ] `SUPER_USER_EMAIL` set in Vercel Production env (Paso 2.2).
- [ ] `OBSERVABILITY_ENABLED=true` set in Vercel Production env (Paso 2.3).
- [ ] Redeploy succeeded (Paso 2.5).
- [ ] All 3 bots responded normally to test messages (Paso 3.1).
- [ ] Production debug panel renders for Jose with master + detail panes for all 3 bots (Paso 3.2).
- [ ] Anti-recursion query returns 0 (Paso 3.3 / Smoke Test 2).
- [ ] Sandbox debug panel intact (Paso 3.4 / Smoke Test 3).
- [ ] 1-hour latency window passed without regression (Paso 3.5).
- [ ] Volume sanity check matches research expectations (Paso 3.6).

When all checks pass, report: **"sistema activo en produccion"** plus the metrics from Paso 3.5 and Paso 3.6.

If any check fails and rollback was executed, report: **"rollback ejecutado: <razon>"** plus details for diagnosis.

---

## Post-activacion (Task 4 of Plan 11 — handled by continuation agent)

After you confirm activation, a fresh Claude agent will:
1. Update `docs/analysis/04-estado-actual-plataforma.md` with a new section "Sistema de Observabilidad de Bots (Phase 42.1)" marked ACTIVE with the activation date.
2. Create `LEARNINGS.md` for Phase 42.1 with bugs found, decisions validated, real-vs-estimated metrics, and pitfalls hit.
3. Final Phase 42.1 commit + push.

You do not need to do anything for Task 4 — just give the resume signal to the orchestrator.
