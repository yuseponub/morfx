---
phase: 44-crm-bots
plan: 02
subsystem: crm-bots
tags: [crm-bots, alerts, email, resend, rate-limit, kill-switch, env-vars, fail-silent]
dependency_graph:
  requires: []
  provides:
    - "resend@^6.12.0 production dependency"
    - "sendRunawayAlert — email on rate-limit hit (Pitfall 8 dedupe)"
    - "maybeSendApproachingLimitAlert — email at >80% budget used"
    - "__resetAlertDedupeForTests — test-only helper (NODE_ENV-guarded)"
    - "Env contract: CRM_BOT_ENABLED, CRM_BOT_RATE_LIMIT_PER_MIN, RESEND_API_KEY, CRM_BOT_ALERT_FROM"
  affects:
    - "Future Plans 07 + 08 (reader + writer routes) will import from src/lib/agents/_shared/alerts.ts"
    - "Plan 03 (rate-limiter extension) parallel-safe — zero file overlap"
    - "Plan 09 (integration tests) can import __resetAlertDedupeForTests in NODE_ENV=test"
tech_stack:
  added:
    - "resend@^6.12.0 (production dependency via --legacy-peer-deps)"
  patterns:
    - "Lazy singleton (resendClient) — env read on first call, absent key returns null without throwing"
    - "In-memory Map dedupe with 30-min cleanup interval + .unref for Node host (Edge-safe guard)"
    - "Fire-and-forget async with try/catch wrapping external I/O (Resend API) — never throws to caller"
    - "Env-parameterized FROM with sandbox fallback (Blocker 5 mitigation)"
    - "Test-only export guarded by NODE_ENV check (Warning #15 defense-in-depth)"
key_files:
  created:
    - path: "src/lib/agents/_shared/alerts.ts"
      purpose: "Shared CRM bot email alerts (runaway + approaching-limit) with dedupe, fail-silent, lazy client"
      lines: 179
  modified:
    - path: "package.json"
      purpose: "Added resend@^6.12.0 to dependencies"
    - path: "package-lock.json"
      purpose: "Resolved resend + transitive deps (6 added / 49 changed per npm output)"
    - path: ".env.example"
      purpose: "Documented 4 new Phase 44 env vars with kill-switch + sender-domain semantics"
decisions:
  - "Kept planned default FROM = 'onboarding@resend.dev' (Resend sandbox) — works without DKIM for any Resend account; production override via CRM_BOT_ALERT_FROM"
  - "Chose lazy Resend client over eager instantiation — avoids crash on module import when RESEND_API_KEY is unset (common in CI and fresh deploys)"
  - "Used pino module logger (createModuleLogger('crm-bot-alerts')) instead of raw console.error for consistency with existing repo pattern (Regla: existing infra)"
  - "Added .unref guard via double-cast (setInterval return type differs between Node and Edge) — preserves compile compatibility without @types/node assumption"
metrics:
  duration_min: 31
  tasks_completed: 2
  files_created: 1
  files_modified: 3
  commits: 2
  completed_at: "2026-04-18T20:46:00Z"
---

# Phase 44 Plan 02: Resend install + shared CRM bot alerts module Summary

**One-liner:** Resend@6.12.0 email dep installed; `src/lib/agents/_shared/alerts.ts` exports `sendRunawayAlert` + `maybeSendApproachingLimitAlert` with 15-min in-memory dedupe, fail-silent error handling, env-parameterized FROM, and a NODE_ENV-guarded test helper.

## What Shipped

### Task 1: resend dep + env documentation
- Installed `resend@^6.12.0` with `--legacy-peer-deps` (mandatory per STATE.md react-textarea-autocomplete peer conflict with React 19)
- Placed in `dependencies` (not `devDependencies`) — alerts are production runtime code
- Added 4 env vars to `.env.example` with full comments:
  - `CRM_BOT_ENABLED=true` (kill-switch; per-request read to avoid module-load caching)
  - `CRM_BOT_RATE_LIMIT_PER_MIN=50` (heuristic, documented as non-enforcement ceiling)
  - `RESEND_API_KEY=` (unset → alerts fail-silent)
  - `CRM_BOT_ALERT_FROM=` (Blocker 5 fix; Resend sandbox default documented)
