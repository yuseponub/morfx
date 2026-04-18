---
phase: 44-crm-bots
plan: 05
subsystem: crm-bots
status: complete
tags: [crm-writer, two-step, propose-confirm, ai-sdk-v6, domain-layer, resource-not-found, idempotency]
dependency_graph:
  requires:
    - "44-01 (crm_bot_actions table + ToolModule/AgentId/TriggerKind extensions — applied in prod)"
    - "44-03 (archive helpers + existence-check getByIds in domain layer)"
  provides:
    - "src/lib/agents/crm-writer/ — full write-capable agent folder (10 files)"
    - "propose(input) entry point — returns {text, proposedActions, steps, agentId} without mutating business entities"
    - "confirm(ctx, actionId) entry point — idempotent execution via optimistic UPDATE"
    - "proposeAction + confirmAction lifecycle service (two-step.ts)"
    - "dispatchToolExecution — tool_name → domain function switch (14 cases)"
    - "createWriterTools — AI SDK v6 tool registry aggregator (14 tools)"
    - "CRM_WRITER_AGENT_ID export + agentRegistry self-registration"
    - "buildWriterSystemPrompt — documents PUEDE/NO PUEDE + 9-entity resource_not_found shape"
    - "ResourceType union covering tag|pipeline|stage|template|user|contact|order|note|task (Blocker 4)"
  affects:
    - "Plan 44-08 (writer HTTP routes) — unblocked; can import propose + confirm"
    - "Plan 44-06 (TTL cron) — unblocked; cron operates on the same crm_bot_actions rows"
    - "Plan 44-09 (integration tests) — unblocked; can exercise propose→confirm lifecycle"
tech_stack:
  added: []
  patterns:
    - "Two-step propose/confirm lifecycle with TTL=5min (strict for writer; 30s grace in cron per Plan 06)"
    - "Idempotent optimistic UPDATE (.eq('status','proposed')) — prevents double-execute races (Pitfall 3)"
    - "Dispatch switch with string literal cases — no dynamic dispatch (Threat T-44-05-09 mitigation)"
    - "Existence precheck via domain getByIds — zero createAdminClient in tool files (Blocker 1)"
    - "ResourceNotFoundError with entity-typed union + suggested_action variants (Blocker 4)"
    - "Self-registering agent module (side effect on import) — mirrors somnio/godentist pattern"
    - "completeTask as updateTask wrapper — single domain endpoint for status transitions"
key_files:
  created:
    - path: "src/lib/agents/crm-writer/types.ts"
      purpose: "WriterContext, WriterPreview, ProposedAction, ConfirmResult, full-9-entity ResourceType union, ResourceNotFoundError, WriterToolResult"
      lines: 78
    - path: "src/lib/agents/crm-writer/config.ts"
      purpose: "crmWriterConfig (AgentConfig) + CRM_WRITER_AGENT_ID export; 14 tool names enumerated for audit"
      lines: 86
    - path: "src/lib/agents/crm-writer/system-prompt.ts"
      purpose: "buildWriterSystemPrompt — PUEDE/NO PUEDE, resource_not_found shape with base vs mutable variants"
      lines: 65
    - path: "src/lib/agents/crm-writer/two-step.ts"
      purpose: "proposeAction (TTL 5min insert) + confirmAction (idempotent dispatch via optimistic UPDATE) + dispatchToolExecution switch"
      lines: 266
    - path: "src/lib/agents/crm-writer/tools/contacts.ts"
      purpose: "3 tools: createContact (prechecks tagIds), updateContact, archiveContact (both precheck contactId)"
      lines: 141
    - path: "src/lib/agents/crm-writer/tools/orders.ts"
      purpose: "4 tools: createOrder (pipeline+stage+contact prechecks), updateOrder, moveOrderToStage (order+stage prechecks), archiveOrder"
      lines: 255
    - path: "src/lib/agents/crm-writer/tools/notes.ts"
      purpose: "4 tools: createNote (contact precheck), updateNote, archiveNote, archiveOrderNote (no precheck — domain not_found at confirm)"
      lines: 112
    - path: "src/lib/agents/crm-writer/tools/tasks.ts"
      purpose: "3 tools: createTask (contact+order prechecks), updateTask, completeTask (dispatched as updateTask with status='completed')"
      lines: 125
    - path: "src/lib/agents/crm-writer/tools/index.ts"
      purpose: "createWriterTools aggregator merging the 4 factories"
      lines: 23
    - path: "src/lib/agents/crm-writer/index.ts"
      purpose: "propose() + confirm() entry points; self-registers crmWriterConfig in agentRegistry"
      lines: 114
  modified: []
