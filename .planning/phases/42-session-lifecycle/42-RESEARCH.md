# Phase 42: Session Lifecycle — Research

**Researched:** 2026-04-06
**Domain:** Inngest scheduled functions + Postgres partial unique index + codebase audit of agent session handlers
**Confidence:** HIGH (codebase-grounded)
**Scope:** Prescriptive research for fixing production bug — sessions never close in runtime

---

## Summary

Phase 42 is a bug-fix phase in an existing system, not a greenfield build. Research focused almost entirely on codebase audit rather than library discovery. All decisions from `42-CONTEXT.md` are validated as compatible with the current morfx stack: Inngest v3.51.0 supports cron triggers with inline `TZ=` prefix (exact syntax verified against Inngest docs), morfx already has one production cron precedent (`task-overdue-cron`), and Postgres partial unique indexes enforce concurrent-insert safety via the standard unique-index wait-and-recheck mechanism (verified against Postgres source docs).

The audit surfaced **6 Inngest handlers** that need the defensive session-status check, **9 distinct queries** against `agent_sessions` (only 3 of which matter for this phase), and **1 pre-existing bug** (`agent-production.ts:154` filtering by non-existent column `is_active`) that was already documented in CONTEXT.md as out-of-scope. The `closeSession()` wrapper in the codebase has exactly **zero runtime callers** — confirmed exhaustive grep. The schema (`supabase/migrations/20260205000000_agent_sessions.sql`) has not been modified by any later migration, so the constraint name for the DROP is the Postgres default: `agent_sessions_conversation_id_agent_id_key`.

**Primary recommendation:** Follow the `task-overdue-cron` precedent exactly for the new `close-stale-sessions` cron. Add the defensive check as a small shared helper in `src/lib/agents/session-manager.ts` (reusing the existing `SessionManager` class + `createAdminClient` — do NOT build a new domain module in fase 1 since the existing `session-manager.ts` already bypasses `src/lib/domain/` and is the de facto domain-layer-equivalent for agent sessions). Insert the defensive check at the top of each identified handler's main `step.run` or right after the settle sleep, before any work that depends on the session being active.

---

## Standard Stack

### Core (already installed — no new packages)

| Library | Version (from package.json) | Purpose | Why Standard |
|---|---|---|---|
| `inngest` | `^3.51.0` | Scheduled + event-driven functions | Already the orchestration layer for all async work in morfx |
| `@supabase/supabase-js` | `^2.93.1` | DB access via `createAdminClient()` | Already the canonical DB client — bypasses RLS, used by every cron / handler |
| `pino` (via `@/lib/audit/logger`) | `^10.3.0` | Structured logging | Already used by every Inngest function in morfx |

### Supporting

| Module | Purpose | Use For |
|---|---|---|
| `@/lib/supabase/admin` → `createAdminClient` | Admin supabase client | Cron DB access + defensive-check reads |
| `@/lib/audit/logger` → `createModuleLogger` | Pino scoped logger | Cron observability + defensive-check info logs |
| `@/lib/agents/session-manager` → `SessionManager` | Existing session CRUD | Reuse `getSession()` if convenient; **do not** add new helpers in fase 1 unless minimal |

### Alternatives Considered (and rejected)

| Instead of | Could Use | Why rejected |
|---|---|---|
| Inngest cron | Vercel Cron / Supabase `pg_cron` | morfx already has `task-overdue-cron` as precedent; zero new infra |
| New `src/lib/domain/agent-sessions.ts` | Reuse `SessionManager` | `SessionManager` already uses `createAdminClient()` and is the de facto mutation layer for `agent_sessions`. Adding a domain module is speculative scope creep in fase 1. See Open Question #1 |
| Cancel-by-reference of timers when cron fires | Defensive check at handler entry | Inngest lacks trivial cancel-by-reference; defensive check is simpler and 100% correct as fallback |
| `timezone` config option on cron | Inline `TZ=` prefix in cron string | Inngest v3 SDK only supports inline `TZ=` prefix; verified against Inngest official docs |

**Installation:** None. Zero new dependencies.

---

## Architecture Patterns

### Directory Layout (all paths exist)

```
src/
├── inngest/
│   ├── client.ts                      # inngest client (import from here)
│   ├── functions/
│   │   ├── task-overdue-cron.ts       # ← CANONICAL CRON PRECEDENT
│   │   ├── agent-timers.ts            # V1 timers (5 functions)
│   │   ├── agent-timers-v3.ts         # V3 timer (1 function)
│   │   ├── agent-production.ts        # Webhook processor (contains is_active bug)
│   │   └── close-stale-sessions.ts    # ← NEW FILE for Phase 42
│   └── events.ts                      # Event type definitions
├── app/api/inngest/route.ts           # ← MUST ADD import + spread in functions array
├── lib/
│   ├── agents/session-manager.ts      # Session CRUD (do NOT move to domain in fase 1)
│   ├── supabase/admin.ts              # createAdminClient
│   └── audit/logger.ts                # createModuleLogger
└── supabase/migrations/
    └── 20260410000000_session_lifecycle_partial_unique.sql   # ← NEW
```

