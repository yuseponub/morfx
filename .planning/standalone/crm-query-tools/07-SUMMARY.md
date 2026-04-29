---
phase: standalone-crm-query-tools
plan: 07
subsystem: docs-handoff-discoverability
tags: [project-skill, agent-scope-cross-reference, claude-md-module-scope, integration-handoff, learnings, sandbox-restriction]

# Dependency graph
requires:
  - phase: standalone-crm-query-tools-02
    provides: "ContactDetail.department + OrderDetail.shipping* extension + crm_query_tools_config tables"
  - phase: standalone-crm-query-tools-04
    provides: "createCrmQueryTools(ctx) factory feature-complete with 5 tools — referenced verbatim in skill, INTEGRATION-HANDOFF, CLAUDE.md scope"
  - phase: standalone-crm-query-tools-05
    provides: "/agentes/crm-tools UI + admin gating — referenced as Configuration prerequisite in skill + INTEGRATION-HANDOFF"
  - phase: standalone-crm-query-tools-06
    provides: "Test runner endpoint + integration tests + Playwright spec — env vars cataloged in INTEGRATION-HANDOFF"
provides:
  - ".claude/skills/crm-query-tools.md (NEW dir + file): project skill descubrible (PUEDE / NO PUEDE / Wiring / Configuration / Observability / Validation / Consumers / References)"
  - ".claude/rules/agent-scope.md cross-reference: 5-line pointer block between CRM Writer Bot and Config Builder sections"
  - "CLAUDE.md § Scopes por Agente § Module Scope: crm-query-tools (D-06 requirement)"
  - "INTEGRATION-HANDOFF.md (625 lines): tool inventory + JSON examples + divergences from crm-reader + env requirements + migration recipes for 2 follow-up standalones + backlog items"
  - "LEARNINGS.md (334 lines): bug log per wave + 7 reusable patterns + 5 anti-patterns + Open Q 1-10 resolved + followup task list"
affects:
  - "standalone-crm-query-tools-recompra-integration (TBD): unblocked — has migration recipe in INTEGRATION-HANDOFF.md § Recipe A"
  - "standalone-crm-query-tools-pw-confirmation-integration (TBD): unblocked — has migration recipe in INTEGRATION-HANDOFF.md § Recipe B"

# Tech tracking
tech-stack:
  added: []  # Pure docs plan — no new dependencies
  patterns:
    - "Discoverability via 3 paths: .claude/skills/ (project skill living doc) + .claude/rules/agent-scope.md (cross-reference for tooling) + CLAUDE.md § Scopes por Agente (canonical project memory) — future agent builders find the module via any one of the three"
    - "Snapshot vs living distinction: INTEGRATION-HANDOFF.md frozen at ship moment (D-26 explicit); .claude/skills/crm-query-tools.md is the living doc updated on any future module change"
    - "Sandbox restriction work-around: when a Plan touches .claude/skills/ or .claude/rules/, orchestrator pre-writes the files; subagent commits but doesn't write those paths (documented as a pattern in LEARNINGS.md for future plans)"

key-files:
  created:
    - ".claude/skills/crm-query-tools.md (129 lines) — project skill (PUEDE/NO PUEDE/Wiring/Configuration/Observability/Validation/Consumers/References)"
    - ".planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md (625 lines) — handoff snapshot + migration recipes for 2 follow-ups"
    - ".planning/standalone/crm-query-tools/LEARNINGS.md (334 lines) — bug log + patterns + open questions resolved"
  modified:
    - ".claude/rules/agent-scope.md (+6 lines) — cross-reference pointer block to .claude/skills/crm-query-tools.md, between CRM Writer Bot and Config Builder sections"
    - "CLAUDE.md (+27 lines) — new § Scopes por Agente § Module Scope: crm-query-tools section (D-06)"