decisions:
  - "TTL = 5 min (strict) in proposeAction — writer uses the strict window; Plan 06 cron applies 30s grace"
  - "14 dispatch cases — 13 distinct tools exposed to the LLM + 'completeTask' aliases to updateTask dispatch (single domain endpoint for all task status transitions)"
  - "Optimistic UPDATE .eq('status','proposed') appears 3 times — expire path, failure path, success path. Plan text says 'exactly 2' but the plan's own code snippet shows 3; the implementation follows the snippet since the failure-path UPDATE is a correctness requirement (Pitfall 3 race vs cron also applies to dispatch errors). Documented as plan-spec inconsistency in Deviations."
  - "createAdminClient is imported ONLY by two-step.ts (not by any tool file). This keeps Blocker 1 invariant: writer tool files never open a Supabase client; all existence checks go through Plan 03 domain getByIds. Tools reviewed: 0 raw Supabase imports in active code (2 matches found were inside block-comment JSDoc that describes the invariant)."
  - "updateNote / archiveNote / archiveOrderNote / updateTask / completeTask do NOT precheck entity existence — Plan 03 did not add getNoteById / getOrderNoteById / getTaskById helpers. Domain layer surfaces not_found at confirm time as status='failed'. Documented below as 'Minor Gap' — acceptable for V1; a follow-up can add those getByIds to the domain."
  - "completeTask proposeAction input is pre-transformed to { taskId, status: 'completed' } so the confirmAction dispatch (switch case 'completeTask' → updateTask) produces the correct domain call without needing another mapping layer."
  - "Agent registry compliance: crmWriterConfig includes PLACEHOLDER intentDetector + orchestrator system prompts to satisfy AgentConfig shape (Phase 13 requirement). The actual system prompt (buildWriterSystemPrompt) is passed to generateText directly — consistent with the godentist pattern which also uses placeholders and delegates real prompts to its pipeline."
  - "ResourceNotFoundError.resource_type union covers all 9 entity types (tag/pipeline/stage/template/user/contact/order/note/task) per Blocker 4. System prompt documents both suggested_action variants: 'create manually in UI' (for base resources writer cannot create) and 'propose create via crm-writer' (for mutable entities writer can propose to create)."
metrics:
  duration_minutes: 19
  completed_at: "2026-04-18T21:23:58Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 10
  lines_added: 1265
  commits: 3
---

# Phase 44 Plan 05: CRM Writer Agent — Two-Step Propose/Confirm Summary

## One-liner

Complete `src/lib/agents/crm-writer/` folder (10 files, 1,265 lines) — write-capable AI agent that uses the two-step propose→confirm lifecycle; every tool.execute calls `proposeAction` (inserting a `crm_bot_actions` row with `status='proposed'`) and NEVER mutates business entities directly; `confirmAction` dispatches via Regla-3 domain layer with idempotent optimistic UPDATE and surfaces `resource_not_found` across all 9 entity types (Blocker 4).

## What Shipped

### Task 1: Scaffold writer folder + two-step.ts lifecycle service

Four files — `types.ts`, `config.ts`, `system-prompt.ts`, `two-step.ts`.

