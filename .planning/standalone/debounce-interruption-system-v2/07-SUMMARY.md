---
phase: standalone-debounce-interruption-system-v2
plan: 07
subsystem: ship-gate
tags: [e2e, vitest, agent-scope, learnings, uat, deferral, ship]

# Dependency graph
requires:
  - phase: standalone-debounce-interruption-system-v2 / plan 04
    provides: "V4MessagingAdapter + LockHandle threading + 4 lock fields on EngineInput"
  - phase: standalone-debounce-interruption-system-v2 / plan 05
    provides: "CKPT-1..5 wired across agent + RAG sub-loop + legacy sub-loop"
  - phase: standalone-debounce-interruption-system-v2 / plan 06
    provides: "v2-lock-cleanup-cron + sandbox Interruption tab + /api/observability/events route + 14th LockEventLabel"
provides:
  - "src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts — D-19 Phase 1+2 (S1-S4) via mock-redis"
  - ".claude/rules/agent-scope.md — Module Scope: interruption-system-v2 entry (CLAUDE.md Regla 4)"
  - ".planning/standalone/debounce-interruption-system-v2/LEARNINGS.md — bugs + decisions + patterns + deferrals + tech debt"
  - ".planning/standalone/debounce-interruption-system-v2/UAT.md — 4-phase D-19 sign-off with explicit Phase 3 + Phase 4 deferrals + REVISION W4 S3 acknowledgment"
  - "Ship verdict: APPROVED to merge to main"
affects:
  - main branch (orchestrator pushes exec/debounce-v2-wave6 → main fast-forward post this commit)
  - Future standalone `debounce-v2-sandbox-integration` (will close Phase 4 deferral)
  - Future activation moment per workspace (will close Phase 3 deferral)

tech-stack:
  added: []  # Plan 07 is documentation-only (LEARNINGS + UAT + SUMMARY). Tasks 7.1 + 7.2 already shipped in prior commits 300490dc + 203e691d.
  patterns:
    - "Defer-by-document pattern: when a manual smoke is best done at the natural activation moment instead of synthetically on a preview branch, document it explicitly as DEFERRED in UAT.md with the activation-moment trigger named."
    - "Sandbox-engine-doesn't-yet-exercise-the-module pattern: when the sandbox surface (UI tab + API route) is structurally complete but the sandbox engine itself doesn't drive the module, defer 'visual smoke' to a follow-up standalone that wires the engine first."

key-files:
  created:
    - .planning/standalone/debounce-interruption-system-v2/LEARNINGS.md
    - .planning/standalone/debounce-interruption-system-v2/UAT.md
    - .planning/standalone/debounce-interruption-system-v2/07-SUMMARY.md
  modified: []  # Tasks 7.1 + 7.2 modifications (e2e-scenarios.test.ts + agent-scope.md) shipped in prior commits — already in commit history.

key-decisions:
  - "Defer D-19 Phase 3 (Vercel preview + WhatsApp smoke) to v4 activation moment per workspace — avoids shipping FORCE_V4_FOR_PHONE override; same code, same env vars, the activation moment IS the smoke."
  - "Defer D-19 Phase 4 (sandbox visual smoke) to follow-up standalone `debounce-v2-sandbox-integration` — sandbox engine (SomnioV4Engine) does not currently exercise the lock-system; visual smoke today would assert only that the tab renders empty."
  - "REVISION W4 S3 deferral acknowledged: 2026-05-26 by user (Jose Romero) — covered by Vitest e2e-scenarios.test.ts S3 case; manual reproduction on Vercel preview deferred indefinitely per D-19 line 185 ship criterion interpretation accepted."
  - "Ship verdict: APPROVED to merge to main with explicit Phase 3 + Phase 4 deferrals documented in UAT.md."

patterns-established:
  - "Defer-by-document: explicit deferral in UAT.md with named trigger for the deferred work (activation moment / follow-up standalone) is preferred over hand-waving 'we'll do it later'."
  - "Standalone-ships-with-explicit-deferrals: a standalone can ship with sub-criteria deferred provided the deferrals are documented + the user has signed off on the trade-offs."
---

# Plan 07 Wave 6 — Ship gate (E2E tests + module scope doc + LEARNINGS + UAT + Phase 3+4 deferrals)