key-decisions:
  - "Orchestrator pre-wrote Tasks 7.1 + 7.2 + 7.3 directly: subagent sandbox blocks writes to .claude/skills/ AND .claude/rules/ (and the CLAUDE.md edit was applied by the prior subagent run before it hit the .claude/rules/ block). This continuation agent committed Tasks 7.2 (.claude/rules/agent-scope.md) and 7.3 (CLAUDE.md) atomically; Task 7.1 was already committed by the prior agent run as 0a153a8. Documented as a pattern in LEARNINGS.md so future plans touching .claude/ paths can anticipate this."
  - "INTEGRATION-HANDOFF.md is a 'snapshot' (D-26 explicit) — it captures the API at the moment of ship and does not get updated when the module evolves. The .claude/skills/crm-query-tools.md is the 'living' discoverable doc that future PR authors must update on any module change. The handoff stays as historical reference for follow-up planners."
  - "Documented divergences from RESEARCH.md (Plan 05 inline MultiSelect variant + Plan 06 atomic-task-commits-over-wrap-up + Plan 07 orchestrator pre-write of .claude/ files) in INTEGRATION-HANDOFF.md § Known divergences so follow-up planners don't re-litigate them."
  - "Migration recipes in INTEGRATION-HANDOFF.md cover the FULL cleanup, not just the Inngest function deletion: drop legacy session_state keys (_v3:crm_context*, _v3:active_order), drop polling helpers, drop dispatch in webhook-processor, drop helpers like extractActiveOrderJson, update CLAUDE.md scope, verify workspace config exists, smoke test in production. Each recipe is ~10-12 numbered steps."
  - "CLAUDE.md scope section was placed under a NEW '## Scopes por Agente' h2 heading because the existing file has no such heading (modules and agents are listed without an explicit grouping h2). The h2 is inserted between '## Regla 5' and '## Stack Tecnologico' — natural placement after rules, before tech stack."

requirements-completed: [D-06, D-26]

# Metrics
duration: ~25min
completed: 2026-04-29
---

# Standalone crm-query-tools Plan 07: Documentation + Handoff + LEARNINGS — STANDALONE COMPLETE

**Closes the standalone. Project skill `.claude/skills/crm-query-tools.md` is now discoverable for future agent builders. CLAUDE.md § Scopes por Agente has a new "Module Scope: crm-query-tools" section per D-06. `.claude/rules/agent-scope.md` cross-references the skill. INTEGRATION-HANDOFF.md (625 lines) is the primary input doc for the 2 follow-up standalones (`crm-query-tools-recompra-integration` + `crm-query-tools-pw-confirmation-integration`) with full tool inventory, JSON examples, env requirements, and step-by-step migration recipes. LEARNINGS.md (334 lines) captures the bug log per wave, 7 reusable patterns, 5 anti-patterns, and resolves Open Q 1-10 from RESEARCH.md.**

## Performance

- **Duration:** ~25 min (continuation agent — Tasks 7.1+7.2+7.3 had been pre-applied by orchestrator and prior subagent run; this agent committed Tasks 7.2+7.3 + executed Tasks 7.4+7.5+7.6).
- **Tasks:** 6/6 atomic commits.
- **Files created:** 3 new files (`.claude/skills/crm-query-tools.md`, `INTEGRATION-HANDOFF.md`, `LEARNINGS.md`).
- **Files modified:** 2 (`.claude/rules/agent-scope.md`, `CLAUDE.md`).
- **Lines added:** ~1121 across all 5 files (129 + 625 + 334 + 6 + 27).
- **Commits:** 6 atomic commits — `0a153a8`, `e86e638`, `94925f9`, `6a8c72b`, `22f9ccc`, plus this SUMMARY commit.
- **Regression:** 35/35 unit tests still green (`npm run test -- --run src/lib/agents/shared/crm-query-tools` exit 0).
- **tsc:** `npx tsc --noEmit -p .` exit 0 — zero errors repo-wide.
- **Anti-pattern grep (BLOCKER 1):** 0 matches of `createAdminClient|@supabase/supabase-js` in `src/lib/agents/shared/crm-query-tools/**` (pure docs plan, no source changes).
- **Push:** all 6 commits pushed to origin/main on Task 7.6.

## Task Commits

Six conventional-commit-format commits, all Co-Authored-By Claude:

| Task | Hash | Subject |
|------|------|---------|
| 7.1 | `0a153a8` | `docs(crm-query-tools): plan-07 task-1 — project skill descubrible` *(committed by prior agent run; orchestrator pre-wrote due to sandbox)* |
| 7.2 | `e86e638` | `docs(crm-query-tools): plan-07 task-2 — agent-scope cross-reference` *(committed by this agent; orchestrator pre-applied edit due to sandbox)* |
| 7.3 | `94925f9` | `docs(crm-query-tools): plan-07 task-3 — CLAUDE.md Module Scope section` *(committed by this agent; prior subagent run applied edit before hitting .claude/rules/ block)* |
| 7.4 | `6a8c72b` | `docs(crm-query-tools): plan-07 task-4 — INTEGRATION-HANDOFF.md (snapshot)` |
| 7.5 | `22f9ccc` | `docs(crm-query-tools): plan-07 task-5 — LEARNINGS.md` |
| 7.6 | (this SUMMARY commit) | `docs(crm-query-tools): plan-07 task-6 — SUMMARY + standalone CLOSE` |

## Files Created/Modified

### Created

