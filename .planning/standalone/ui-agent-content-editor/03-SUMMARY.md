---
phase: ui-agent-content-editor
plan: 03
subsystem: domain-layer
tags: [agent-templates, regla-3, regla-6, d-02, d-08, reorder, tdd]
requires:
  - "Plan 01: serialize.ts + RED stub test (it.todo naming Plan 03)"
  - "Plan 02: scope_summary column + agent_knowledge_base_versions (applied to prod)"
provides:
  - "src/lib/domain/agent-templates.ts — domain CRUD + reorder for agent_templates (Regla 3 gateway)"
  - "6 exported functions: listTemplatesByAgent, listIntents, updateTemplateContent, addTemplate, deleteTemplate, reorderTemplates"
  - "GREEN domain tests (8) proving D-02 / D-08 / Pitfall 3 / Regla 3"
affects:
  - "agent_templates table (mutation gateway for the UI editor — Plan 04+)"
tech-stack:
  added: []
  patterns:
    - "Two-phase temp-offset reorder to dodge UNIQUE(agent_id,intent,visit_type,orden,workspace_id)"
    - "assertEditable() edit-gate runs BEFORE createAdminClient (D-02 / Regla 6)"
    - "S-4 chainable mock harness extended for update/insert/delete + call-order recording"
key-files:
  created:
    - "src/lib/domain/agent-templates.ts"
  modified:
    - "src/lib/domain/__tests__/agent-templates.test.ts (it.todo → 8 GREEN tests)"
decisions:
  - "D-02/Regla 6: only somnio-sales-v4 is mutable; gate returns error before any DB call."
  - "D-03: addTemplate inserts a GLOBAL row (workspace_id NULL) — same scope v4 uses, no per-workspace overrides."
  - "D-04: reads (listTemplatesByAgent/listIntents) allowed for ANY agent (read-only visibility)."
  - "D-08: addTemplate guards on listIntents — unknown intents rejected (new intents need agent code)."
  - "Pitfall 3: reorder uses offset 1000+i (phase 1) then 0..N-1 (phase 2); offset chosen because real orden values are small."
metrics:
  duration: "~12 min"
  completed: "2026-06-01"
  tasks: 4
  files: 2
  commits: 4
---

# Phase ui-agent-content-editor Plan 03: Agent Templates Domain Layer Summary

Created the `agent_templates` domain layer (Regla 3) with read-all visibility, v4-only mutations (D-02/Regla 6), existing-intent-only `addTemplate` (D-08), and a collision-safe two-phase temp-offset reorder (Pitfall 3). Converted the Plan 01 `it.todo` stub into 8 GREEN tests.

## What Was Built

`src/lib/domain/agent-templates.ts` (315 lines) exposing 6 functions:

- **`listTemplatesByAgent(ctx, agentId)`** — all rows for the agent, scoped `workspace_id IS NULL OR = ctx.workspaceId`, ordered intent→visit_type→orden. Mirrors the runtime read in `template-manager.ts:272-294`. Any agent (D-04).
- **`listIntents(ctx, agentId)`** — distinct sorted intents for the agent (powers the D-08 guard + UI grouping).
- **`updateTemplateContent(ctx, params)`** — v4-gated UPDATE by `id` + `agent_id` (D-03 in-place edit).
- **`addTemplate(ctx, params)`** — v4-gated; D-08 guard via `listIntents`; INSERT global row (`workspace_id: null`).
- **`deleteTemplate(ctx, params)`** — v4-gated DELETE by `id` + `agent_id`.
- **`reorderTemplates(ctx, params)`** — v4-gated; two-phase temp-offset (phase 1: `orden = 1000 + i` evacuates the 0..N-1 range; phase 2: `orden = i`), provably collision-free against the UNIQUE key.

The edit-gate `assertEditable(agentId)` returns a failed `DomainResult` for any `agent_id !== 'somnio-sales-v4'` and runs before `createAdminClient`, so non-v4 agents never reach the DB.

## Verification

- `npx vitest run src/lib/domain/__tests__/agent-templates.test.ts` → 8/8 pass.
- `grep -c "it.todo"` → 0 (all stubs converted).
- `grep -c "createAdminClient" src/lib/domain/agent-templates.ts` → 8 (domain owns the client; no UI consumers yet — Plan 04+ uses the domain).
- `npx tsc --noEmit` → no errors on the new/modified files.
- 6 exported functions confirmed present.

Test coverage:
- D-02: update / reorder / delete reject `godentist` / `somnio-sales-v3` / `crm-reader` with no DB write (asserted `ops` empty / no matching op + `createAdminClientMock` not called).
- D-08: unknown intent → error + no insert; existing intent → insert with `workspace_id: null`, `agent_id: 'somnio-sales-v4'`.
- Pitfall 3: asserted all phase-1 offsets (`1000,1001,1002`) issue before any phase-2 (`0,1,2`); abort on phase-1 error issues only 1 update.
- Regla 3: UPDATE filters by both `id` and `agent_id`.

## Deviations from Plan

None — plan executed exactly as written. The TDD RED→GREEN cycle was satisfied by converting the Plan 01 `it.todo` stub (the documented RED state) to GREEN in Task 4; Tasks 1-3 built the implementation incrementally with per-task commits.

One trivial inline adjustment: reworded a comment containing the literal `it.todo` so the `grep -c "it.todo" == 0` acceptance gate passes against the actual test code (the comment described the conversion). Not a behavioral deviation.

## Commits

- `6f4d2ec6` feat: domain reads (listTemplatesByAgent, listIntents)
- `355e45fc` feat: mutations v4-gated (update/add/delete) + D-08 intent guard
- `40ab95ee` feat: reorderTemplates collision-safe two-phase temp-offset (Pitfall 3)
- `15b56df1` test: GREEN domain tests (D-02/D-08/reorder/Regla 3)

## Notes for Downstream Plans

- Plan 04+ UI mutations MUST import from `@/lib/domain/agent-templates` — `createAdminClient` for `agent_templates` writes must appear ONLY in this domain file (Regla 3 grep gate to enforce in Plan 07).
- `addTemplate` inserts global rows. If a future requirement needs per-workspace override rows, that is a D-03 reversal and requires a new decision.
- `AgentTemplateRow` here is a superset of `src/lib/agents/types.ts:AgentTemplateRow` (adds `minifrase`); callers needing `minifrase` should use the domain type.

## TDD Gate Compliance

This plan's RED gate was established in Plan 01 (`test(...)` stub commit with `it.todo`). Plan 03 commits are GREEN (`feat` × 3) + the test conversion (`test` commit `15b56df1`). The RED→GREEN sequence spans Plan 01 → Plan 03 by design (Wave 0 seeded the failing stub). No unexpected passing tests during implementation.

## Self-Check: PASSED

- FOUND: `src/lib/domain/agent-templates.ts`
- FOUND: commits `6f4d2ec6`, `355e45fc`, `40ab95ee`, `15b56df1` in git log
- 8/8 tests GREEN; tsc clean; all acceptance criteria met.