- `require('resend')` smoke-test exits cleanly (verified)

### Task 2: shared alerts module
- Created `src/lib/agents/_shared/alerts.ts` (179 lines)
- Exports (3):
  1. `sendRunawayAlert(ctx: RunawayAlertCtx)` — fired on rate-limit hit (429)
  2. `maybeSendApproachingLimitAlert(ctx: ApproachingLimitCtx)` — fired when >80% of budget consumed
  3. `__resetAlertDedupeForTests()` — test-only; throws if `NODE_ENV !== 'test'`
- In-memory `Map<string, number>` dedupe keyed by `{kind}:{workspaceId}:{agentId}` with 15-minute TTL
- 30-minute cleanup interval with `.unref()` guard (double-cast to preserve Edge-runtime compile compatibility)
- Lazy Resend client — `getResendClient()` returns `null` when `RESEND_API_KEY` is unset; callers log-and-return instead of throwing
- FROM address read via `getFromAddress()` per-call (`process.env.CRM_BOT_ALERT_FROM ?? 'onboarding@resend.dev'`)
- Only one `throw` in the entire file — inside `__resetAlertDedupeForTests` (defense-in-depth guard)
- Every outbound `client.emails.send(...)` wrapped in `try/catch` → `logger.error({ err, ctx }, '... (fail-silent)')`
- `RECIPIENT = 'joseromerorincon041100@gmail.com'` hardcoded per plan spec (key_links require)

## Verification Results

### Task 1 automated verification
```
grep '"resend":' package.json        → 1 match
grep 'CRM_BOT_ENABLED' .env.example   → 1 match
grep 'CRM_BOT_RATE_LIMIT_PER_MIN' .env.example → 1 match
grep 'RESEND_API_KEY' .env.example    → 1 match
grep 'CRM_BOT_ALERT_FROM' .env.example → 1 match
node -e "require('resend')"           → exit 0, no output
```

### Task 2 automated verification
```
src/lib/agents/_shared/alerts.ts      → file exists (179 lines)
sendRunawayAlert export count         → 1
maybeSendApproachingLimitAlert export → 1
'joseromerorincon041100@gmail.com'    → 1 occurrence
DEDUPE_MS references                  → 5
fail-silent in comments/logs          → 2
CRM_BOT_ALERT_FROM references         → 3
'onboarding@resend.dev' references    → 3
"NODE_ENV !== 'test'" guard           → 1 occurrence
total `throw` statements (code only)  → 1 (in __resetAlertDedupeForTests)
tsc --noEmit errors in this file      → 0
```

## Success Criteria — all met

- [x] `package.json` contains `"resend":` entry (version `^6.12.0`)
- [x] `src/lib/agents/_shared/alerts.ts` exists with both async exports + guarded test helper
- [x] `.env.example` documents all 4 vars with comments
- [x] FROM reads `process.env.CRM_BOT_ALERT_FROM` with `onboarding@resend.dev` fallback; no hardcoded runtime value for `alerts@morfx.app` (appears only in a documentation comment)
- [x] `__resetAlertDedupeForTests` throws when `NODE_ENV !== 'test'`
- [x] Plans 07 + 08 can import `sendRunawayAlert` / `maybeSendApproachingLimitAlert` without additional wiring
- [x] `tsc --noEmit` reports 0 errors from files modified by this plan (pre-existing errors in unrelated `somnio/__tests__/*` vitest files are out of scope)

## Commits (2)

| # | Hash     | Type  | Message                                                   | Files                                           |
| - | -------- | ----- | --------------------------------------------------------- | ----------------------------------------------- |
| 1 | e980c57  | chore | install resend + document CRM bot env vars                | package.json, package-lock.json, .env.example  |
| 2 | 3508351  | feat  | add shared CRM bot alerts module (runaway + approaching-limit) | src/lib/agents/_shared/alerts.ts         |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's `setInterval(...).unref?.()` pattern fails TypeScript strict compile**