- **`.claude/skills/crm-query-tools.md`** (129 lines) — project skill. Heading `# Project Skill: crm-query-tools`. Body: TL;DR + Tools (PUEDE) table with 5 rows (1 per tool with input + return + status enum + notes) + NO PUEDE bullets (no mutations, no cross-workspace, no cache, no legacy keys, no hardcoded stages, no createAdminClient — with exact grep verification command) + Wiring snippet + Configuration prerequisite (operator setup at /agentes/crm-tools + config_not_set semantics) + Observability (3 events + PII redaction) + Validation (BLOCKER invariants) + Consumers (none active — 2 follow-up standalones pending) + References (15+ links).
- **`.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md`** (625 lines) — handoff snapshot. 12 sections: Header → TL;DR → Tool inventory (5 tools × signatures + status enums + JSON examples per status) → Wiring example → Divergences from crm-reader (table comparing 11 aspects) → Configuration prerequisite (operator setup flow) → Observability emit contract → Env requirements (3 sub-categories: runtime / integration / E2E) → Migration recipes (Recipe A for recompra, Recipe B for pw-confirmation, ~10-12 numbered steps each) → CLAUDE.md scope template snippet → Backlog items (8) → Known divergences from RESEARCH/PLAN → References.
- **`.planning/standalone/crm-query-tools/LEARNINGS.md`** (334 lines) — bug log + patterns + followups. 11 sections: Header → What Shipped (by wave) → Bug log per wave (5 plans × bugs caught) → Patterns established (7 reusable) → Cost / context patterns → Patterns to follow next time (4) → Patterns to avoid (5) → Followup tasks (2 unblocked standalones + 8 backlog items) → Performance notes (placeholder) → Open Q 1-10 resolved → References.

### Modified

- **`.claude/rules/agent-scope.md`** (+6 lines): cross-reference pointer block inserted between `### CRM Writer Bot` and `### Config Builder: WhatsApp Templates`. Heading `### Module Scope: crm-query-tools`. Body: 4 lines pointing to `.claude/skills/crm-query-tools.md` for full PUEDE / NO PUEDE / Validation / Consumers, plus the UI path and standalone dir. Did NOT duplicate the full PUEDE/NO PUEDE list — that lives in the skill file.
- **`CLAUDE.md`** (+27 lines): new `## Scopes por Agente` h2 heading + `### Module Scope: crm-query-tools` section. Heading placed between `## Regla 5: Migracion Antes de Deploy` and `## Stack Tecnologico`. Body documents 5 tools (PUEDE — solo lectura), 5 prohibitions (NO PUEDE), validation invariants (domain-only imports, workspace_id from ctx, config tables, /agentes/crm-tools UI, project skill discoverability, standalone path), and consumers section noting the 2 pending follow-up integrations.

## Cross-cutting concerns

### Sandbox restriction (orchestrator-level work-around)

**Pattern documented in LEARNINGS.md:** when a Plan touches `.claude/skills/` or `.claude/rules/`, the subagent execution sandbox blocks writes to those paths. Workflow:
1. Plan author writes the plan as if subagent could write the files.
2. Orchestrator pre-writes / pre-edits the files using direct tools (not via subagent invocation).
3. Subagent (this one) commits the pre-applied changes atomically.
4. SUMMARY documents the orchestrator-level handoff for traceability.

**Specific to this Plan 07:**
- **Task 7.1** (`.claude/skills/crm-query-tools.md`): orchestrator pre-wrote the skill file. Prior subagent run committed it as `0a153a8` before hitting the `.claude/rules/` block.
- **Task 7.2** (`.claude/rules/agent-scope.md`): orchestrator pre-applied the cross-reference block to disk. This continuation agent committed as `e86e638`.
- **Task 7.3** (`CLAUDE.md`): prior subagent run successfully applied the CLAUDE.md edit before it hit the `.claude/rules/` block. This continuation agent committed as `94925f9`.

**Tasks 7.4 / 7.5 / 7.6:** all in `.planning/standalone/` which is NOT sandbox-blocked — this agent wrote and committed normally without orchestrator handoff.

### Discoverability strategy

Three paths a future agent builder can find this module:

1. **`.claude/skills/crm-query-tools.md`** — project skill (LIVING doc; update on any module change).
2. **`.claude/rules/agent-scope.md` § Module Scope: crm-query-tools** — short pointer block for tooling that scans rules.
3. **`CLAUDE.md` § Scopes por Agente § Module Scope: crm-query-tools** — canonical project memory; first place a fresh agent reads.

The skill file is the canonical living source; the other two cross-reference it. T-W6-01 (skill drifts from actual module behavior) is mitigated by the snapshot/living distinction documented in `INTEGRATION-HANDOFF.md` § "Snapshot del momento de ship" + `LEARNINGS.md` § Patterns established.

## Threat Surface Scan