## What was built

Plan 07 is the ship gate for the `debounce-interruption-system-v2` standalone. It
contained 5 tasks; the first 2 shipped autonomously, the next 2 were human checkpoints
that the user explicitly deferred to follow-up work, and the last task (this one)
captures the deferrals + closes the standalone with a documented ship verdict.

| Task | Status | Output |
|------|--------|--------|
| Task 7.1 — E2E scenarios (S1-S4) in `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts` | ✓ DONE | Commit `300490dc` |
| Task 7.2 — `Module Scope: interruption-system-v2` entry in `.claude/rules/agent-scope.md` | ✓ DONE | Commit `203e691d` |
| Task 7.3 — D-19 Phase 3 (Vercel preview + WhatsApp smoke) | ⊘ DEFERRED | To v4 activation moment per workspace (user decision 2026-05-26) |
| Task 7.4 — D-19 Phase 4 (sandbox visual smoke) | ⊘ DEFERRED | To follow-up standalone `debounce-v2-sandbox-integration` |
| Task 7.5 — Write LEARNINGS.md + UAT.md + 07-SUMMARY.md | ✓ DONE | This commit |

## Task 7.1 — e2e-scenarios.test.ts (shipped in commit 300490dc)

Vitest E2E suite at `src/lib/agents/interruption-system-v2/__tests__/e2e-scenarios.test.ts`
exercising D-19 Phase 1 + Phase 2 (scenarios S1, S2, S3, S4) via the shared `createMockRedis`
helper from Plan 01 plus the production code paths in `lock.ts`, `pending.ts`, and
`checkpoints.ts`.

**Test counts (D-19 Phase 1+2 status):**

- 4/4 e2e scenarios pass.
- 40/40 tests across the full interruption-system-v2 module suite (12 lock + 6
  observability + 10 pending + 8 checkpoints + 4 e2e).
- 73 total interruption-system-related tests across the codebase (module 40 + Plan 03
  lock-event 10 + Plan 04 V4MessagingAdapter 11 + Plan 06 cron 12).

**S3 (TTL expiry / zombie lambda) coverage note:** The S3 scenario is the only one where
Vitest is the SOLE coverage modality — REVISION W4 deferred the manual Vercel preview
reproduction because it would require artificial hang-induction code in production
(rejected). The Vitest test docstring cites "REVISION W4 — Vitest-only coverage; UAT.md
captures user acknowledgment of manual deferral".

## Task 7.2 — agent-scope.md Module Scope entry (shipped in commit 203e691d)

`.claude/rules/agent-scope.md` extended with a `### Module Scope: interruption-system-v2`
entry following the established pattern from `Module Scope: crm-query-tools` and
`Module Scope: crm-mutation-tools`. The entry covers:

- **PUEDE** — the 5 public-API primitives + cron sweep.
- **NO PUEDE** — list including "no createAdminClient inside the module" (Regla 3) with
  the documented exception of the cron file in `src/inngest/functions/` (D-09 verbatim
  needs the `agent_sessions WHERE status='active'` join).
- **Validation gates** — 6 grep-verifiable assertions including the 14-label
  LockEventLabel union, the 8 CheckpointId placements, the test count (40 in the
  module), and the standalone shipping date.
- **Consumers** — currently only `somnio-sales-v4` (DORMANT in prod, 0 workspaces).
  FB/IG via ManyChat noted as forward-looking risk (REVISION W6).
- **Coexistence with Phase 31** — explicit note that the parent
  `MessagingProductionAdapter.hasNewInboundMessage` still serves the 5 non-v4 agents
  byte-identical; the V4 path is the subclass override only.

## Task 7.3 — D-19 Phase 3 DEFERRED

**Decision:** Deferred to fecha de activación real de v4 per workspace (user decision
recorded 2026-05-26 by Jose Romero).

**Rationale (full text in UAT.md):**

1. Running the smoke now against a synthetic `FORCE_V4_FOR_PHONE` env-var override on a
   preview branch would require shipping temporary override code that must be removed
   before merge — net negative for merge cleanliness and a Pitfall 5 risk.
2. It would not exercise any prod traffic path different from the eventual real
   activation path (same code, same env vars in Production env).