- **`types.ts`** (78 lines): Discriminated unions for writer I/O. `ResourceType` covers all 9 entity types (Blocker 4 fix) so every tool returns the same shape regardless of which entity triggered the not-found. `ConfirmResult` is a 5-variant discriminated union (`executed | already_executed | expired | not_found | failed`). `WriterContext` carries `workspaceId + optional invoker`.
- **`config.ts`** (86 lines): `crmWriterConfig` registered under id `'crm-writer'` with Sonnet 4.5 for both intentDetector and orchestrator slots (PLACEHOLDER — real prompt comes from `buildWriterSystemPrompt`). Tools array enumerates 14 tool names for audit/observability. Stateless: `states=['idle']`, `validTransitions={idle: ['idle']}`.
- **`system-prompt.ts`** (65 lines): `buildWriterSystemPrompt(workspaceId)` documents PUEDE/NO PUEDE exactly per `agent-scope.md` BLOCKING rule. Explains the `resource_not_found` shape for all 9 entity types with both `suggested_action` variants: base resources → `'create manually in UI'`; mutable entities → `'propose create via crm-writer'`. Explicitly prohibits DELETE, WhatsApp, logistics robots, automations, and direct execution (two-step mandatory).
- **`two-step.ts`** (266 lines): Three functions.
  - `proposeAction(ctx, {tool, input, preview})`: inserts a `crm_bot_actions` row with `status='proposed'`, `expires_at = now + 5 min`, returns `{status, action_id, tool, preview, expires_at}`. Never mutates business entities.
  - `confirmAction(ctx, actionId)`: SELECT → check status / expiry → dispatch → optimistic UPDATE. Idempotent: second call returns `{status:'already_executed', output}` without re-invoking the domain function. Failure path also uses optimistic UPDATE against `status='proposed'` to prevent races with the expire cron (Plan 06).
  - `dispatchToolExecution`: literal switch over 14 tool names → calls the matching domain function with `ctx={workspaceId, source:'tool-handler'}` per Regla 3. No dynamic dispatch (T-44-05-09 mitigation).
  - `createAdminClient` is imported **only** here (operates on `crm_bot_actions`, the audit table — not a business entity).

### Task 2: Writer tool files — propose-only, domain prechecks (Blocker 1)

Five files in `tools/` — `contacts.ts`, `orders.ts`, `notes.ts`, `tasks.ts`, `index.ts`.

**Invariant enforced in code**: zero `createAdminClient`, zero `@supabase/*` imports, zero direct domain-write invocations in tool files. All existence prechecks go through Plan 03 domain getByIds (`getTagById`, `getContactById`, `getOrderById`, `getPipelineById`, `getStageById`).

**Tool inventory (14 tools total)**:

| File | Tools | Prechecks |
|------|-------|-----------|
| contacts.ts | createContact, updateContact, archiveContact | createContact → getTagById per tagId; update/archive → getContactById |
| orders.ts | createOrder, updateOrder, moveOrderToStage, archiveOrder | createOrder → getPipelineById + getStageById (optional) + getContactById (optional); updateOrder → getOrderById + getContactById (optional); moveOrderToStage → getOrderById + getStageById; archiveOrder → getOrderById |
| notes.ts | createNote, updateNote, archiveNote, archiveOrderNote | createNote → getContactById; update/archive variants have no precheck (Plan 03 lacks getNoteById — domain surfaces not_found at confirm) |
| tasks.ts | createTask, updateTask, completeTask | createTask → getContactById (optional) + getOrderById (optional); update/complete have no precheck (Plan 03 lacks getTaskById) |

Every tool returns one of:
- `ProposedAction` — happy path (`{status:'proposed', action_id, tool, preview, expires_at}`)
- `ResourceNotFoundError` — precheck found missing resource (`{status:'resource_not_found', resource_type, resource_id, suggested_action}`)
- `{status: 'error', message}` — unexpected lookup failure (DB error surfaced from domain getByIds)

### Task 3: Writer entry point — propose + confirm with generateText

One file — `index.ts` (114 lines).

- **`propose(input: WriterProposeInput)`**: runs AI SDK v6 `generateText` with `stopWhen: stepCountIs(5)`, `temperature: 0.2`. Collects all tool-result outputs whose `status === 'proposed'` into `proposedActions[]`. Returns `{text, proposedActions, steps, agentId: 'crm-writer'}`.
- **`confirm(ctx, actionId)`**: alias for `twoStepConfirm` (the `confirmAction` from `two-step.ts`). Preserves idempotency.
- **Self-registration**: `agentRegistry.register(crmWriterConfig)` executes on module import.
- **Exports**: `CRM_WRITER_AGENT_ID`, `crmWriterConfig`, `propose`, `confirm`, plus re-exports of types.

