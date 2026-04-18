---
phase: 44-crm-bots
plan: 01
subsystem: infra
tags: [supabase, postgres, api-key, middleware, rate-limiter, observability, types]

# Dependency graph
requires:
  - phase: 12-action-dsl-real
    provides: ToolModule union, ToolRateLimiter singleton with sliding window
  - phase: 42-1-agent-observability
    provides: AgentId + TriggerKind unions, runWithCollector, observability collector pipeline
  - phase: "api-key-auth (existing src/lib/auth/api-key.ts)"
    provides: validateApiKey / extractApiKey used by middleware
provides:
  - crm_bot_actions table (schema in supabase/migrations) — ready to be applied to production
  - ToolModule 'crm-bot' variant with DEFAULTS entry (50 calls/60s, configurable via CRM_BOT_RATE_LIMIT_PER_MIN)
  - AgentId 'crm-reader' + 'crm-writer' variants
  - TriggerKind 'api' variant (API-only bots without conversation)
  - /api/v1/crm-bots/* authenticated by middleware via API-key branch (same as /api/v1/tools)
affects:
  - 44-02 (crm-reader scaffolding) — requires AgentId extension
  - 44-03 (crm-writer scaffolding) — requires AgentId extension + ToolModule extension
  - 44-04 (reader tools) — requires crm_bot_actions read path (optional for reader per Open Q5)
  - 44-05 (writer two-step flow) — HARD-BLOCKED on crm_bot_actions table existing in production (Regla 5)
  - 44-06 (Inngest cron for TTL expiration) — HARD-BLOCKED on crm_bot_actions existing
  - 44-07 (reader HTTP route) — requires middleware branch
  - 44-08 (writer propose/confirm endpoints) — HARD-BLOCKED on crm_bot_actions
  - 44-09 (integration tests) — HARD-BLOCKED on crm_bot_actions

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive migration pattern: header preamble + CREATE TABLE + CREATE INDEX, zero ALTER/DROP (matches 20260408000000_observability_schema.sql)"
    - "Type-extension pattern: extend shared union (ToolModule / AgentId / TriggerKind) + all Record<Union> sites updated atomically"
    - "Middleware one-line route extension: add path to existing API-key branch rather than duplicate auth logic"

key-files:
  created:
    - supabase/migrations/20260418201645_crm_bot_actions.sql
  modified:
    - src/lib/tools/types.ts (ToolModule union)
    - src/lib/tools/rate-limiter.ts (DEFAULTS + JSDoc)
    - src/lib/tools/registry.ts (getToolsByModule Record<ToolModule>)
    - src/lib/tools/executor.ts (TIMEOUTS Record<ToolModule>)
    - src/lib/observability/types.ts (AgentId + TriggerKind unions + JSDoc)
    - middleware.ts (line 64 — crm-bots path added to API-key branch)

key-decisions:
  - "Used timestamp 20260418201645 (UTC now) for migration filename — matches 14-digit sort order with prior observability/logistics migrations"
  - "Rate limit bucket for crm-bot is SHARED between reader and writer (single 'crm-bot' key namespace per workspace) — matches RESEARCH Open Question #1 recommendation; runaway loop detection works best with shared quota"
  - "CRM_BOT_RATE_LIMIT_PER_MIN env var defaults to 50 — matches CONTEXT.md decision, tunable in Vercel without redeploy"
  - "Extended registry.ts getToolsByModule() and executor.ts TIMEOUTS to include 'crm-bot' — Rule 3 blocking issue (Record<ToolModule> requires exhaustive keys or TS fails)"
  - "Middleware comment updated to 'api/v1/tools/* and /api/v1/crm-bots/*' — documentation sync with code change"

patterns-established:
  - "Pattern 1: Type union extension requires touching ALL Record<Union, T> call sites in the same commit to keep tsc green"
  - "Pattern 2: Migration file names use UTC timestamp YYYYMMDDHHMMSS with _<feature>.sql suffix"
  - "Pattern 3: Regla 5 enforcement is embedded as a plan-level checkpoint:human-action task, not as a git hook or CI gate"

requirements-completed:
  - "CONTEXT D-01: Dos carpetas separadas crm-reader/crm-writer (preparacion infra compartida)"
  - "CONTEXT D-02: Dos agent_id distintos — extender AgentId union"
  - "CONTEXT D-06: Audit log en tabla nueva crm_bot_actions con status 5-state"
  - "CONTEXT D-09: Two-step propose/confirm (persistencia)"
  - "CONTEXT D-10: Rate limit por workspace — extender ToolModule"
  - "CLAUDE.md Regla 5 (BLOCKING): migracion aplicada en produccion antes de codigo que la usa"

# Metrics
duration: 30min
completed: 2026-04-18
---

# Phase 44 Plan 01: CRM Bots Foundation Summary

**Shared infrastructure for Phase 44 CRM Bots: crm_bot_actions audit table, ToolModule/AgentId/TriggerKind union extensions, 'crm-bot' rate-limit bucket, and middleware coverage for /api/v1/crm-bots/*. Tasks 1-4 committed; Task 5 (apply migration in production) is a blocking human-action checkpoint.**

## Performance

- **Duration:** ~30 min (Tasks 1-4 automated)
- **Started:** 2026-04-18T20:15:00Z (approx — plan execution kickoff)
- **Completed:** 2026-04-18T20:35:06Z (Task 4 commit) — **paused at Task 5 checkpoint**
- **Tasks:** 4 of 5 complete (Task 5 is a checkpoint:human-action gate)
- **Files modified:** 6 (1 created, 5 modified)

## Accomplishments

- Created `supabase/migrations/20260418201645_crm_bot_actions.sql` — the audit + two-step state machine table for CRM Bots (13 columns, 3 indexes, 2 CHECK constraints, FK to workspaces, zero ALTER/DROP).
- Extended `ToolModule` union with `'crm-bot'`; added rate-limiter DEFAULTS entry with `CRM_BOT_RATE_LIMIT_PER_MIN` env var fallback (default 50/min).
- Extended `AgentId` union with `'crm-reader'` + `'crm-writer'`; added `TriggerKind: 'api'` for API-only bots.
- Extended `middleware.ts` line 64 to cover `/api/v1/crm-bots/*` under the same API-key validation branch as `/api/v1/tools/*`.
- TypeScript `tsc --noEmit` reports zero NEW errors — only 4 pre-existing vitest-import errors in somnio tests remain (unrelated to this plan, acceptable per plan's explicit allowance).

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree executor):

1. **Task 1: Create crm_bot_actions migration file** — `4cfad76` (feat)
2. **Task 2: Extend ToolModule union + rate-limiter DEFAULTS** — `3a174fc` (feat)
3. **Task 3: Extend AgentId + TriggerKind in observability types** — `4b1e334` (feat)
4. **Task 4: Extend middleware for /api/v1/crm-bots/*** — `8816023` (feat)
5. **Task 5: Apply crm_bot_actions migration in production** — **CHECKPOINT (not committed — production DB operation)**

## Files Created/Modified

### Created

- `supabase/migrations/20260418201645_crm_bot_actions.sql` — Audit table for CRM Bots with 5-state status machine (`proposed | executed | failed | expired`), FK to `workspaces(id) ON DELETE CASCADE`, 3 indexes (workspace+created DESC, partial on expires_at WHERE proposed, agent+status), `created_at TIMESTAMPTZ DEFAULT timezone('America/Bogota', NOW())`.

### Modified

- `src/lib/tools/types.ts` — `ToolModule = 'crm' | 'whatsapp' | 'system' | 'crm-bot'`.
- `src/lib/tools/rate-limiter.ts` — `DEFAULTS['crm-bot'] = { limit: Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50), windowMs: 60_000 }`; file JSDoc updated.
- `src/lib/tools/registry.ts` — `getToolsByModule()` Record literal includes `'crm-bot': []` (Rule 3 fix — see Deviations).
- `src/lib/tools/executor.ts` — `TIMEOUTS['crm-bot'] = 30_000` (Rule 3 fix — see Deviations).
- `src/lib/observability/types.ts` — `AgentId` union adds `'crm-reader' | 'crm-writer'`; `TriggerKind` union adds `'api'`; JSDoc documents Phase 44 additions.
- `middleware.ts` — Path check extended: `pathname.startsWith('/api/v1/tools') || pathname.startsWith('/api/v1/crm-bots')`. Comment updated.

## Decisions Made

- **Used UTC timestamp 20260418201645** for the migration filename. Matches the `YYYYMMDDHHMMSS_<feature>.sql` convention used by all prior migrations (observability, logistics, sms atomic RPC).
- **Rate-limit bucket is shared** between reader and writer (single `'crm-bot'` namespace). Rationale: a runaway agent caller usually hits both reader and writer in the same loop; splitting the quota masks the anomaly. Matches RESEARCH Open Question #1 recommendation. Can be split in v1.1 if production data justifies it.
- **`'crm-bot'` timeout set to 30_000ms** in `executor.ts` TIMEOUTS — rationale: the CRM bots run AI SDK v6 `generateText` tool-calling loops (up to `stepCountIs(5)` per CONTEXT.md), which are longer than plain DB writes (5s) but shorter than WhatsApp external API calls (15s). Conservative 30s cap prevents runaway loops from eating the entire lambda budget.
- **JSDoc updates** applied in `rate-limiter.ts` and `observability/types.ts` to document the Phase 44 additions — keeps documentation in sync with code (CLAUDE.md Regla 4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `src/lib/tools/registry.ts` getToolsByModule() Record literal**
- **Found during:** Task 2 (Extend ToolModule union + rate-limiter DEFAULTS)
- **Issue:** Plan flagged via `grep -rn 'Record<ToolModule' src/` that other consumers may need the new variant. After extending `ToolModule` with `'crm-bot'`, `registry.ts:294` became a compile error: the object literal `{ crm: [], whatsapp: [], system: [] }` was no longer a valid `Record<ToolModule, string[]>` (missing `'crm-bot'` key). Without this fix, `npx tsc --noEmit` would fail with TS2740 on the registry file, blocking the plan's done criteria.
- **Fix:** Added `'crm-bot': []` to the Record literal. Pure initialization — no behavior change (the for-loop iterates `this.tools.values()` and uses `tool.metadata.module` as the key, so no tool will ever populate `'crm-bot'` until Plan 44-04/05 registers CRM bot tools in this registry — which is unlikely since CRM bots use AI SDK v6 `tool()` directly, not the MCP `RegisteredTool` path).
- **Files modified:** `src/lib/tools/registry.ts`
- **Verification:** `npx tsc --noEmit` reports zero errors in `src/lib/tools/registry.ts`
- **Committed in:** `3a174fc` (Task 2 commit — bundled with rate-limiter DEFAULTS extension)

**2. [Rule 3 - Blocking] Extended `src/lib/tools/executor.ts` TIMEOUTS Record literal**
- **Found during:** Task 2 (Extend ToolModule union)
- **Issue:** Same root cause as #1 — `executor.ts:33` has `const TIMEOUTS: Record<ToolModule, number> = { crm, whatsapp, system }`. Adding `'crm-bot'` to the union broke this literal with TS2740.
- **Fix:** Added `'crm-bot': 30_000` to the TIMEOUTS map. 30s accommodates AI SDK v6 tool-calling loops with `stepCountIs(5)` — longer than CRM DB writes (5s), shorter than WhatsApp external calls (15s). Concrete value will be validated under load in Plan 44-07 smoke test.
- **Files modified:** `src/lib/tools/executor.ts`
- **Verification:** `npx tsc --noEmit` reports zero errors in `src/lib/tools/executor.ts`
- **Committed in:** `3a174fc` (Task 2 commit — bundled with ToolModule + rate-limiter changes)

**3. [Rule 2 - Missing Critical Docs] Added JSDoc to AgentId extension**
- **Found during:** Task 3 (Extend AgentId + TriggerKind)
- **Issue:** Plan asked for a JSDoc note above AgentId ("`'crm-reader' and 'crm-writer' added in Phase 44 (API-only tool providers, no conversation).`"). The existing JSDoc was a one-liner ("Conversational agents covered by Phase 42.1 (Decision #1)."), which became inaccurate after adding the non-conversational CRM bots.
- **Fix:** Replaced the one-liner with a structured JSDoc explaining conversational vs. API-only agents, including the Phase 44 addition and a note about synthetic conversationId + `triggerKind='api'`.
- **Files modified:** `src/lib/observability/types.ts`
- **Verification:** `grep` confirms JSDoc text present; tsc clean.
- **Committed in:** `4b1e334` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 3 blocking compile errors, 1 Rule 2 docs/correctness sync)
**Impact on plan:** All three auto-fixes necessary to ship the plan. #1 and #2 are compile-time blockers — plan could not pass its own "`tsc --noEmit` reports zero errors in edited files" gate without them. #3 prevents the AgentId JSDoc from going stale. No scope creep; each change is a surgical follow-through of the type extension.

## Issues Encountered

None during Tasks 1-4. Task 5 (apply migration in production) awaits user action — this is the designed `checkpoint:human-action` gate, not an issue.

## User Setup Required

**Task 5 (BLOCKING checkpoint:human-action) — Apply crm_bot_actions migration in production Supabase before any downstream plan (44-05, 06, 08, 09) can be pushed to Vercel.**

### Steps for the user

1. Open Supabase Dashboard → project → SQL Editor (or use `supabase db push --linked` if configured).
2. Execute the full contents of `supabase/migrations/20260418201645_crm_bot_actions.sql` against the production DB.
3. Run these three sanity checks and report back with the outputs:

   ```sql
   -- Check 1: 13 columns
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'crm_bot_actions'
   ORDER BY ordinal_position;

   -- Check 2: empty table
   SELECT COUNT(*) FROM crm_bot_actions;  -- expect 0

   -- Check 3: 4 indexes (pkey + 3 idx_crm_bot_actions_*)
   SELECT indexname FROM pg_indexes WHERE tablename = 'crm_bot_actions';

   -- Check 4: 2 CHECK constraints (agent_id, status)
   SELECT conname FROM pg_constraint
   WHERE conrelid = 'crm_bot_actions'::regclass AND contype = 'c';
   ```

4. Reply with: **"migration applied — 13 columns, 3 indexes, 2 CHECK constraints, 0 rows"** (or describe any deviation).

### Push policy for this plan

- **Tasks 2-4 (code changes)**: Do NOT push to Vercel until Task 5 is confirmed. Per CLAUDE.md Regla 5, the migration must exist in production before code that references the schema flows through — even though the type extensions themselves don't reference `crm_bot_actions` directly, they are gated behind the same plan unit and will be needed by Plans 44-05/06/08 which DO reference the table.
- **After migration applied**: push Tasks 1-4 commits to `origin/main` as a single unit (or let the orchestrator handle the squash-merge from the worktree).

## Next Phase Readiness

- **When Task 5 is confirmed:** Plans 44-02 (reader scaffolding), 44-03 (writer scaffolding), 44-04 (reader tools) can begin — they depend only on the AgentId and ToolModule type extensions shipped in Tasks 2-3.
- **Still gated after Task 5:** Plans 44-05 (writer two-step), 44-06 (cron expire), 44-08 (confirm endpoint), 44-09 (integration tests) — these query `crm_bot_actions` and can only proceed once the migration is confirmed in production.
- **Middleware coverage**: `/api/v1/crm-bots/*` is now authenticated identically to `/api/v1/tools/*`. Plan 44-07 can wire the reader HTTP route without any middleware changes.
- **Rate limiter**: `rateLimiter.check(workspaceId, 'crm-bot')` is now a compilable call site. Plan 44-07 can consume it directly.
- **Observability**: `runWithCollector({ agentId: 'crm-reader', triggerKind: 'api', ... })` is now type-safe. Plans 44-02/03 can wrap bot turns.

## CHECKPOINT REACHED

**Type:** human-action
**Plan:** 44-01
**Progress:** 4/5 tasks complete

### Completed Tasks

| Task | Name                                                                    | Commit   | Files                                                            |
| ---- | ----------------------------------------------------------------------- | -------- | ---------------------------------------------------------------- |
| 1    | Create crm_bot_actions migration file                                   | 4cfad76  | supabase/migrations/20260418201645_crm_bot_actions.sql           |
| 2    | Extend ToolModule union and rate-limiter DEFAULTS (+ registry/executor) | 3a174fc  | src/lib/tools/{types,rate-limiter,registry,executor}.ts          |
| 3    | Extend AgentId + TriggerKind in observability types                     | 4b1e334  | src/lib/observability/types.ts                                   |
| 4    | Extend middleware for /api/v1/crm-bots/*                                | 8816023  | middleware.ts                                                    |

### Current Task

**Task 5 [BLOCKING]: Apply crm_bot_actions migration in production Supabase**
**Status:** awaiting human action
**Blocked by:** Only the user can apply DDL to the production Supabase database. Automated agents must NOT attempt this per CLAUDE.md Regla 5.

### Checkpoint Details

See "User Setup Required" section above for the exact SQL the user must execute and the sanity-check queries to verify the result.

### Awaiting

User replies with: **"migration applied — 13 columns, 3 indexes, 2 CHECK constraints, 0 rows"** (or deviation report). Then downstream plans (44-05, 06, 08, 09) are unblocked and Tasks 2-4 code can be pushed to Vercel.

## Self-Check

Verifying all claims in this SUMMARY are grounded in the filesystem + git history.

### Created files exist

- `supabase/migrations/20260418201645_crm_bot_actions.sql` — FOUND

### Modified files show changes in git

- `src/lib/tools/types.ts` — FOUND (in 3a174fc)
- `src/lib/tools/rate-limiter.ts` — FOUND (in 3a174fc)
- `src/lib/tools/registry.ts` — FOUND (in 3a174fc)
- `src/lib/tools/executor.ts` — FOUND (in 3a174fc)
- `src/lib/observability/types.ts` — FOUND (in 4b1e334)
- `middleware.ts` — FOUND (in 8816023)

### Commits exist

- 4cfad76 — FOUND
- 3a174fc — FOUND
- 4b1e334 — FOUND
- 8816023 — FOUND

### Verification commands

```bash
[ -f supabase/migrations/20260418201645_crm_bot_actions.sql ] && echo FOUND
grep -c "'crm-bot'" src/lib/tools/types.ts  # 1
grep -c "'crm-bot':" src/lib/tools/rate-limiter.ts  # 1
grep -c "CRM_BOT_RATE_LIMIT_PER_MIN" src/lib/tools/rate-limiter.ts  # 2 (JSDoc + DEFAULTS)
grep -c "'crm-reader'" src/lib/observability/types.ts  # 2 (JSDoc + union)
grep -c "'crm-writer'" src/lib/observability/types.ts  # 2
grep -c "| 'api'" src/lib/observability/types.ts  # 1
grep -c "/api/v1/crm-bots" middleware.ts  # 2 (comment + pathname check)
git log --oneline | grep -E "4cfad76|3a174fc|4b1e334|8816023"  # 4 matches
npx tsc --noEmit 2>&1 | grep -v "vitest\|somnio/__tests__" | wc -l  # 0
```

All above conditions have been verified during execution. **Self-Check: PASSED**.

---

*Phase: 44-crm-bots*
*Plan: 01*
*Completed (Tasks 1-4): 2026-04-18*
*Task 5: awaiting human action — migration application to production Supabase*