3. The activation moment is the natural smoke window — defers the work by only days/weeks.

**Confidence basis:** Phase 1+2 coverage (73 tests) + Regla 6 hand-trace verified across
all 5 non-v4 agents + v4 dormant in prod (0 workspaces, no `lock:*` keys, no events) +
rollback trivial via 1-line SQL UPDATE.

## Task 7.4 — D-19 Phase 4 DEFERRED

**Decision:** Deferred to follow-up standalone `debounce-v2-sandbox-integration` (yet to
be created).

**Rationale (full text in UAT.md):** The sandbox surface added by Plan 06 (Interruption
tab in `/sandbox` debug panel + `/api/observability/events` route) is structurally
complete but ONLY meaningful when the sandbox engine actually executes the lock-system.
Today the sandbox runs through `SomnioV4Engine` — a lighter wrapper distinct from
production's `V4ProductionRunner`:

1. `SomnioV4Engine` does NOT call `acquireLock` / `startHeartbeat` /
   `releaseLockIfOwner`.
2. The checkpoints wired into `somnio-v4-agent.ts` + `sub-loop/index.ts` are guarded with
   `if (ctx.lockHandle != null) checkpoint(...)` — they skip when the sandbox invokes
   them because the sandbox never threads a `lockHandle` into `SubLoopContext`.
3. As a result, "visual smoke in sandbox" today would confirm only that the tab renders
   an empty state, not that the lock-system works.

The follow-up standalone will wire `acquireLock` + `releaseLockIfOwner` + thread
`lockHandle` into the sandbox engine with a sandbox-namespaced key
(`lock:sandbox:<session-id>:...`) so the surface added by Plan 06 becomes meaningful in
dev.

## Task 7.5 — Documentation deliverables (this commit)

3 new files created in `.planning/standalone/debounce-interruption-system-v2/`:

- **LEARNINGS.md** (~370 lines) — bugs encountered + decisions + 10 patterns established
  + 9 anti-patterns avoided + 8 deferrals to follow-up standalones + cost telemetry +
  recommendations for next module migration + tips section + tech debt list.
- **UAT.md** — 4-phase D-19 sign-off matrix: Phase 1 PASSED, Phase 2 PASSED, Phase 3
  DEFERRED with explicit reasons + activation-moment trigger, Phase 4 DEFERRED with
  explicit reasons + follow-up standalone name. REVISION W4 BLOCKING S3 acknowledgment
  entry present + signed. Pre-merge blockers (B1/B2/B4/W3/W4/W7) all cleared.
- **07-SUMMARY.md** (this file) — task-by-task summary + ship verdict.

## Final phase status

| Plan | Status | Commits | Tests |
|------|--------|---------|-------|
| 00 — Wave 0 foundation (Upstash + measurements + dormancy gate) | ✓ DONE | Multiple (see 00-SUMMARY.md) | N/A |
| 01 — lock.ts + observability.ts + mock-redis (LOCK-01..05, LOCK-07) | ✓ DONE | Multiple (see 01-SUMMARY.md) | 18/18 |
| 02 — pending.ts + checkpoints.ts (LOCK-02, LOCK-03) | ✓ DONE | Multiple (see 02-SUMMARY.md) | 18/18 |
| 03 — webhook handlers + agent-production threading (Plan 03) | ✓ DONE | Multiple (see 03-SUMMARY.md) | 8 new + 36 regression = 44/44 |
| 04 — V4MessagingAdapter + V4ProductionRunner CKPT-0+6 wiring | ✓ DONE | Multiple (see 04-SUMMARY.md) | 11 new + 46 regression = 57/57 |
| 05 — somnio-v4-agent CKPT-1+2 + sub-loop CKPT-3+4+5 wiring | ✓ DONE | `2b7250d7` + `1438381e` + `68401229` | 0 new test files (no changes to module surface); 57/57 module + 0 regression |
| 06 — Inngest cron + sandbox Interruption tab + obs events route | ✓ DONE | `3acf80b5` + `bccf783f` + `ee601742` | 12 cron tests + 57/57 regression = 69/69 |
| 07 — E2E + agent-scope + LEARNINGS + UAT + deferrals (this plan) | ✓ DONE (with 7.3 + 7.4 deferred) | `300490dc` + `203e691d` + this commit | 4 e2e scenarios + 73 total |