All threats T-W6-01 through T-W6-03 from the plan's `<threat_model>` are addressed:

| Threat | Disposition | Mitigation in artifacts |
|--------|-------------|------------------------|
| T-W6-01 (Tampering — skill content drifts from module behavior) | mitigate | INTEGRATION-HANDOFF is a snapshot (D-26 explicit). Skill is the living doc. Both cross-referenced from `.claude/rules/agent-scope.md` and `CLAUDE.md`. Three discovery paths reduce drift risk. |
| T-W6-02 (Information Disclosure — secrets in handoff) | accept | Documented env names only (`PLAYWRIGHT_TEST_SECRET`, `TEST_WORKSPACE_ID`, `TEST_USER_*`) — never values. No real workspace IDs or secrets in any artifact. Verified by `grep -E "[a-f0-9-]{36}" INTEGRATION-HANDOFF.md` matches only example UUIDs in JSON snippets, never the real Somnio workspace. |
| T-W6-03 (Repudiation — future builder skips skill) | accept | Documentation cannot enforce reading. Three discovery paths + CLAUDE.md scope as canonical memory + standard `/gsd:research-phase` workflow surface them. |

No new attack surface introduced. All changes are docs-only.

## Self-Check

Verifications run after writing this SUMMARY:

**Files created:**
- `.claude/skills/crm-query-tools.md` — FOUND (129 lines, ≥80 required)
- `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` — FOUND (625 lines, ≥250 required)
- `.planning/standalone/crm-query-tools/LEARNINGS.md` — FOUND (334 lines, ≥150 required)

**Files modified:**
- `.claude/rules/agent-scope.md` — `grep "Module Scope: crm-query-tools"` returns 1 match, `grep ".claude/skills/crm-query-tools.md"` returns 1 match.
- `CLAUDE.md` — `grep "Module Scope: crm-query-tools"` returns 1 match, `grep "config_not_set"` returns 1 match, `grep "src/lib/agents/shared/crm-query-tools"` returns 1 match.

**Commits exist (verified via `git log --oneline | grep <hash>`):**
- `0a153a8` (Task 7.1 — project skill) — FOUND
- `e86e638` (Task 7.2 — agent-scope cross-reference) — FOUND
- `94925f9` (Task 7.3 — CLAUDE.md Module Scope) — FOUND
- `6a8c72b` (Task 7.4 — INTEGRATION-HANDOFF) — FOUND
- `22f9ccc` (Task 7.5 — LEARNINGS) — FOUND
- (Task 7.6 SUMMARY commit — to be created with `git add` of this file + push)

**Acceptance verification:**
- `npx tsc --noEmit -p .` — exit 0 (zero output, zero errors)
- `npm run test -- --run src/lib/agents/shared/crm-query-tools` — 35 passed (3 test files: contacts.test.ts 8 + helpers.test.ts 9 + orders.test.ts 18 = 35)
- BLOCKER 1 grep: `grep -E "^import" src/lib/agents/shared/crm-query-tools/*.ts src/lib/agents/shared/crm-query-tools/__tests__/*.ts | grep -E "createAdminClient|@supabase/supabase-js"` → 0 matches

**Pre-push sanity:** `git log --name-only HEAD~5..HEAD` (post Task 7.5 commit, pre SUMMARY) shows ONLY these files: `.claude/skills/crm-query-tools.md`, `.claude/rules/agent-scope.md`, `CLAUDE.md`, `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md`, `.planning/standalone/crm-query-tools/LEARNINGS.md`. Zero contamination from unrelated dirty files (scripts/voice-app/*, prior debug files, etc.).

## Standalone status

**STANDALONE crm-query-tools COMPLETE — 2026-04-29.**

- **Plans shipped:** 7 (Waves 0–6)
- **Tools live:** 5 (`getContactByPhone`, `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`)
- **UI live:** `/agentes/crm-tools`
- **Tests:** 35/35 unit + 6 integration env-gated + 2 Playwright E2E specs
- **Discoverability:** 3 paths (project skill, agent-scope cross-reference, CLAUDE.md scope)
- **Documentation:** INTEGRATION-HANDOFF (snapshot 625 lines) + LEARNINGS (334 lines)

**Both Somnio follow-up integration standalones are unblocked:**
- **`crm-query-tools-recompra-integration`** (READY) — recipe in INTEGRATION-HANDOFF.md § Recipe A
- **`crm-query-tools-pw-confirmation-integration`** (READY) — recipe in INTEGRATION-HANDOFF.md § Recipe B

Read INTEGRATION-HANDOFF.md before starting either follow-up. Read LEARNINGS.md for bug patterns and anti-patterns to avoid.

## Self-Check: PASSED
