---
phase: standalone-debounce-interruption-system-v2
plan: 00
subsystem: infra
tags: [upstash, redis, distributed-lock, mutex, observability, vercel]

requires: []
provides:
  - "@upstash/redis@1.38.0 dependency installed and lockfiles synced (npm + pnpm)"
  - ".env.example documents UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN"
  - "Upstash provisioned: morfx-interruption-prod (Vercel Production) + morfx-interruption-dev (.env.local + Vercel Preview)"
  - "00-MEASUREMENTS.md — locked baselines for Plans 01-07 to consume"
  - "REVISION W7 keepTtl verdict: SUPPORTED — Plan 04 branch lockedin"
  - "v4 dormancy attestation: DORMANT — D-07 big-bang assumption holds, Regla 6 satisfied"
  - "Deferred risk register: Multi-Zone HA (Pitfall 1) declined for cost; FB/IG dedup gap accepted as forward-looking risk"
affects:
  - Plan 01 (lock.ts — uses LOCK_TTL_S=45 anchored to D-09 + this measurement)
  - Plan 03 (messages-dedup — uses Task 0.4 inventory; FB/IG accepted gap)
  - Plan 04 (V4MessagingAdapter.onFirstSendCompleted — uses keepTtl SUPPORTED branch)
  - Plan 05 (E2E smoke — will provide the real Vercel→Upstash latency that Task 0.2 could not)
  - Phase 42.1 (observability — future operator surface for re-validating these baselines)

tech-stack:
  added:
    - "@upstash/redis@^1.38.0"
  patterns:
    - "Single source of truth for env vars: .env.example (not .env.local.example — project convention)"

key-files:
  created:
    - .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md
    - .planning/standalone/debounce-interruption-system-v2/00-SUMMARY.md
  modified:
    - package.json (added @upstash/redis dep)
    - package-lock.json (npm install side-effect — pre-existing tracked file)
    - pnpm-lock.yaml (synced via pnpm install — Vercel uses this)
    - .env.example (appended UPSTASH block)

key-decisions:
  - "Deviation: appended UPSTASH vars to existing .env.example (project convention) instead of creating .env.local.example (plan-frontmatter name). The plan filename was inaccurate; intent was honored."
  - "WSL-local latency probe pivot for Task 0.2 — Vercel Auth team-level protection gated the preview probe; bypass-secret required $150/mo paid feature, declined; user opted for local fallback."
  - "Multi-Zone HA (Pitfall 1) — declined at provisioning ($200/mo presented price). Justified by v4 dormancy; re-eval at v4 flip time."
  - "LOCK_TTL_S = 45s retained (per D-09) — N=0 sub-loop latency sample size means D-13 17s budget is untested empirically but also not contradicted; conservative default holds."

patterns-established:
  - "Pre-Wave-1 measurement pattern: probe production observability AND probe SDK behavior empirically before locking implementation values."
  - "Risk-deferral pattern: when cost or schema gates a measurement, document the deferral explicitly + name the future audit trigger that closes it (e.g., Plan 05 smoke / Phase 42.1)."
---

# Plan 00 Wave 0 — Foundation: Upstash dependency, baselines, dormancy gate

## What was built

The Wave 0 foundation that anchors every subsequent plan (01–07) of the
`debounce-interruption-system-v2` standalone:

1. **Dependency landed.** `@upstash/redis@^1.38.0` installed (npm + pnpm
   lockfiles both synced). `.env.example` documents the two new vars so
   future devs don't break their local build silently.

2. **Upstash provisioned.** Operator created **two** Redis databases in
   `sa-east-1` (São Paulo, co-located with Vercel Function Region `gru1`):
   - `morfx-interruption-prod` (Pay-as-you-go, single-zone — Multi-Zone deferred)
   - `morfx-interruption-dev` (Free tier)

   Credentials distributed across three environments (Pitfall 5 isolation):
   - Local `.env.local` → DEV credentials
   - Vercel · Production → PROD credentials
   - Vercel · Preview → DEV credentials (no preview branch can touch prod Redis)

3. **00-MEASUREMENTS.md committed** with five locked audit sections:
   - §Messages dedup constraint inventory (RESEARCH A8)
   - §Sub-loop latency baseline (RESEARCH A2 → LOCK_TTL_S anchor)
   - §Upstash REST latency baseline (RESEARCH A1) — WSL-local pivot
   - §v4 dormancy attestation (D-04 + D-07 + Regla 6)
   - §REVISION W7 keepTtl support verdict (@upstash/redis 1.38.0)

## Key outcomes per Task