### Pattern 1: Inngest Cron Scheduled Function (morfx canonical form)

**What:** Scheduled function that runs on a cron schedule, uses `step.run()` for DB work, returns metrics for logs.

**Source:** `src/inngest/functions/task-overdue-cron.ts:30-122` (the only existing cron in morfx)

```typescript
// src/inngest/functions/task-overdue-cron.ts — LITERAL precedent
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'

export const taskOverdueCron = inngest.createFunction(
  {
    id: 'task-overdue-cron',
    retries: 1,
  },
  { cron: '*/15 * * * *' },        // ← cron trigger object, NOT { schedule: }
  async ({ step }) => {
    const overdueTasks = await step.run('find-overdue-tasks', async () => {
      const supabase = createAdminClient()
      const { data, error } = await supabase
        .from('tasks')
        .select('...')
        .lt('due_date', new Date().toISOString())
        .limit(200)
      if (error) { console.error(...); return [] }
      return data || []
    })

    if (overdueTasks.length === 0) return { overdue: 0, emitted: 0 }
    // ... work ...
    console.log(`[task-overdue-cron] Found ${overdueTasks.length} ... emitted ${emitted}`)
    return { overdue: overdueTasks.length, emitted }
  }
)
```

**Registration (mandatory step):** `src/app/api/inngest/route.ts:22,56`

```typescript
import { taskOverdueCron } from '@/inngest/functions/task-overdue-cron'
// ...
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...agentTimerFunctions,
    // ...
    taskOverdueCron,                                    // ← added as bare identifier
  ],
})
```

**Phase 42 application:** Plan MUST add `import { closeStaleSessionsCron } from '@/inngest/functions/close-stale-sessions'` to `src/app/api/inngest/route.ts` and include it in the `functions` array. Missing this step = cron is dead code.

### Pattern 2: Timezone in Cron String (Inngest-specific)

**What:** Inngest cron triggers accept a timezone inline as a `TZ=` prefix within the cron string.

**Source:** Inngest official docs — `https://www.inngest.com/docs/guides/scheduled-functions`

**Verbatim from docs:**
> `triggers: { cron: "TZ=Europe/Paris 0 12 * * 5" }`

**Phase 42 application:**

```typescript
{ cron: 'TZ=America/Bogota 0 2 * * *' }   // Daily 02:00 America/Bogota
```

No separate `timezone` option exists. The TZ MUST be embedded in the cron string.

### Pattern 3: Inngest Handler with Defensive Session Check (NEW pattern for Phase 42)

**What:** At the top of each Inngest handler that operates on `sessionId`, verify the session is still `active`. Abort silently if not.

**Where:** Inside the primary `step.run(...)` of each handler (not before `step.waitForEvent`, because aborting before the wait would break concurrency semantics). Goes **after** the `settle` sleep and **after** the `waitForEvent` returns timeout, **before** any downstream work (send message, create order, update state).

**Canonical snippet:**

```typescript
// Import at top of file — already available via createAdminClient
const { data: sessionRow } = await supabase
  .from('agent_sessions')
  .select('status')
  .eq('id', sessionId)
  .single()

if (!sessionRow || sessionRow.status !== 'active') {
  logger.info(
    { sessionId, status: sessionRow?.status ?? 'not_found' },
    'Handler aborted: session no longer active'
  )
  return { status: 'aborted', reason: 'session_not_active' }
}
```

**Key rule:** the defensive check is a read-only query on `agent_sessions`, NOT a mutation. It can be inlined with `createAdminClient()` directly. No domain-layer involvement needed (read is not a mutation, Regla 3 does not apply).

### Anti-Patterns to Avoid