## Verification Results

All plan-level gates pass:

| Gate | Expected | Actual |
|------|----------|--------|
| `tsc --noEmit` errors in `src/lib/agents/crm-writer/` | 0 | 0 |
| Total tsc errors (project-wide, excluding pre-existing vitest/somnio tests) | 0 | 0 |
| Raw Supabase imports in `tools/` (active code) | 0 | 0 |
| Direct domain-write invocations in `tools/` (active code) | 0 | 0 |
| `proposeAction` calls in `tools/` | >= 13 | 20 |
| Domain getByIds calls in `tools/` | >= 5 | 24 |
| `resource_not_found` references in `tools/` | >= 4 | 22 |
| `ResourceType` union entities in `types.ts` | 9 | 9 distinct literals (tag, pipeline, stage, template, user, contact, order, note, task) |
| Dispatch switch cases in `two-step.ts` | 14 | 14 |
| `.eq('status', 'proposed')` count in `two-step.ts` | 2+ (plan snippet has 3) | 3 |
| System prompt contains `resource_not_found` | 1+ | 5 |
| System prompt contains both `suggested_action` variants | yes | yes (1 + 1) |
| `CRM_WRITER_AGENT_ID = 'crm-writer'` in config.ts | yes | yes |
| `agentRegistry.register(crmWriterConfig)` in index.ts | 1 | 1 |
| `stepCountIs(5)` in index.ts | 1+ | 2 |
| `PROPOSAL_TTL_MS = 5 * 60 * 1000` in two-step.ts | 1 | 1 |

### Blocker verifications

- **Blocker 1 (writer tools use domain getByIds, NOT raw createAdminClient)**: PASS. The 2 textual matches for `createAdminClient` / `@/lib/supabase/admin` inside `tools/` are both in block-comment JSDoc (`contacts.ts:11`, `orders.ts:7`) that *documents* the invariant. Zero matches in active code.
- **Blocker 4 (ResourceType covers all 9 entity types + same shape across tools)**: PASS. Single union in `types.ts`, used consistently by every tool's `ResourceNotFoundError` return. Task 2 no longer contradicts Task 1 — all tools emit the same shape regardless of entity.

## Success Criteria — all met

- [x] Agent registered under id `'crm-writer'` in `agentRegistry` (side effect on `index.ts` import)
- [x] `propose(input)` returns `{text, proposedActions, steps, agentId}` without mutating DB tables other than `crm_bot_actions` (via `proposeAction` insert)
- [x] `confirm(ctx, actionId)` dispatches to domain funcs; second call on same `action_id` returns `already_executed` without re-mutating (idempotent via optimistic UPDATE)
- [x] Every writer tool's `execute()` calls `proposeAction` — NONE import domain write funcs directly (verified via grep: zero active matches for `createContact\s*\(` etc.)
- [x] Existence pre-checks in `tool.execute` use domain getByIds, NOT raw `createAdminClient` (Blocker 1; 24 getByIds calls across tools)
- [x] `ResourceNotFoundError.resource_type` covers the full entity set (tag, pipeline, stage, template, user, contact, order, note, task) — Blocker 4
- [x] System prompt documents writer cannot create base resources + explicit `resource_not_found` error shape with all entity types
- [x] TTL = 5 minutes (strict for writer; grace period in Plan 06 cron)
- [x] All queries include `.eq('workspace_id')` — no cross-workspace writes (verified in `two-step.ts`: proposeAction's insert carries `workspace_id`; confirmAction's SELECT + every UPDATE filter by `ctx.workspaceId`)
- [x] `npx tsc --noEmit` passes for the full writer tree

## Git Commits

| Task | Commit | Type   | Message                                                                        |
| ---- | ------ | ------ | ------------------------------------------------------------------------------ |
| 1    | f258206 | feat   | scaffold crm-writer folder + two-step.ts lifecycle                             |
| 2    | 5a2bff5 | feat   | writer tool files (propose-only, domain prechecks)                             |
| 3    | 8068ee8 | feat   | writer entry point — propose + confirm with generateText                       |

