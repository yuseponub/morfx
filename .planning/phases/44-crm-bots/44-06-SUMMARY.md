---
phase: 44-crm-bots
plan: 06
subsystem: inngest
tags: [inngest, cron, crm_bot_actions, ttl, expiration, two-step-flow]

# Dependency graph
requires:
  - phase: 44-crm-bots
    plan: 01
    provides: crm_bot_actions table (schema applied in production with status + expires_at columns)
  - phase: "inngest setup (existing)"
    provides: inngest client, serve({ client, functions }) handler, createAdminClient, createModuleLogger
provides:
  - crmBotExpireProposalsCron — Inngest function with id 'crm-bot-expire-proposals'
  - Every-1-min TTL sweep that marks proposed → expired after 30s grace period
affects:
  - 44-05 (writer two-step propose/confirm) — confirm() at exact TTL sees 'expired' before cron sweeps at +30s (Pitfall 7 non-overlap)
  - 44-08 (writer confirm endpoint) — endpoint semantics unchanged; cron is a silent backstop
  - 44-09 (integration tests) — Plan 09 race test can verify cron marked proposed→expired after 5min+30s

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inngest cron pattern cloned verbatim from close-stale-sessions.ts (Phase 42 Plan 02) — same retries:1, same createAdminClient + createModuleLogger imports, same single step.run envelope"
    - "UTC wall-clock for cutoff (new Date(Date.now() - 30_000).toISOString()) — cron compares TIMESTAMPTZ column against ISO string — Postgres coerces correctly"
    - "30s grace constant extracted as top-of-file GRACE_MS = 30 * 1000 for single source of truth vs the confirm endpoint's strict TTL"

key-files:
  created:
    - src/inngest/functions/crm-bot-expire-proposals.ts
  modified:
    - src/app/api/inngest/route.ts

key-decisions:
  - "Grace window of 30s chosen per 44-RESEARCH.md Pitfall 7 — confirm endpoint uses strict TTL so cron's +30s sweep cannot race with a confirm that's already returned 'expired' at t=TTL"
  - "Kept cron cadence at exactly 1 minute (*/1 * * * *) per plan — daily sweep too coarse to evict before proposed rows accumulate; sub-minute sweep wastes Inngest invocations (Plan's own Open Question was resolved in favor of 1min in RESEARCH.md)"
  - "Did NOT filter on agent_id in predicate — reader rows have expires_at IS NULL so .lt('expires_at', cutoff) naturally excludes them (NULL comparison returns unknown, not true). Keeps predicate minimal and uses the idx_crm_bot_actions_proposed_expires partial index"
  - "Log payload is only { expiredCount, cutoff, cronRunAt } — no row IDs (T-44-06-03 Information Disclosure mitigation: bulk metrics only, individual crm_bot_actions row contents not leaked to observability pipeline)"

patterns-established:
  - "Pattern: CRM two-step cleanup crons follow close-stale-sessions shape — single step.run, UPDATE with predicate, return metric count, log cronRunAt"

requirements-completed:
  - "CONTEXT D-09: Acciones 'proposed' expiran automaticamente (TTL 5 min) — cron now sweeps expired rows"
  - "RESEARCH Pitfall 7: TTL race with 30s grace period to avoid confirm-mid-flight race"
  - "RESEARCH Don't Hand-Roll: Inngest cron, not setTimeout"

# Metrics
duration: "~10min"
completed: 2026-04-18
---

# Phase 44 Plan 06: CRM Bot Expire Proposals Cron Summary

**Inngest every-1-min cron that marks `crm_bot_actions` rows stuck in `status='proposed'` as `'expired'` once their `expires_at` has passed by more than 30 seconds — 30s grace window eliminates the confirm-mid-flight race from Pitfall 7. Both tasks committed atomically; zero TypeScript regressions; cron registered in the serve handler.**

## Performance

- **Duration:** ~10 min (both tasks automated; no deviations)
- **Started:** 2026-04-18T21:04:14Z
- **Completed:** 2026-04-18T21:14:57Z
- **Tasks:** 2 of 2 complete (no checkpoints in this plan)
- **Files:** 1 created, 1 modified

## Accomplishments

- Created `src/inngest/functions/crm-bot-expire-proposals.ts` (75 lines) — Inngest function id `crm-bot-expire-proposals`, every-minute cron with `TZ=America/Bogota */1 * * * *`, `retries: 1`, 30s `GRACE_MS` constant, single `step.run('expire-proposed', ...)` envelope.
- Registered the new cron in `src/app/api/inngest/route.ts` via 3 additive edits: (1) import line, (2) functions-array entry, (3) JSDoc listing the new cron's purpose. Zero existing functions touched, zero reordering.
- `tsc --noEmit` reports **zero NEW errors** — only 4 pre-existing vitest errors in `somnio/__tests__/*` (unchanged from 44-01 baseline, acceptable).
- Verified grace-window semantics: at `t = expires_at` the confirm endpoint already returns `'expired'` (strict TTL); cron's predicate is `expires_at < now - 30s`, so cron only sweeps once confirm has decided. Non-overlap guaranteed by construction.