- **Putting the defensive check before `step.sleep('settle', '5s')` or `step.waitForEvent(...)`** — that would read the session status before the customer has a chance to cancel the timer, wasting a DB roundtrip on every timer fire. Put it inside the timeout-branch `step.run('...')` instead.
- **Doing the status check AFTER sending a message or creating an order** — defeats the purpose.
- **Using `.maybeSingle()` instead of `.single()`** for a query by primary key — `.single()` errors cleanly if the session was deleted, which is the correct behavior (log and abort).
- **Calling `SessionManager.getSession()` for the defensive check** — that method fetches state + turns + joins, expensive. For the check we only need `status`, so do a direct one-column select.
- **Registering the cron function in any file other than `src/app/api/inngest/route.ts`** — that is the only `serve()` entry point.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Cron scheduling | `setInterval` in a server handler | Inngest cron trigger | Vercel is serverless; setInterval dies. Inngest is the only cron mechanism |
| Distributed uniqueness of "one active session per conv/agent" | App-level lock, `SELECT ... FOR UPDATE`, advisory lock | Postgres partial unique index | Postgres index enforces atomically at write-time (see Pitfall #1) |
| Timezone conversion for cron firing time | JS date math, manual TZ offset | Inngest `TZ=` cron prefix | Inngest handles DST and TZ changes for you |
| Cancelling Inngest timers when sessions close | Emit cancellation events, track timer IDs | Defensive status check at handler entry | Inngest lacks cancel-by-reference; defensive check is O(1) extra DB read and 100% correct |
| "Last activity" tracking | Track in memory / custom shadow table | Existing `agent_sessions.last_activity_at` column | Already exists and is updated by `updateSessionWithVersion({lastActivityAt})` |
| Domain layer for agent_sessions | New `src/lib/domain/agent-sessions.ts` | Existing `SessionManager` class | SessionManager already is the de facto domain layer — uses admin client, filters workspace, encapsulates mutations. Adding a parallel domain module in fase 1 is speculative |

**Key insight:** This is a bug-fix phase. Every new abstraction is a risk. Reuse existing patterns (`task-overdue-cron`, `SessionManager`) instead of introducing new ones.

---

## Common Pitfalls

### Pitfall 1: Partial unique index under concurrent INSERT

**What goes wrong:** Two webhook instances process two messages for the same contact near-simultaneously. Both try to INSERT a new `agent_sessions` row with `status='active'`. Without proper index semantics, both could succeed and violate the invariant.

**Why it happens:** People assume partial indexes have weaker guarantees than regular unique indexes. They don't.

**How to avoid:** Trust the Postgres engine. Partial unique indexes use the **same** concurrent-insert serialization as regular unique indexes. Verified against Postgres source docs at `https://www.postgresql.org/docs/current/index-unique-checks.html`:

> "If a conflicting row has been inserted by an as-yet-uncommitted transaction, the would-be inserter must **wait to see if that transaction commits**. If it rolls back then there is no conflict. If it commits without deleting the conflicting row again, there is a uniqueness violation."

So the pattern is: TX A inserts row → TX B's INSERT blocks waiting on A → A commits → B sees violation and errors with 23505. Application code must catch 23505, re-query for the now-active session, and reuse it. **This retry logic should be added to `SessionManager.createSession` as part of Phase 42** — see Open Question #2.

**Warning sign:** 23505 errors in production logs after deploy (from the new race window). Phase 1 tolerates rare occurrences; retry logic makes it disappear.

### Pitfall 2: Constraint name mismatch on DROP

**What goes wrong:** Plan writes `DROP CONSTRAINT agent_sessions_unique_conversation_agent` or similar guess; migration fails because the Postgres default name is different.

**Why it happens:** Postgres auto-generates constraint names when you write `UNIQUE(col1, col2)` inline. The name format is `<table>_<col1>_<col2>_key`.

**How to avoid:** The original migration (`supabase/migrations/20260205000000_agent_sessions.sql:33`) uses **inline column UNIQUE**:

```sql
UNIQUE(conversation_id, agent_id)
```

Postgres will have auto-named it: **`agent_sessions_conversation_id_agent_id_key`**. Use this exact name in the DROP. Verify with the diagnostic query below before applying.

**Diagnostic query to confirm name (user runs in prod BEFORE migration):**
```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'agent_sessions'::regclass AND contype = 'u';
```

### Pitfall 3: Inngest cron doesn't register until `route.ts` imports it

**What goes wrong:** Plan creates `close-stale-sessions.ts` with a properly-formed `inngest.createFunction`, but forgets to import + spread it in `src/app/api/inngest/route.ts`. The function silently never runs.

**How to avoid:** Every Inngest function in morfx is registered in `src/app/api/inngest/route.ts:46-58`. The plan MUST include an explicit task "add import and register cron in route.ts". Verify after deploy via Inngest dashboard (function should appear in list).

### Pitfall 4: Concurrency guard of V3 timer doesn't protect against old firings

**What goes wrong:** `agent-timers-v3.ts:208` has `concurrency: [{ key: 'event.data.sessionId', limit: 1 }]`. One might think this prevents stale firings. It does NOT — concurrency-1 only prevents two timers for the same session from running simultaneously; it does NOT prevent a single stale timer (against a now-closed session) from running. The defensive check is still required.

**How to avoid:** Apply defensive check regardless of concurrency settings.

### Pitfall 5: `session-manager.ts:211` hard-codes `status='active'` filter

**What goes wrong:** After Phase 42 is deployed, `getSessionByConversation` becomes the correct lookup (filter by active + the partial index ensures at-most-one row). BUT the existing code at line 211 **already** filters by `status='active'`, so that query is **already safe**. The only consequence: when no active session exists (because cron closed the old one), it correctly returns null → `getOrCreateSession` creates a new one. This is the desired behavior.

**How to avoid:** No code change needed in `session-manager.ts:211`. Phase 42 explicitly relies on this existing filter being there.

### Pitfall 6: Metrics queries assume unbounded session counts

**What goes wrong:** `metrics.ts:122-156` queries sessions by `workspace_id` + date range, no `.single()`. Post-Phase-42 will return more rows per `(conversation_id, agent_id)` over time (multiple historical ciclos), inflating "total conversations" metrics.

**How to avoid:** **This is actually the intended behavior in fase 2** — the point of Opcion A is exactly to count each cycle separately. Document in plan that metrics semantics change: "total conversations" now = "total cycles" going forward. No code change in fase 1.

---

## Handler Audit

Exhaustive grep of `src/inngest/functions/` for handlers operating on `sessionId`. All handlers that need the defensive check:

| # | Function | File | Def line | Event trigger | Insert check at |
|---|---|---|---|---|---|
| 1 | `ingestTimer` | `src/inngest/functions/agent-timers.ts` | 261 | `agent/ingest.started` | **Inside `step.run('evaluate-and-execute')` at line 286** — first line of the callback, before `sm.getSession(sessionId)` |
| 2 | `dataCollectionTimer` | `src/inngest/functions/agent-timers.ts` | 327 | `agent/collecting_data.started` | **Inside `step.run('evaluate-and-execute')` at line 362** — first line of callback, before `sm.getSession(sessionId)` |
| 3 | `promosTimer` | `src/inngest/functions/agent-timers.ts` | 401 | `agent/promos.offered` | **Inside `step.run('evaluate-and-execute')` at line 430** — first line of callback, before `sm.getSession(sessionId)` |
| 4 | `resumenTimer` | `src/inngest/functions/agent-timers.ts` | 469 | `agent/resumen.started` | **Inside `step.run('evaluate-and-execute')` at line 498** — first line of callback, before `sm.getSession(sessionId)` |
| 5 | `silenceTimer` | `src/inngest/functions/agent-timers.ts` | 542 | `agent/silence.detected` | **Inside `step.run('send-retake')` at line 572** — after the agent-enabled check (lines 573-584), before reading `session_state` |
| 6 | `v3Timer` | `src/inngest/functions/agent-timers-v3.ts` | 203 | `agent/v3.timer.started` | **Inside `step.run('execute-timer')` at line 245** — AFTER the `conversations.is_agent_enabled` check (lines 249-257), BEFORE line 260 (SessionManager import + getSession). Ideally insert right between the disabled-check return and the SessionManager import |

**Not affected (no session-status dependency):**
- `whatsappAgentProcessor` in `agent-production.ts:39` — processes incoming webhook, does not operate on an existing session id upfront. It either reuses or creates a session via `storage.ts:getOrCreateSession` (protected by the partial unique index + `getSessionByConversation` filter). **No defensive check needed**, but the `is_active` bug at line 154 remains (out-of-scope for Phase 42 per CONTEXT.md §2.5).
- `task-overdue-cron` — no session logic.
- `automationFunctions` — no session logic.
- `robotOrchestratorFunctions` — no session logic.
- `godentistReminderFunctions` — verified via grep: no `sessionId` references.
- `smsDeliveryFunctions` — no session logic.

**Helper pattern (use identical snippet in all 6 handlers):**

```typescript
// Defensive check: abort if session no longer active (Phase 42)
// Reuses the existing supabase client from either the enclosing step or a fresh createAdminClient()
const { data: sessionStatusRow } = await supabase
  .from('agent_sessions')
  .select('status')
  .eq('id', sessionId)
  .single()

if (!sessionStatusRow || sessionStatusRow.status !== 'active') {
  logger.info(
    { sessionId, status: sessionStatusRow?.status ?? 'not_found' },
    'Timer handler aborted: session no longer active'
  )
  return { status: 'aborted' as const, action: 'session_not_active' }
}
```

For handlers 1-4 (`agent-timers.ts` timers using `getSessionManager()`): the `sm.getSession(sessionId)` that follows will need its own supabase client. Either:
- (A) Create a fresh `const supabase = createAdminClient()` at the top of each callback, OR
- (B) Do the check via `sm.getSession(sessionId)` and read `.status` from the returned object (but this is MORE expensive — does the state join).

**Recommendation:** Option A (one-line `createAdminClient()` + 2-line select) — minimal overhead, no refactor of SessionManager.

---

## Query Audit

Exhaustive grep of `from('agent_sessions')` in `src/`. Analysis of whether each query is safe under the new schema (multiple historical rows per conv/agent, at-most-one active):

| # | File | Line | Operation | Filter | Safe under new schema? | Notes |
|---|---|---|---|---|---|---|
| 1 | `src/lib/agents/session-manager.ts` | 122 | INSERT | — | YES | The INSERT of new sessions. Partial unique index will now enforce at-most-one-active. Requires retry-on-23505 logic — see Open Question #2 |
| 2 | `src/lib/agents/session-manager.ts` | 162 | DELETE | `.eq('id', session.id)` | YES | Rollback path on state insert failure. Targets by PK, not by (conv_id, agent_id) — unaffected |
| 3 | `src/lib/agents/session-manager.ts` | 181 | SELECT | `.eq('id', sessionId).single()` | YES | `getSession()` by PK — always uniquely defined |
| 4 | `src/lib/agents/session-manager.ts` | 207 | SELECT | `.eq('conversation_id', ...).eq('agent_id', ...).eq('status', 'active').maybeSingle()` | **YES** (critical) | `getSessionByConversation()`. **Already filters by `status='active'`** — post-Phase-42 the partial unique index guarantees at-most-one matching row. `.maybeSingle()` returns null when no active session exists, which is the correct trigger for `getOrCreateSession` to create a fresh one |
| 5 | `src/lib/agents/session-manager.ts` | 256 | UPDATE | `.eq('id', sessionId).eq('version', expectedVersion)` | YES | Optimistic lock update by PK — unaffected |
| 6 | `src/inngest/functions/agent-timers-v3.ts` | 391 | UPDATE | `.eq('id', sessionId)` | YES | Updates `current_mode` by PK. **Also needs defensive check added BEFORE this line** (covered in Handler Audit row 6) |
| 7 | `src/inngest/functions/agent-production.ts` | 150 | SELECT | `.eq('conversation_id', ...).eq('workspace_id', ...).eq('is_active', true).single()` | **BROKEN (pre-existing bug)** | References non-existent column `is_active`. Returns error+null silently. Out-of-scope for Phase 42 per CONTEXT.md §2.5 — do NOT touch in fase 1 |
| 8 | `src/lib/agents/production/metrics.ts` | 123 | COUNT | `.eq('workspace_id', ...).gte('created_at', ...)` | YES (semantics change) | Count of sessions in date range. Post-Phase-42 count will grow as cycles accumulate — intended behavior. Document for user |
| 9 | `src/lib/agents/production/metrics.ts` | 131 | COUNT | `.eq('workspace_id', ...).eq('status', 'handed_off')` | YES | Handoff counter. Unaffected — `handed_off` semantics unchanged |
| 10 | `src/lib/agents/production/metrics.ts` | 152 | SELECT `id` | `.eq('workspace_id', ...).gte('created_at', ...)` | YES | Used to join with agent_turns for token sum. Returns more rows over time — still correct |

**Conclusion:** Only query #7 is broken (pre-existing, out-of-scope). Query #4 is the **critical** one and is **already correct** because it filters by `status='active'` — Phase 42 relies on this. All other queries are by PK and unaffected.

**No callers assume UNIQUE-per-(conv_id,agent_id)** outside of the insert path (#1). The `.maybeSingle()` on #4 is the only scalar-expecting query on that pair, and it's guarded by `status='active'`.

---

## Diagnostic Queries

User must run these **in production BEFORE deploy** to dimension impact and confirm constraint name. All use `America/Bogota`.

### Q1: Confirm constraint name (before writing migration)

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'agent_sessions'::regclass AND contype = 'u';
```

**Expected output:** `agent_sessions_conversation_id_agent_id_key` (Postgres default). If different, use the actual name in the migration DROP.

### Q2: Count sessions by status (sanity check)

```sql
SELECT status, COUNT(*) AS cnt
FROM agent_sessions
GROUP BY status
ORDER BY cnt DESC;
```

**Expected:** Two rows — `active` (majority) and `handed_off` (minority). `closed` and `paused` should be 0 or absent.

### Q3: Impact of first cron run — how many active sessions are stale

```sql
SELECT
  COUNT(*) FILTER (WHERE last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '24 hours') AS stale_24h,
  COUNT(*) FILTER (WHERE last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '7 days')  AS stale_7d,
  COUNT(*) FILTER (WHERE last_activity_at < timezone('America/Bogota', NOW()) - INTERVAL '30 days') AS stale_30d,
  COUNT(*) FILTER (WHERE last_activity_at < date_trunc('day', timezone('America/Bogota', NOW())))   AS stale_cron_rule,
  COUNT(*) AS total_active
FROM agent_sessions
WHERE status = 'active';
```

**Purpose:** Answers Open Question #1 from CONTEXT.md §9 — is the first cron run going to cascade-close thousands of sessions at once? `stale_cron_rule` is the exact count the first cron run will target.

### Q4: Count of duplicate (conversation_id, agent_id) already existing (should be 0 under current constraint)

```sql
SELECT conversation_id, agent_id, COUNT(*) AS cnt
FROM agent_sessions
GROUP BY conversation_id, agent_id
HAVING COUNT(*) > 1;
```

**Expected:** Zero rows. If ANY rows come back, current `UNIQUE` constraint has been somehow bypassed — investigate before dropping it.

### Q5: Max / min / distribution of last_activity_at among active sessions

```sql
SELECT
  MIN(last_activity_at) AS oldest,
  MAX(last_activity_at) AS newest,
  COUNT(*) AS total
FROM agent_sessions
WHERE status = 'active';
```

**Purpose:** Knowing the oldest `active` timestamp tells you how many months of accumulation the cron will sweep on first run.

### Q6: Conversations blocked by handed_off + unique constraint (the "bot mudo" cases)

```sql
SELECT conversation_id, agent_id, status, last_activity_at
FROM agent_sessions
WHERE status = 'handed_off'
ORDER BY last_activity_at DESC
LIMIT 50;
```

**Purpose:** Sanity check on how many handed-off clients exist. After Phase 42, these conversations can have a fresh `active` row added alongside the existing `handed_off` row (the partial unique index only forbids two actives).

---

## Migration Notes

### The migration file

```sql
-- supabase/migrations/20260410000000_session_lifecycle_partial_unique.sql
-- Phase 42: drop full unique constraint, replace with partial unique index

-- Step 1: drop the original constraint (default name assigned by Postgres)
ALTER TABLE agent_sessions
  DROP CONSTRAINT IF EXISTS agent_sessions_conversation_id_agent_id_key;

-- Step 2: create partial unique index — only actives must be unique per (conv, agent)
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_one_active_per_conv_agent
  ON agent_sessions(conversation_id, agent_id)
  WHERE status = 'active';
```

### Why `IF NOT EXISTS` / `IF EXISTS`

Makes the migration idempotent and safe to re-apply. If the user accidentally runs it twice in prod (Regla 5: user applies manually), the second run is a no-op.

### Why NOT `CONCURRENTLY` on the index

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, but Supabase migrations run in a transaction. The `agent_sessions` table is small (probably <10k rows based on morfx scale), so a non-concurrent index build holds a brief table lock (milliseconds). Q3 above dimensions the row count — if it exceeds ~100k, **revisit this** and split into two migrations, second being a raw-SQL `CREATE INDEX CONCURRENTLY` run manually outside the migration.

### Deploy sequence (Regla 5 compliance)

1. Plan PAUSES here → user applies migration in prod via Supabase SQL editor
2. User runs Q1 + Q3 + Q4 diagnostic queries, confirms results
3. User explicitly confirms migration applied
4. Only THEN push code (cron + defensive checks) to main

### Rollback plan

If the migration causes issues:
```sql
DROP INDEX IF EXISTS agent_sessions_one_active_per_conv_agent;
ALTER TABLE agent_sessions
  ADD CONSTRAINT agent_sessions_conversation_id_agent_id_key
  UNIQUE (conversation_id, agent_id);
```
Only works if no duplicate active rows have been created in the interim. If yes, they must be reconciled first.

---

## Code Examples

### Example 1: The new `close-stale-sessions` cron (full file)

```typescript
// src/inngest/functions/close-stale-sessions.ts
// Phase 42: Nightly cron at 02:00 America/Bogota — close sessions with
// no activity today. Preserves sessions where the customer was chatting
// past midnight.

import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('close-stale-sessions')

export const closeStaleSessionsCron = inngest.createFunction(
  {
    id: 'close-stale-sessions',
    name: 'Close Stale Agent Sessions',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota 0 2 * * *' },  // Daily 02:00 America/Bogota
  async ({ step }) => {
    const result = await step.run('close-stale', async () => {
      const supabase = createAdminClient()

      // Close sessions that had no activity today (Bogota time)
      const { data, error } = await supabase
        .from('agent_sessions')
        .update({
          status: 'closed',
          updated_at: new Date().toISOString(),
        })
        .eq('status', 'active')
        .lt(
          'last_activity_at',
          // date_trunc equivalent on the app side:
          // midnight-today America/Bogota as ISO string
          // Simpler: rely on DB via a Postgres RPC, OR compute in JS
          new Date(
            new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 10) + 'T00:00:00-05:00'
          ).toISOString()
        )
        .select('id')

      if (error) {
        logger.error({ error }, 'Failed to close stale sessions')
        throw error
      }

      return { closedCount: data?.length ?? 0 }
    })

    logger.info(result, 'Close-stale-sessions cron run complete')
    return result
  }
)
```

**NOTE on the date math:** The midnight-Bogota computation in JS uses the `sv-SE` locale trick (already used elsewhere in morfx per MEMORY.md). For cleaner code, the plan may prefer to implement this as a Supabase RPC function:

```sql
-- supabase/migrations/20260410000001_close_stale_sessions_rpc.sql
CREATE OR REPLACE FUNCTION close_stale_agent_sessions()
RETURNS TABLE(closed_count INTEGER) AS $$
  WITH closed AS (
    UPDATE agent_sessions
    SET status = 'closed',
        updated_at = timezone('America/Bogota', NOW())
    WHERE status = 'active'
      AND last_activity_at < date_trunc('day', timezone('America/Bogota', NOW()))
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER FROM closed;
$$ LANGUAGE SQL;
```

Then the cron becomes:
```typescript
const { data } = await supabase.rpc('close_stale_agent_sessions')
const closedCount = data?.[0]?.closed_count ?? 0
```

**Recommendation:** Use the RPC approach. Keeps the timezone math in SQL (where `date_trunc + timezone` is native and correct), avoids JS DST pitfalls. Plan should create the RPC as a second migration file in the same deploy pause.

### Example 2: Defensive check integrated into `v3Timer`

**File:** `src/inngest/functions/agent-timers-v3.ts`, inside `step.run('execute-timer')` starting at line 245. Insert AFTER the `is_agent_enabled` check (line 254-257) and BEFORE line 260 (`SessionManager` import).

```typescript
// ... existing lines 245-257 (is_agent_enabled check) ...

      // Phase 42: Defensive check — abort if session no longer active
      const { data: sessionStatusRow } = await supabase
        .from('agent_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()

      if (!sessionStatusRow || sessionStatusRow.status !== 'active') {
        logger.info(
          { sessionId, level, status: sessionStatusRow?.status ?? 'not_found' },
          'V3 timer aborted: session no longer active'
        )
        return { status: 'skipped' as const, action: 'session_not_active' }
      }

      // b. Read session via SessionManager
      const { SessionManager } = await import('@/lib/agents/session-manager')
      // ... existing line 260+ ...
```

### Example 3: Defensive check in `dataCollectionTimer`

**File:** `src/inngest/functions/agent-timers.ts`, inside `step.run('evaluate-and-execute')` starting at line 362. The callback currently reads `sm.getSession(sessionId)` on line 364. Insert defensive check BEFORE that.

```typescript
    const result = await step.run('evaluate-and-execute', async () => {
      // Phase 42: Defensive check
      const supabase = createAdminClient()
      const { data: sessionStatusRow } = await supabase
        .from('agent_sessions')
        .select('status')
        .eq('id', sessionId)
        .single()

      if (!sessionStatusRow || sessionStatusRow.status !== 'active') {
        logger.info(
          { sessionId, status: sessionStatusRow?.status ?? 'not_found' },
          'Data collection timer aborted: session no longer active'
        )
        return { status: 'aborted', action: 'session_not_active' }
      }

      const sm = getSessionManager()
      const session = await sm.getSession(sessionId)
      // ... existing code ...
```

Apply the identical pattern to `ingestTimer`, `promosTimer`, `resumenTimer`, `silenceTimer`.

### Example 4: Registration in `route.ts`

```typescript
// src/app/api/inngest/route.ts — ADD these two lines
import { closeStaleSessionsCron } from '@/inngest/functions/close-stale-sessions'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...agentTimerFunctions,
    ...agentProductionFunctions,
    ...automationFunctions,
    ...robotOrchestratorFunctions,
    ...godentistReminderFunctions,
    ...v3TimerFunctions,
    ...smsDeliveryFunctions,
    taskOverdueCron,
    closeStaleSessionsCron,         // ← Phase 42
  ],
})
```

---

## State of the Art

| Old Approach (pre-Phase 42) | New Approach (Phase 42) | When Changed | Impact |
|---|---|---|---|
| `UNIQUE(conversation_id, agent_id)` — 1 row forever per pair | Partial unique index on `WHERE status='active'` — N rows allowed, max 1 active | 2026-04 (this phase) | Enables historical cycles + prevents 23505 on recurring customers |
| Sessions never closed in runtime | Nightly cron + defensive handler check | 2026-04 | Recurring customers get fresh sessions automatically |
| `SomnioEngine` class used directly | `UnifiedEngine` via `webhook-processor.ts` | Phase 16.1 (already done) | `somnio-engine.ts:455` `handoffSession` caller is reachable only via `/api/agents/somnio` route, which has no internal callers — effectively dead code |

**Deprecated / dead code (do NOT touch in Phase 42):**
- `closeSession()` wrapper in `session-manager.ts:287` and `engine.ts:493` — zero runtime callers, keep as public API for future use
- `/api/agents/somnio/route.ts` → instantiates `SomnioEngine` V1 — still exists but not invoked by any webhook path (webhook → `agent-production.ts` → `webhook-processor.ts` → `UnifiedEngine`). Plan MAY choose to delete this route as cleanup, but it is **out of scope** for Phase 42
- `status='paused'` — never written anywhere, keep in CHECK constraint for now

---

## Open Questions

### 1. First cron run scope (CONTEXT.md §9 Q1)

**What we know:** The cron rule (`last_activity_at < date_trunc('day', Bogota-now)`) will close every active session with activity before today. Since sessions have never been closed, this could be hundreds or thousands.

**What's unclear:** Exact count until user runs Q3 diagnostic query in prod.

**Recommendation:** Plan should include a **conditional task**: after running Q3, if `stale_cron_rule > 1000`, do a manual one-off run with a tighter filter (`last_activity_at < NOW() - INTERVAL '30 days'`) via Supabase SQL editor BEFORE enabling the cron. Then the first automated cron run closes only a small incremental set.

### 2. Retry-on-23505 in `createSession` (derived from Pitfall #1)

**What we know:** Two near-simultaneous webhook handlers might both call `createSession` for the same `(conv, agent)` pair. Postgres serializes them, one wins, the other gets 23505. Without retry logic, the losing request throws to the user.

**What's unclear:** How often this actually happens in morfx today (concurrency-1 per conversationId in `whatsappAgentProcessor` largely prevents it, but edge cases exist — e.g. silence timer firing concurrently with a webhook).

**Recommendation:** Plan should add **retry-on-23505** to `SessionManager.createSession` as a defensive measure:
```typescript
try {
  // ... existing INSERT ...
} catch (err) {
  if (isUniqueViolation(err)) {
    // Another request just created an active session — read it and return
    const existing = await this.getSessionByConversation(conversationId, agentId)
    if (existing) return existing
  }
  throw err
}
```
This makes the partial unique index transparent to callers.

### 3. Domain layer for agent_sessions (Regla 3 question)

**What we know:** Regla 3 says all mutations via `src/lib/domain/`. Current reality: `session-manager.ts` uses `createAdminClient()` and writes to `agent_sessions` directly, bypassing `/domain/`. This has been the pattern since Phase 13 and has not been flagged as a violation.

**What's unclear:** Should Phase 42 create `src/lib/domain/agent-sessions.ts` and move `SessionManager` mutations there?

**Recommendation:** **NO, not in Phase 42.** Rationale:
- Phase 42 is a bug-fix phase with surgical scope
- Moving SessionManager is a refactor that touches ~20 files and deserves its own phase
- `SessionManager` is already in `src/lib/agents/` which is a domain boundary; it uses admin client + workspace filter (matches domain layer conventions)
- The cron's `UPDATE` can inline `createAdminClient()` safely — it's not a user-facing mutation, it's system maintenance
- Document in LEARNINGS.md as technical debt: "migrate SessionManager to /domain/ in a future refactor phase"

### 4. Somnio V1 engine handlers — defensive check needed?

**What we know:** `somnio/somnio-engine.ts:455` calls `handoffSession`. The V1 engine is instantiated only by `/api/agents/somnio/route.ts`. That route has **no internal callers** in the morfx codebase (grep confirmed). The webhook path uses `UnifiedEngine` exclusively.

**What's unclear:** Is the `/api/agents/somnio` route hit by any external system (manual curl, external webhook, legacy integration)?

**Recommendation:** Plan should add a **one-line task** to confirm with the user that the route receives zero traffic (check Vercel logs for `/api/agents/somnio` hits in last 30 days). If zero: no defensive check needed in V1, mark for deletion in future cleanup. If non-zero: add defensive check or route it through V3 path.

### 5. Constraint name verification

**What we know:** Postgres default naming convention gives `agent_sessions_conversation_id_agent_id_key`. The migration uses `DROP CONSTRAINT IF EXISTS` with that name.

**What's unclear:** If Supabase or a previous migration renamed the constraint.

**Recommendation:** Q1 diagnostic query (see above) resolves this definitively before applying. If different name, edit the migration before applying — do NOT skip the DROP.

---

## Sources

### Primary (HIGH confidence)

- **Inngest official docs** — `https://www.inngest.com/docs/guides/scheduled-functions` — verified `cron: 'TZ=...'` syntax
- **Postgres official docs** — `https://www.postgresql.org/docs/current/index-unique-checks.html` — verified concurrent-insert serialization behavior for unique indexes (applies to partial unique indexes)
- **Postgres official docs** — `https://www.postgresql.org/docs/current/indexes-partial.html` — confirmed partial unique indexes enforce uniqueness within the predicate subset
- **Morfx codebase (canonical)** — all file:line references in this doc are from direct reads:
  - `src/inngest/functions/task-overdue-cron.ts` (canonical cron precedent)
  - `src/inngest/functions/agent-timers.ts` (5 V1 timer handlers)
  - `src/inngest/functions/agent-timers-v3.ts` (v3Timer handler)
  - `src/inngest/functions/agent-production.ts` (webhook processor + is_active bug)
  - `src/lib/agents/session-manager.ts` (full class)
  - `src/lib/agents/engine-adapters/production/storage.ts` (getOrCreateSession)
  - `src/lib/agents/production/metrics.ts` (metrics queries)
  - `src/lib/agents/token-budget.ts` (agent_turns queries)
  - `src/app/api/inngest/route.ts` (registration pattern)
  - `supabase/migrations/20260205000000_agent_sessions.sql` (original schema)
  - `package.json` (inngest ^3.51.0 confirmed)
- **Morfx CONTEXT.md** — `.planning/phases/42-session-lifecycle/42-CONTEXT.md` — authoritative decisions and diagnostic background

### Secondary (MEDIUM confidence)

- None — all claims sourced from primary codebase or official docs.

### Tertiary (LOW confidence)

- None.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — package.json + codebase precedent read directly
- Architecture patterns: HIGH — `task-overdue-cron` is the single canonical precedent, read in full
- Handler audit: HIGH — exhaustive grep of `src/inngest/functions/` for `sessionId` references, each handler verified at source
- Query audit: HIGH — exhaustive grep of `from('agent_sessions')`, all 10 matches inspected
- Inngest cron TZ syntax: HIGH — Inngest official docs verbatim
- Postgres partial unique index concurrency: HIGH — Postgres official docs verbatim
- Migration constraint name: MEDIUM — Postgres default convention, BUT Q1 diagnostic will verify before apply
- Somnio V1 dead-code assumption: MEDIUM — no internal callers found via grep, but external traffic to `/api/agents/somnio` not verified (Open Question #4)

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (30 days — stable domain, unlikely changes)

**Quality gate checklist:**
- [x] Section 8 of 42-CONTEXT.md all 6 deliverables addressed
- [x] Additional deliverables 7-11 addressed (7: V1 callers; 8: partial index concurrency; 9: V1 Somnio reachability; 10: domain layer decision; 11: route.ts registration)
- [x] Every handler audit row has file:line for where the check goes (6 rows, all specific)
- [x] Inngest cron syntax verified against SDK version in package.json (3.51.0 → TZ= prefix)
- [x] Partial unique index concurrency confirmed with Postgres docs
- [x] Confidence levels assigned honestly per section
- [x] Section names match plan-phase expectations (Standard Stack, Architecture Patterns, Don't Hand-Roll, Common Pitfalls, Code Examples, Handler Audit, Query Audit, Diagnostic Queries, Migration Notes)