Plus SUMMARY.md metadata commit below (added after Task 3).

## Dispatch Coverage Table (Regla 3 — Tool → Domain Function)

| tool_name          | Domain function                        | Domain file                |
| ------------------ | -------------------------------------- | -------------------------- |
| createContact      | createContact                          | src/lib/domain/contacts.ts |
| updateContact      | updateContact                          | src/lib/domain/contacts.ts |
| archiveContact     | archiveContact                         | src/lib/domain/contacts.ts |
| createOrder        | createOrder                            | src/lib/domain/orders.ts   |
| updateOrder        | updateOrder                            | src/lib/domain/orders.ts   |
| moveOrderToStage   | moveOrderToStage                       | src/lib/domain/orders.ts   |
| archiveOrder       | archiveOrder                           | src/lib/domain/orders.ts   |
| createNote         | createNote                             | src/lib/domain/notes.ts    |
| updateNote         | updateNote                             | src/lib/domain/notes.ts    |
| archiveNote        | archiveNote                            | src/lib/domain/notes.ts    |
| archiveOrderNote   | archiveOrderNote                       | src/lib/domain/notes.ts    |
| createTask         | createTask                             | src/lib/domain/tasks.ts    |
| updateTask         | updateTask                             | src/lib/domain/tasks.ts    |
| completeTask       | updateTask (with status='completed')   | src/lib/domain/tasks.ts    |

All 14 cases are covered by a literal `switch` on `row.tool_name`. Unknown tool name → `throw new Error('unknown_tool: ...')` → confirmAction catches → `status='failed'` with `error.code='dispatch_error'`.

## Deviations from Plan

### Auto-fixed Issues / Plan-Spec Notes

**1. [Plan-Spec Inconsistency — Rule 2] `.eq('status', 'proposed')` count**

- **Found during:** Task 1 verification
- **Issue:** The plan's `<verify>` block says "Optimistic UPDATE `.eq('status', 'proposed')` appears exactly 2 times in two-step.ts" (plan line 964). However, the plan's **own code snippet** for `two-step.ts` contains **three** such calls: one on the expire path (line 478), one on the failure path (line 498), and one on the success path (line 517). The verify grep would have failed if I'd followed the "exactly 2" assertion literally.
- **Fix:** Followed the plan's code snippet (3 occurrences) since the failure-path optimistic UPDATE is a correctness requirement — without it, a dispatch error racing with the expire cron could leave the row in an inconsistent state. This aligns with Pitfall 3 (double-confirm race) and Pitfall 7 (TTL race).
- **Files modified:** `src/lib/agents/crm-writer/two-step.ts`
- **Verification:** `grep -c "\.eq('status', 'proposed')" src/lib/agents/crm-writer/two-step.ts` → 3.
- **Committed in:** f258206 (Task 1 commit)

No Rule 1 / Rule 3 / Rule 4 deviations. No auth gates. No architectural changes.

### Minor Gap (documented, not a deviation)

**UpdateNote / ArchiveNote / ArchiveOrderNote / UpdateTask / CompleteTask do not precheck entity existence.**

Plan 03 added `getContactById`, `getOrderById`, `getTagById`, `getPipelineById`, `getStageById` — but not `getNoteById`, `getOrderNoteById`, or `getTaskById`. For the 5 affected tools:

- `updateNote` and `archiveNote` (contact notes)
- `archiveOrderNote` (order notes)
- `updateTask` and `completeTask`

...the tool skips the pretty `resource_not_found` precheck and relies on the domain layer's not-found handling. At confirm time, the domain function returns `{success: false, error: '...not encontrada'}`; `two-step.ts`'s `unwrap()` throws; `confirmAction` records `status='failed'` with `error.code='dispatch_error'` and the domain's Spanish error message in `crm_bot_actions.error`. The caller sees `{status:'failed', error:{code:'dispatch_error', message:'...'}}` — still structured, just less pretty than `resource_not_found`.

**Acceptable for V1.** Follow-up: add `getNoteById`, `getOrderNoteById`, `getTaskById` to the domain layer (small change, ~20 lines each) so all 14 tools can return the uniform `resource_not_found` shape at propose-time. Tracked informally — add to the v1.1 backlog.