## Task Commits

Each task committed atomically with `--no-verify` (parallel worktree executor):

1. **Task 1: Create crm-bot-expire-proposals cron file** — `fae5739` (feat)
2. **Task 2: Register cron in Inngest serve route** — `7c17e2d` (feat)

## Files Created/Modified

### Created

- **`src/inngest/functions/crm-bot-expire-proposals.ts`** (75 lines) — Inngest function that runs every 1 minute in `America/Bogota`. The single step `expire-proposed`:
  1. Opens an admin Supabase client.
  2. Computes `cutoff = new Date(Date.now() - 30_000).toISOString()` — 30s grace past strict TTL.
  3. UPDATEs `crm_bot_actions` setting `status='expired'` WHERE `status='proposed' AND expires_at < cutoff`.
  4. Uses `.select('id')` to count affected rows for the return value and log.
  5. Returns `{ expiredCount, cutoff }`; logs `{ expiredCount, cutoff, cronRunAt }` at info level.
  Module logger: `createModuleLogger('crm-bot-expire-proposals')`. Error path logs+throws so Inngest retries once.

### Modified

- **`src/app/api/inngest/route.ts`** (+3 lines, no deletions/reorders): import `crmBotExpireProposalsCron` from `@/inngest/functions/crm-bot-expire-proposals`; add entry to the `functions: [...]` array inside `serve({ client, functions })`; update the top-of-file JSDoc functions list with the new cron's one-line summary.

## Decisions Made

- **30s grace window past strict TTL.** confirmAction (built in Plan 44-05/08) will use strict TTL to decide `expired`; this cron adds +30s before sweeping. At `t = expires_at` the confirm endpoint returns `expired` synchronously, so by the time the cron's predicate matches (`t = expires_at + 30s`), no confirm can still be in flight. Non-overlap is the explicit guarantee (44-RESEARCH Pitfall 7).
- **Cron cadence = exactly 1 minute.** `*/1 * * * *` in America/Bogota. Chosen over 5-min or hourly because expiry staleness grows linearly in cron-interval and visibility UIs listing "pending proposals" shouldn't show rows that are already logically dead. Minute-level invocations are negligible in Inngest pricing.
- **Predicate narrowly scoped to `status='proposed'`.** Rows in `executed`/`failed`/`expired` are never touched by this cron. This is the T-44-06-01 Tampering mitigation — the cron cannot overwrite a successful execution or a legitimate failure.
- **No `agent_id` filter in predicate.** Reader rows will have `expires_at IS NULL` by convention (only writer proposals have TTL), and the `.lt('expires_at', cutoff)` predicate excludes NULLs naturally — postgres returns unknown (not true) for NULL comparisons. Keeps the predicate minimal and uses the existing `idx_crm_bot_actions_proposed_expires` partial index from Plan 44-01 (`WHERE status = 'proposed'`).
- **Minimal log payload: `{ expiredCount, cutoff, cronRunAt }`.** No row IDs and no `workspace_id` — bulk metrics only. T-44-06-03 Information Disclosure mitigation: individual row contents never reach the observability pipeline.
- **GRACE_MS extracted as top-of-file constant** (not inlined in the predicate) — keeps the 30s figure greppable and makes it single-source-of-truth when the confirm endpoint's strict-TTL math needs to cross-reference it.

## Verification of Grace Window (Pitfall 7 Mitigation)

Timeline of a proposed row under the cron + a confirm request:

| Time          | Cron predicate `expires_at < now - 30s` | Confirm endpoint decides            | Non-overlap reasoning                              |
| ------------- | --------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| `t < TTL`     | `false` (TTL not reached yet)           | `executed` (strict TTL not passed)  | Cron ignores row; confirm wins.                    |
| `t = TTL`     | `false` (grace not elapsed yet)         | `expired` (strict TTL reached)      | Cron ignores row; confirm already ruled `expired`. |
| `t = TTL+30s` | `true` (grace elapsed)                  | `expired` (same decision as above)  | Cron sweeps the row; no confirm can still run.     |

By construction the cron's sweep window begins 30s after the confirm endpoint's decision has become deterministic. There is no shared moment where both sides could produce different outcomes. See threat row T-44-06-02 in the PLAN's STRIDE register.

## Deviations from Plan

None — plan executed exactly as written.

Both Task 1 and Task 2 matched the plan verbatim:
- Task 1: file contents match the sample in the plan's `<action>` block 1:1 (plus a slightly expanded JSDoc on the cron function for maintainer clarity — still purely additive, no behavioral change).
- Task 2: import + functions-array entry + JSDoc comment added in the three exact positions specified by the plan. No ordering changes, no unrelated edits.