- **Found during:** Task 2 implementation (inline while writing `alerts.ts`)
- **Issue:** The plan's literal code `setInterval(fn, 30*60*1000).unref?.()` does not compile under strict TypeScript because `setInterval` returns `number` under DOM/Edge-runtime types (no `.unref` method), while Node returns `Timeout`. The optional chain on a potentially-never-typed member raises a type error.
- **Fix:** Stored the handle first, then invoked `.unref` through a narrow double-cast: `(handle as unknown as { unref?: () => void }).unref?.()`. Preserves semantics (unref if Node-like host, no-op in Edge) and compiles cleanly.
- **Files modified:** `src/lib/agents/_shared/alerts.ts` (lines 65-73)
- **Commit:** 3508351

No Rule 2/3/4 deviations. No architectural changes. No auth gates triggered during this plan.

### npm Install Permission Note (operational, not a deviation)

The first `npm install resend` attempt hit `EACCES`/`ENOTEMPTY` renames on the WSL-mounted NTFS filesystem because a prior (now-aborted) background install left ~39 orphan `.name-xxxxxx` temp directories across `node_modules/`. Cleaned up with a single `find -type d -name '.*-*' -not -name '.bin' ... -exec rm -rf {} +` pass, then the retry succeeded cleanly (`added 6 packages, and changed 49 packages in 4m`). This is a filesystem transient, not a project issue.

## Required Follow-up (not blocking this plan)

Before Plan 09 integration tests validate email delivery, the user must:

1. Create a Resend account (free tier 3k emails/mo) → `https://resend.com/api-keys`
2. Set `RESEND_API_KEY` in:
   - `.env.local` (gitignored) for local dev
   - Vercel Dashboard → Settings → Environment Variables for production
3. (Production only) Verify a sending domain in Resend Dashboard → Domains, then set `CRM_BOT_ALERT_FROM` to a DKIM/SPF-verified address (e.g. `MorfX Alerts <alerts@morfx.app>`). Leaving unset uses the sandbox `onboarding@resend.dev` which works in dev.
4. Send a test email from the Resend dashboard before first production deploy (sanity check of domain verification).

Until these are done, `sendRunawayAlert` and `maybeSendApproachingLimitAlert` fail silently (`logger.warn({ ctx }, 'RESEND_API_KEY unset; alert dropped')`) — no error propagation, no route crashes, zero customer impact.

## Push-to-Vercel safety

This plan is **safe to push independently** of Plan 01 (migration). There are no DB references, no new tables, no schema touches. Only a new npm dep + a new file + an env documentation file. Nothing calls the alert functions yet (Plans 07/08 will wire them into routes).

## Known Stubs

None. All exports are fully implemented. The "stub" pattern does not apply here — the alerts module is canonical end-state for Phase 44's email alert surface.

## Threat Flags

No new threat surfaces introduced beyond those already modeled in the plan's `<threat_model>` (T-44-02-01 through T-44-02-07). All plan-mandated mitigations implemented:

- T-44-02-01 (API key disclosure): key read via `process.env.RESEND_API_KEY`, never logged (pino redaction paths already cover `*.apiKey` / `*.key`). Logger payloads only include `{ctx}` = workspaceId + agentId + limit.
- T-44-02-02 (Resend outage DoS): try/catch wraps every `client.emails.send()`; fail-silent guaranteed.
- T-44-02-03 (recipient inbox DoS): 15-min in-memory dedupe per (kind × workspace × agent).
- T-44-02-05 (test helper privilege escalation): `NODE_ENV !== 'test'` throws on line 175.
- T-44-02-06 (FROM spoofing): env-parameterized with sandbox fallback; modification requires Vercel dashboard access.

## Self-Check: PASSED

- [x] `src/lib/agents/_shared/alerts.ts` — FOUND
- [x] `.env.example` — FOUND (7 lines → 37 lines, all 4 vars present)
- [x] `package.json` resend entry — FOUND (`"resend": "^6.12.0"`)
- [x] Commit `e980c57` — FOUND in `git log`
- [x] Commit `3508351` — FOUND in `git log`
- [x] `require('resend')` — exit 0, no output
- [x] `tsc --noEmit` on `src/lib/agents/_shared/alerts.ts` — 0 errors