## Threat Model Alignment

Every `mitigate` disposition in the plan's threat register is implemented:

| Threat ID | Category | Mitigation in code |
|-----------|----------|-------------------|
| T-44-05-01 | Tampering | Tools call `proposeAction` only. Grep invariant: zero direct domain-write invocations in active code of `tools/` (verified with comment-filtered grep). |
| T-44-05-02 | Elevation of Privilege | `confirmAction`'s SELECT filters `.eq('workspace_id', ctx.workspaceId)` (two-step.ts). Cross-workspace `action_id` returns `{status:'not_found'}`. |
| T-44-05-03 | Tampering (double-confirm race) | Optimistic UPDATE `.eq('status', 'proposed')` on the success path. Second caller gets 0 rows → reads current state → returns `already_executed`. |
| T-44-05-04 | DoS (TTL race) | `PROPOSAL_TTL_MS = 5 * 60 * 1000` in writer (strict). Plan 06 cron uses 30s grace. |
| T-44-05-05 | Elevation of Privilege (base-resource creation) | System prompt prohibits; tool prechecks verify existence via domain getByIds; writer can only return `resource_not_found` for tag/pipeline/stage with `suggested_action='create manually in UI'`. |
| T-44-05-06 | Info Disclosure (log leakage) | **accept** per plan. `logger.info` logs `actionId + tool + workspaceId` only — no `input_params`, no `preview`. |
| T-44-05-07 | Spoofing (fabricated action_id) | `action_id`s only come from `proposeAction`'s Supabase insert using `randomUUID()`. Hallucinated ids → `confirmAction` SELECT returns `not_found`. |
| T-44-05-08 | Repudiation | `crm_bot_actions.invoker` populated from `WriterContext.invoker` (`ctx.invoker ?? null` in insert). Plan 09 will verify population. |
| T-44-05-09 | Tampering (wrong dispatch) | `dispatchToolExecution` uses a literal `switch` on `toolName`. Unknown → `throw new Error('unknown_tool: ...')`. No dynamic lookup. |
| T-44-05-10 | Info Disclosure (cross-workspace tag/pipeline/stage leak) | Prechecks use Plan 03 domain getByIds which enforce workspace scoping. `getStageById` uses the two-query cross-workspace guard via parent pipeline. |

ASVS Level 1 maintained. No threats at high severity remain.

## Known Stubs

None. All 14 writer tools have full implementations. `crmWriterConfig.intentDetector.systemPrompt` and `orchestrator.systemPrompt` are PLACEHOLDER strings — but this is by design: the AgentConfig shape (Phase 13) requires both fields, while CRM Writer uses AI SDK v6 `generateText` and `buildWriterSystemPrompt` directly. The `godentist` agent uses the same pattern. Not a stub.

## Threat Flags

None. Every security-relevant surface (workspace scoping, two-step lifecycle, optimistic concurrency, resource-not-found semantics) is documented in the plan's `<threat_model>` and implemented as specified. No new surfaces.

## Push-to-Vercel Safety