| Task | Outcome |
|------|---------|
| 0.6 (deps + .env.example) | `@upstash/redis@1.38.0` in package.json; UPSTASH_REDIS_REST_URL/TOKEN block in .env.example. Pnpm-lock synced after Vercel preview revealed the gap. |
| 0.4 (dedup audit) | `messages_wamid_unique` confirmed (covers WhatsApp inbound). FB/IG = forward-looking GAP per REVISION W6 — PROCEED. |
| 0.1 (sub-loop latency baseline) | **N=0** events under `subloop_completed*` in last 30d (expected: v4 dormant, v3 architecture different). LOCK_TTL_S=45s retained per fallback rule. |
| 0.5 (v4 dormancy) | DORMANT — 0 turns in Somnio WS last 7d; 0 active routing rules reference v4; 0 turns globally. D-07 big-bang assumption holds. |
| 0.3 (HUMAN CHECKPOINT — Upstash + env vars) | User approved post-provisioning. Vercel CLI used by orchestrator (per user delegation) to push 4 env vars (URL+TOKEN × Production+Preview). |
| 0.2 (Upstash REST latency) | **INDETERMINATE** for in-region Vercel→Upstash. WSL-local probe (Colombia→sa-east-1) captured P50 ≈ 176ms / P99 ≈ 180-200ms warm. Numbers reflect cross-country path, NOT in-region. System tolerates worst-case (25x heartbeat margin). Real in-region numbers will come from Plan 05 + Phase 42.1. |
| 0.5b (REVISION W7 keepTtl) | **SUPPORTED** — TTL preserved at 27s after re-SET with `{ keepTtl: true }`. Plan 04 V4MessagingAdapter.onFirstSendCompleted uses the SDK-direct branch. |

## Deviations from PLAN.md

1. **File name `.env.local.example` → `.env.example`** (Task 0.6). Project
   convention already had `.env.example` tracked (line ~37 originally); plan
   text named a different file. Appended to the existing file to honor intent
   while staying compatible with the project's git-tracked convention.

2. **`pnpm-lock.yaml` not updated in initial commit** (Task 0.6 follow-up).
   Initial `npm install` only touched `package-lock.json`; Vercel preview
   build failed (`ERR_PNPM_OUTDATED_LOCKFILE`). Caught and fixed via
   `pnpm install` + a follow-up commit on probe branch → cherry-picked
   to main as `79d49a25`. Documented in `key-decisions`.

3. **Multi-Zone (Prod Pack) not activated** at Upstash provisioning. Plan
   asked for it (Pitfall 1); user declined the $200/mo cost. Justified
   because v4 is dormant; re-evaluate at activation time. Documented in
   00-MEASUREMENTS.md §Deferred decision.

4. **Task 0.2 pivot from Vercel preview to WSL-local probe.** Vercel
   team-level "Vercel Authentication" gated the preview probe; bypass
   options required paid plan ($150/mo), declined. Local probe captured
   real numbers with explicit caveat that they are an UPPER BOUND for
   the real in-region path.

5. **`agent_id` value correction.** Plan referenced `'somnio-sales-v3'`;
   production observability uses `'somnio-v3'`. Discovered during Task 0.1
   query construction; corrected in MEASUREMENTS. Plans 04-07 should NOT
   use 'somnio-sales-v3' — only `'somnio-v3'` and the eventual `'somnio-v4'`.

## Risks acknowledged + deferred

- **Multi-Zone HA absence**: single-zone DB in prod. Re-evaluate at v4 activation. (00-MEASUREMENTS.md §Deferred decision: Pitfall 1)
- **FB/IG inbound dedup gap**: `messages` table lacks UNIQUE on FB/IG message IDs. Forward-looking risk; v4 serves WhatsApp only. (REVISION W6, Plan 03 will re-affirm)
- **In-region latency assumption (RESEARCH A1) unvalidated**: Plan 05 E2E smoke + Phase 42.1 observability will close this.
- **Stale Claude-Code worktrees**: `.claude/worktrees/agent-a*` accumulated debris from crashed agent sessions (one even has main checked out and locked, blocked our checkout flow). Out-of-scope for this plan but noted for cleanup.

## Verification commands (acceptance criteria checklist)

```bash
grep -c '"@upstash/redis"' package.json                                            # → 1
grep -c '"@upstash/redis"' pnpm-lock.yaml                                          # → ≥ 1
grep -c 'UPSTASH_REDIS_REST_URL' .env.example                                      # → 1
test -f .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md    # → 0 (exists)
grep -c 'Sub-loop latency baseline\|Upstash REST latency baseline\|Messages dedup constraint inventory\|v4 dormancy attestation\|REVISION W7' \
  .planning/standalone/debounce-interruption-system-v2/00-MEASUREMENTS.md          # → 5
node -e "require('@upstash/redis')"                                                # → exit 0
```

## Next plan

**Plan 01 — Wave 1**: ship `src/lib/locks/lock.ts` with `acquireLock` /
`releaseLock` (SET NX + Lua-CAS DEL) and `LOCK_TTL_S = 45` constant
with comment citing this MEASUREMENTS.md for the rationale.