**Total:** 8 plans shipped. 73 vitest tests green. 14 LockEventLabel values wired
end-to-end. 8 CheckpointId placements active across runner + agent + sub-loop + adapter.
0 createAdminClient leakage into the module. 0 `FORCE_V4_FOR_PHONE` test-only overrides
in the merge diff.

## Regla 6 hand-trace (final, locked at ship)

| Agent | Adapter | Runner | Behavior |
|---|---|---|---|
| `somnio-sales-v3` | `ProductionMessagingAdapter` (parent) | V3 production runner | **byte-identical** |
| `godentist` | `ProductionMessagingAdapter` (parent) | godentist runner | **byte-identical** |
| `godentist-fb-ig` | `ProductionMessagingAdapter` (parent) | godentist-fb-ig runner | **byte-identical** |
| `somnio-recompra-v1` | `ProductionMessagingAdapter` (parent) | recompra runner | **byte-identical** |
| `somnio-sales-v3-pw-confirmation` | `ProductionMessagingAdapter` (parent) | pw-confirmation runner | **byte-identical** |
| `somnio-sales-v4` | `V4MessagingAdapter` (Plan 04) | `V4ProductionRunner` w/ CKPT-0..7 wired | **DORMANT in prod** (0 workspaces) |

Cron `v2-lock-cleanup-cron`: scans `lock:*` every 5 min. Only v4 creates locks → today the
cron sweeps nothing (no lock keys exist). Inert by default.

## Ship verdict

**APPROVED to merge to main** with the following EXPLICIT DEFERRALS documented in UAT.md
and signed off by the user (Jose Romero) on 2026-05-26:

1. **D-19 Phase 3** (Vercel preview + real WhatsApp smoke) → deferred to v4 activation
   moment per workspace.
2. **D-19 Phase 4** (sandbox visual smoke) → deferred to follow-up standalone
   `debounce-v2-sandbox-integration`.
3. **REVISION W4 S3 deferral** → Vitest-only coverage accepted; manual reproduction
   permanently deferred (no operational benefit without artificial hang-induction).

Pre-merge blockers cleared:

- No temporary `FORCE_V4_FOR_PHONE` override or similar test-only flag in code.
- No diagnostic routes leftover.
- Vercel Production + Preview env vars populated (Pitfall 5 isolation).
- REVISION B4: `src/lib/agents/registry-helpers.ts` exists; webhook handlers STATIC-import.
- REVISION W3: `grep -c "createAdminClient" src/lib/agents/engine/v4-production-runner.ts` == 0.
- REVISION B1: LockEventLabel union has 14 entries (includes `lock_orphan_swept_by_cron`).
- REVISION B2: Plan 06 `depends_on` lists `[01, 02, 04, 05]`.
- REVISION W7: keepTtl verdict recorded; Plan 04 V4MessagingAdapter uses the SUPPORTED branch.
- 8 D-18 CheckpointId placements wired across Plans 04+05.

## Blockers documented in LEARNINGS that must be cleared before merge

**None.** The user's decision to defer Phase 3 + Phase 4 to follow-up work means no
temporary code (override env-vars, diagnostic routes, etc.) is in the merge diff. All
"TEMPORARY OVERRIDE TO REMOVE" markers expected by 07-PLAN.md Task 7.5 are absent because
the override path was never taken.

## Self-Check: PASSED

- [x] `.planning/standalone/debounce-interruption-system-v2/LEARNINGS.md` exists, ≥150
  lines.
- [x] `.planning/standalone/debounce-interruption-system-v2/UAT.md` exists; contains
  literal `S3 deferral acknowledged: 2026-05-26 by user` and literal
  `debounce-v2-sandbox-integration`.
- [x] `.planning/standalone/debounce-interruption-system-v2/07-SUMMARY.md` exists (this
  file).
- [x] No source-code changes in this commit (Plans 01-06 module + adapters + sandbox
  remain locked).
- [x] No changes to STATE.md / ROADMAP.md / config.json / unrelated STATUS.md files.
- [x] Commit on `exec/debounce-v2-wave6` branch — orchestrator handles push to main.