**BLOCKED on Plan 01 Task 5 + Plan 03 Task 1 migrations being confirmed in production** (per CLAUDE.md Regla 5 + plan's `requirements` field):

- `crm_bot_actions` table (Plan 01) — MUST exist in prod before `proposeAction` / `confirmAction` run
- `archived_at` columns on contacts/orders/contact_notes/order_notes (Plan 03) — MUST exist so `archiveContact` / `archiveOrder` / `archiveNote` / `archiveOrderNote` don't fail at confirm time

Per this worktree's constraints: DO NOT push from this branch. The orchestrator owns the merge to `main` and subsequent push. Both migrations are listed as already-applied in Plan 01 SUMMARY (Task 5 confirmed) and Plan 03 SUMMARY (Task 1 Step B confirmed), so the orchestrator can push the merged worktree whenever it's ready.

## Next Phase Readiness

- **Plan 44-06 (TTL expire cron)**: Unblocked. Cron will `UPDATE crm_bot_actions SET status='expired' WHERE status='proposed' AND expires_at < now() - interval '30 seconds'` — the writer's strict 5-min TTL and 30s grace work together (Pitfall 7 mitigation).
- **Plan 44-08 (HTTP routes)**: Unblocked. Can import `propose` / `confirm` / `CRM_WRITER_AGENT_ID` from `@/lib/agents/crm-writer`. The propose route wraps `propose()` in `runWithCollector({agentId:'crm-writer', triggerKind:'api'})`; the confirm route wraps `confirm(ctx, actionId)` similarly. Both routes rely on middleware-set `x-workspace-id` (from Plan 01 Task 4).
- **Plan 44-09 (integration tests)**: Unblocked. Test vectors available: propose→confirm happy path; double-confirm race returns `already_executed`; expired TTL returns `expired`; cross-workspace action_id returns `not_found`; `resource_not_found` triggers for both base (tag/pipeline/stage) and mutable (contact/order) entities.

## Self-Check

Verifying all claims in this SUMMARY are grounded in the filesystem + git history.

### Created files exist

- `src/lib/agents/crm-writer/types.ts` — FOUND (78 lines)
- `src/lib/agents/crm-writer/config.ts` — FOUND (86 lines)
- `src/lib/agents/crm-writer/system-prompt.ts` — FOUND (65 lines)
- `src/lib/agents/crm-writer/two-step.ts` — FOUND (266 lines)
- `src/lib/agents/crm-writer/tools/contacts.ts` — FOUND (141 lines)
- `src/lib/agents/crm-writer/tools/orders.ts` — FOUND (255 lines)
- `src/lib/agents/crm-writer/tools/notes.ts` — FOUND (112 lines)
- `src/lib/agents/crm-writer/tools/tasks.ts` — FOUND (125 lines)
- `src/lib/agents/crm-writer/tools/index.ts` — FOUND (23 lines)
- `src/lib/agents/crm-writer/index.ts` — FOUND (114 lines)

### Commits exist in git log

- f258206 — FOUND (Task 1)
- 5a2bff5 — FOUND (Task 2)
- 8068ee8 — FOUND (Task 3)

### Verification commands (re-runnable)

```bash
[ -f src/lib/agents/crm-writer/index.ts ] && echo FOUND
[ -f src/lib/agents/crm-writer/two-step.ts ] && echo FOUND
grep -c "export async function proposeAction" src/lib/agents/crm-writer/two-step.ts           # 1
grep -c "export async function confirmAction" src/lib/agents/crm-writer/two-step.ts           # 1
grep -c "\.eq('status', 'proposed')" src/lib/agents/crm-writer/two-step.ts                    # 3
grep -c "PROPOSAL_TTL_MS = 5 \* 60 \* 1000" src/lib/agents/crm-writer/two-step.ts             # 1
grep -c "resource_not_found" src/lib/agents/crm-writer/system-prompt.ts                       # 5
grep -c "CRM_WRITER_AGENT_ID = 'crm-writer'" src/lib/agents/crm-writer/config.ts              # 1
grep -cE "'tag'|'pipeline'|'stage'|'template'|'user'|'contact'|'order'|'note'|'task'" src/lib/agents/crm-writer/types.ts  # >= 9
grep -rnE "createAdminClient|@supabase/supabase-js|@/lib/supabase/admin" src/lib/agents/crm-writer/tools/ | grep -vE "^[^:]+:[0-9]+:\s*(\* | \*|//)" | wc -l  # 0
grep -rnE "getTagById|getPipelineById|getStageById|getContactById|getOrderById" src/lib/agents/crm-writer/tools/ | wc -l  # 24
grep -rn "proposeAction" src/lib/agents/crm-writer/tools/ | wc -l                             # 20
npx tsc --noEmit 2>&1 | grep "src/lib/agents/crm-writer" | wc -l                              # 0
git log --oneline | grep -E "f258206|5a2bff5|8068ee8"                                         # 3 matches
```

All above conditions have been verified during execution.

**Self-Check: PASSED**.

---

*Phase: 44-crm-bots*
*Plan: 05*
*Completed: 2026-04-18T21:23:58Z*
*Duration: 19 min (3 tasks, 10 files created, 1,265 lines)*