No Rule 1/2/3/4 rule applied. No auth gates encountered (cron runs server-side with service-role admin client, no OAuth path).

## Issues Encountered

None.

## Known Stubs

None. The cron is production-ready — it reads a real table (`crm_bot_actions` exists in production from Plan 44-01 Task 5), uses a real admin client, and emits real observability logs. No placeholders, no `TODO`s, no hardcoded mocks.

## Threat Flags

None — the cron introduces no new trust boundary or external surface. It runs on the same Inngest-signed-webhook path as all other existing crons (`closeStaleSessionsCron`, `observabilityPurgeCron`, `enviaStatusPollingCron`), uses the same `createAdminClient()` server-side, and only touches a table already in the Phase 44 threat model.

## User Setup Required

**None.** Production-ready deployment sequence (Regla 5 compliant):

1. `crm_bot_actions` migration was applied in production during Plan 44-01 Task 5 (confirmed prior to Wave 2 start).
2. Once this worktree is merged to `main`, push to Vercel: Inngest Cloud will auto-register the new function via `GET /api/inngest` on the next deploy — no manual cron registration in the Inngest dashboard required (the `serve({ functions: [...] })` array is the single source of truth).
3. Observability: new invocations appear at `https://app.inngest.com/env/production/functions/crm-bot-expire-proposals`. Each run logs `{ expiredCount, cutoff, cronRunAt }` with `logger.info`.

**Push policy:** This code references `crm_bot_actions` columns (`status`, `expires_at`) that exist in production (Plan 44-01 Task 5 migration already applied) — so Regla 5 is satisfied and push can proceed immediately after merge.

## Next Phase Readiness

- **Plan 44-05 (writer two-step state machine):** Can use strict TTL in `confirmAction()` with confidence — the cron's 30s grace is the explicit guarantee that confirm and cron never overlap.
- **Plan 44-08 (writer propose/confirm endpoints):** When `confirmAction` returns `{ status: 'expired' }` at `t = expires_at`, the caller gets a deterministic "already expired" semantic — the cron will sweep the row to DB status `'expired'` within 30-90s, so follow-up list endpoints always observe `'expired'` not `'proposed'`.
- **Plan 44-09 (integration tests):** The plan can now add a race test: (1) call `propose()` with TTL=5min, (2) `setTimeout(330_000)`, (3) assert the row has `status='expired'` in the DB. 330s = TTL (300s) + grace (30s) — the earliest deterministic moment the cron will have swept.
- **Inngest dashboard reference:** `crmBotExpireProposalsCron` appears alongside `closeStaleSessionsCron`, `observabilityPurgeCron`, and `enviaStatusPollingCron` in the functions array — all four are one-shot cron wrappers around a single `step.run`, making operational behavior uniform.

## Self-Check

Verifying all claims in this SUMMARY are grounded in the filesystem + git history.

### Created files exist

- `src/inngest/functions/crm-bot-expire-proposals.ts` — FOUND (75 lines)

### Modified files show changes in git

- `src/app/api/inngest/route.ts` — FOUND (in 7c17e2d, +3 lines)

### Commits exist

- `fae5739` (feat 44-06 Task 1) — FOUND
- `7c17e2d` (feat 44-06 Task 2) — FOUND

### Verification commands

```bash
[ -f src/inngest/functions/crm-bot-expire-proposals.ts ] && echo FOUND  # FOUND
grep -c "export const crmBotExpireProposalsCron" src/inngest/functions/crm-bot-expire-proposals.ts  # 1
grep -c "TZ=America/Bogota" src/inngest/functions/crm-bot-expire-proposals.ts  # 1
grep -c '\*/1 \* \* \* \*' src/inngest/functions/crm-bot-expire-proposals.ts  # 1
grep -c "GRACE_MS = 30 \* 1000" src/inngest/functions/crm-bot-expire-proposals.ts  # 1
grep -c "crm_bot_actions" src/inngest/functions/crm-bot-expire-proposals.ts  # 3
grep -c "\.eq('status', 'proposed')" src/inngest/functions/crm-bot-expire-proposals.ts  # 1
grep -c "\.lt('expires_at'" src/inngest/functions/crm-bot-expire-proposals.ts  # 2
grep -c "crmBotExpireProposalsCron" src/app/api/inngest/route.ts  # 2 (import + functions array)
grep -c "crm-bot-expire-proposals" src/app/api/inngest/route.ts  # 2 (import path + JSDoc)
git log --oneline | grep -E "fae5739|7c17e2d"  # 2 matches
npx tsc --noEmit 2>&1 | grep -v "vitest\|somnio/__tests__" | wc -l  # 0
```

All above conditions verified during execution. **Self-Check: PASSED**.

---

*Phase: 44-crm-bots*
*Plan: 06*
*Completed: 2026-04-18*
*Tasks: 2/2*
*Commits: fae5739, 7c17e2d*
