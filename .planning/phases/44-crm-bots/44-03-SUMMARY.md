---
phase: 44-crm-bots
plan: 03
subsystem: crm-bots
status: complete
tags: [domain-layer, migration, soft-delete, archive, crm-bots]
dependency_graph:
  requires:
    - "Phase 18 domain layer (src/lib/domain/*)"
    - "contacts, orders, contact_notes, order_notes tables (Phase 1-3 migrations)"
  provides:
    - "archived_at column on contacts/orders/contact_notes/order_notes (migration applied in prod)"
    - "archiveContact, archiveOrder, archiveNote, archiveOrderNote domain funcs"
    - "searchContacts, getContactById read helpers"
    - "listOrders, getOrderById read helpers"
    - "listPipelines, listStages, getPipelineById, getStageById (new file)"
    - "listTags, getTagById read helpers"
  affects:
    - "Plans 04/05/06/08 unblocked — can import every read + write primitive from @/lib/domain/*"
tech_stack:
  added: []
  patterns: ["soft-delete via archived_at", "partial index (WHERE archived_at IS NULL)", "workspace-scoped reads with archived filter default-off", "two-query cross-workspace guard (getStageById)"]
key_files:
  created:
    - supabase/migrations/20260418201445_crm_archive_columns.sql
    - src/lib/domain/pipelines.ts
  modified:
    - src/lib/domain/contacts.ts
    - src/lib/domain/orders.ts
    - src/lib/domain/notes.ts
    - src/lib/domain/tags.ts
decisions:
  - "Additive-only migration — archived_at nullable, zero ALTER/DROP of existing columns"
  - "4 partial indexes WHERE archived_at IS NULL to optimize the most frequent listing pattern (active rows only)"
  - "pipeline_stages.position is the correct column name (not order as the plan example suggested); listPipelines and listStages use position, documented in a NOTE block at top of pipelines.ts"
  - "getStageById uses a two-query cross-workspace guard (T-44-03-07): fetch stage globally, then confirm parent pipeline.workspace_id matches ctx.workspaceId; returns data=null for both not-found and cross-workspace (pitfall 4 alignment)"
  - "All archive* funcs are idempotent — repeated calls on an already-archived row return the existing timestamp, not an overwrite"
  - "archiveNote logs note_archived to contact_activity BEFORE flipping archived_at — mirrors deleteNote's log-before-act pattern"
  - "searchContacts escapes PostgREST OR-filter special chars (, ) % in the ILIKE query to prevent filter-syntax injection / broken queries"
metrics:
  duration_minutes: 30
  completed_date: 2026-04-18
  tasks_completed: 5
  tasks_total: 5
  commits_total: 5
  domain_funcs_added: 12
  lines_added_domain: 837
---

# Phase 44 Plan 03: CRM Bots Archive Columns + Domain Helpers Summary

## One-liner

Additive `archived_at` migration applied in production (4 columns + 4 partial indexes), and 12 new domain helpers delivered across 5 files so Plans 04/05 tool handlers can import every read + write primitive from `@/lib/domain/*` without any direct `createAdminClient()` call in tool files.

## What Was Completed

### Task 1: Migration created + applied in production

File: `supabase/migrations/20260418201445_crm_archive_columns.sql`

Contents:
- 4 × `ALTER TABLE … ADD COLUMN archived_at TIMESTAMPTZ NULL` (contacts, orders, contact_notes, order_notes)
- 4 × `CREATE INDEX idx_<table>_active … WHERE archived_at IS NULL` (partial index for "only active rows" queries)
- 4 × `COMMENT ON COLUMN` documenting purpose
- Zero `ALTER`/`DROP` of existing columns — fully additive

User-confirmed resume signal: `crm_archive_columns applied — 4 columns, 4 indexes, 0 archived rows`

Sanity check results (verified in production Supabase):
- 4 tables with `archived_at` column: `contacts`, `contact_notes`, `order_notes`, `orders`
- 4 indexes present: `idx_contact_notes_active`, `idx_contacts_active`, `idx_order_notes_active`, `idx_orders_active`
- Rows with `archived_at IS NOT NULL`: 0 in each of the 4 tables

Commit: `63308f1` — `feat(44-03): add crm archive columns migration`

### Task 2: archiveContact + searchContacts + getContactById

File: `src/lib/domain/contacts.ts` (442 → 658 lines, +216)

Three new exports:
1. `archiveContact(ctx, {contactId})` → `DomainResult<{contactId, archivedAt}>` — idempotent soft-delete, workspace-scoped on both the existence SELECT and the UPDATE.
2. `searchContacts(ctx, {query, includeArchived?, limit?})` → `DomainResult<ContactListItem[]>` — ILIKE over `phone`, `email`, `name`; default `includeArchived=false` so archived rows are invisible. Escapes `, ( ) %` in the query to prevent PostgREST OR-filter parse breakage.
3. `getContactById(ctx, {contactId, includeArchived?})` → `DomainResult<ContactDetail | null>` — includes tags (flattened from the `contact_tags(tag_id, tags(id,name))` embed handling Supabase's nested-object-vs-array quirk) + `custom_fields`. Returns `{success:true, data:null}` for not-found so callers can distinguish DB error from missing resource.

Commit: `988bb64` — `feat(44-03): add archiveContact + searchContacts + getContactById`

### Task 3: archiveOrder + listOrders + getOrderById

File: `src/lib/domain/orders.ts` (1477 → 1691 lines, +214)

Three new exports:
1. `archiveOrder(ctx, {orderId})` — idempotent soft-delete.
2. `listOrders(ctx, {pipelineId?, stageId?, contactId?, includeArchived?, limit?, offset?})` — filtered, paginated, default excludes archived, `.range(offset, offset+limit-1)` with `limit` clamped [1,50].
3. `getOrderById(ctx, {orderId, includeArchived?})` — includes `order_products` embed mapped to `{id, sku, title, unitPrice, quantity, subtotal}`, hides archived unless requested.

Commit: `ecd82c1` — `feat(44-03): add archiveOrder + listOrders + getOrderById`

### Task 4: archiveNote + archiveOrderNote

File: `src/lib/domain/notes.ts` (584 → 718 lines, +134)

Two new exports:
1. `archiveNote(ctx, {noteId})` — soft-deletes `contact_notes`. Before flipping `archived_at`, inserts a `note_archived` row into `contact_activity` with the original note's `contact_id`, `user_id`, and a 100-char `preview` of the content — mirroring the existing `deleteNote` "log before act" pattern.
2. `archiveOrderNote(ctx, {noteId})` — soft-deletes `order_notes`. No activity log (symmetric with `deleteOrderNote`, which also emits none).

Both idempotent, both workspace-scoped on existence SELECT and UPDATE.

Commit: `aa417f6` — `feat(44-03): add archiveNote + archiveOrderNote`

### Task 5: listTags + getTagById + new pipelines.ts

Files:
- `src/lib/domain/tags.ts` (282 → 345 lines, +63)
- `src/lib/domain/pipelines.ts` (NEW, 210 lines)

Tags additions:
1. `listTags(ctx)` — workspace-scoped list ordered by `name`.
2. `getTagById(ctx, {tagId})` — existence check, returns `data: null` on success when not found.

New pipelines module (read-only per agent-scope.md — writer cannot create base resources):
1. `listPipelines(ctx)` → `DomainResult<PipelineWithStages[]>` — embeds `pipeline_stages(id, name, position)` and sorts by `position` in JS (since the Postgres embed does not let us order the nested rows directly on the join).
2. `listStages(ctx, {pipelineId})` — verifies pipeline ownership first (cross-workspace guard), then lists stages ordered by `position`.
3. `getPipelineById(ctx, {pipelineId})` — workspace-scoped fetch.
4. `getStageById(ctx, {stageId})` — two-query pattern: fetch stage globally, then verify parent pipeline's `workspace_id` matches `ctx.workspaceId`. Returns `data: null` for both "stage does not exist" and "stage belongs to another workspace" — by design indistinguishable to the caller (T-44-03-07 mitigation).

Commit: `053dfc3` — `feat(44-03): add read helpers to tags.ts + new domain/pipelines.ts`

## Git Commits

| Task | Scope | Commit | Files |
|------|-------|--------|-------|
| Task 1 Step A | Migration file | `63308f1` | `supabase/migrations/20260418201445_crm_archive_columns.sql` |
| Task 1 Step B | Migration applied in prod (user-gated) | n/a (user action) | — |
| Task 2 | contacts domain helpers | `988bb64` | `src/lib/domain/contacts.ts` |
| Task 3 | orders domain helpers | `ecd82c1` | `src/lib/domain/orders.ts` |
| Task 4 | notes archive helpers | `aa417f6` | `src/lib/domain/notes.ts` |
| Task 5 | tags read helpers + new pipelines.ts | `053dfc3` | `src/lib/domain/tags.ts`, `src/lib/domain/pipelines.ts` |

## Deviations from Plan

### [Rule 1 - Bug] Correct column name `position` in pipeline_stages (not `order`)

- **Found during:** Task 5 schema verification
- **Issue:** The plan's example code for `listPipelines`/`listStages`/`getStageById` referenced `pipeline_stages.order` (with a NOTE suggesting to grep and adjust). Schema inspection of `20260129000003_orders_foundation.sql:55` confirmed the actual column is `position INTEGER NOT NULL DEFAULT 0`.
- **Fix:** Used `position` everywhere in `pipelines.ts` (interfaces `PipelineWithStages.stages[].position`, `StageSummary.position`; select lists; sort orders). Added a comment block at the top of `pipelines.ts` documenting the schema source of truth.
- **Files modified:** `src/lib/domain/pipelines.ts` (lines 12-15 comment, field names throughout)
- **Commit:** `053dfc3`

### [Rule 1 - Bug] Escape PostgREST OR-filter special chars in searchContacts

- **Found during:** Task 2 hardening while reading the `.or()` syntax docs
- **Issue:** Raw user query interpolated into `phone.ilike.%${q}%,email.ilike.%${q}%,name.ilike.%${q}%` breaks if `q` contains `,` (splits the filter list), `(`/`)` (ends sub-filter), or `%` (unintended wildcard). Would produce either a 400 from PostgREST or silently-incorrect results.
- **Fix:** Replaces `, ( )` with a single space and escapes `%` with a backslash before interpolation.
- **Files modified:** `src/lib/domain/contacts.ts:~462` (inside `searchContacts`)
- **Commit:** `988bb64`

### [Rule 2 - Safety] Stable tag-flatten type predicate in getContactById

- **Found during:** Task 2 initial compile
- **Issue:** The plan's inline `.filter((t): t is {id, name} => !!t)` wouldn't narrow cleanly under a union whose map function already returned `{id, name} | undefined` — tsc would complain about the predicate argument being typed as `{id, name}`.
- **Fix:** Widened the predicate parameter to `{ id: string; name: string } | null | undefined` so narrowing is well-typed.
- **Files modified:** `src/lib/domain/contacts.ts` (inside `getContactById` tag-flatten block)
- **Commit:** `988bb64`

No Rule 3 (blocking issues) or Rule 4 (architectural) deviations were triggered.

## Threat Model Alignment

Every `mitigate` disposition from the plan's threat register is implemented:

| Threat ID | Mitigation in code |
|-----------|-------------------|
| T-44-03-01 (Info Disclosure — archive/read) | Every query chains `.eq('workspace_id', ctx.workspaceId)`. Counts: contacts +6, orders +6, notes +4, tags +3, pipelines +5. |
| T-44-03-02 (Tampering — soft-vs-hard confusion) | Each `archive*` func has a JSDoc block: "soft delete — crm-writer uses this; human UI retains delete*". Writer tool registry in Plan 05 will expose only `archive*`. |
| T-44-03-03 (DoS — repeated archives) | Idempotency short-circuit: if `existing.archived_at` is set, return the stored timestamp without issuing the UPDATE. |
| T-44-03-05 (Partial migration) | Single atomic SQL script (4 ALTER + 4 CREATE INDEX + 4 COMMENT). User-confirmed sanity checks (4 columns, 4 indexes, 0 archived rows). |
| T-44-03-06 (Archived-row leak to reader) | `searchContacts`, `listOrders`, `getContactById`, `getOrderById` default `includeArchived=false`. |
| T-44-03-07 (Cross-workspace stage leak) | `getStageById` two-query pattern: stage fetch + pipeline-workspace verify. `data: null` returned for both not-found and cross-workspace — indistinguishable by design. |

T-44-03-04 (Repudiation) remains `accept` per plan.

## Verification Results

| Criterion | Result |
|-----------|--------|
| 4 × `ALTER TABLE … ADD COLUMN archived_at` in migration | 4 (grep confirmed) |
| 0 × `ALTER … MODIFY` / real `DROP` in migration | 0 (grep confirmed — only a comment contains "DROP") |
| `archiveContact`, `archiveOrder`, `archiveNote`, `archiveOrderNote` exported | 4/4 |
| `searchContacts`, `getContactById`, `listOrders`, `getOrderById` exported | 4/4 |
| `listTags`, `getTagById`, `listPipelines`, `listStages`, `getPipelineById`, `getStageById` exported | 6/6 |
| All archive funcs filter by `workspace_id` | YES (verified on every `.eq('workspace_id', ...)` in SELECT + UPDATE) |
| All read helpers default `archived_at IS NULL` when applicable | YES (`searchContacts`, `listOrders`; `getContactById`/`getOrderById` hide archived via post-filter) |
| `npx tsc --noEmit` across whole codebase | exit 0, zero errors |
| Existing `delete*`/`moveOrderToStage`/`assignTag`/etc. unmodified | YES (edits only appended) |

## Threat Flags

None — all new surface is domain-layer read/write aligned with the plan's documented threat register.

## Push to Vercel (still pending)

Per CLAUDE.md Regla 1, code changes should be pushed to Vercel before asking the user to test. However, this executor runs inside a git worktree on branch `worktree-agent-ad0a6093` — the orchestrator owns the merge to `main` and the subsequent push. **Do not push from the worktree directly.**

Once merged to `main`, the code is safe to push: Task 1 Step B is already applied in prod, so every reference to `archived_at` will resolve at runtime.

## Self-Check: PASSED

Verified via:
- `[ -f supabase/migrations/20260418201445_crm_archive_columns.sql ]` → FOUND
- `[ -f src/lib/domain/pipelines.ts ]` → FOUND
- `git log --oneline | grep 63308f1` → FOUND
- `git log --oneline | grep 988bb64` → FOUND
- `git log --oneline | grep ecd82c1` → FOUND
- `git log --oneline | grep aa417f6` → FOUND
- `git log --oneline | grep 053dfc3` → FOUND
- `grep -c "export async function archiveContact" src/lib/domain/contacts.ts` → 1
- `grep -c "export async function archiveOrder" src/lib/domain/orders.ts` → 1
- `grep -c "export async function archiveNote" src/lib/domain/notes.ts` → 1
- `grep -c "export async function archiveOrderNote" src/lib/domain/notes.ts` → 1
- `grep -c "export async function searchContacts" src/lib/domain/contacts.ts` → 1
- `grep -c "export async function getContactById" src/lib/domain/contacts.ts` → 1
- `grep -c "export async function listOrders" src/lib/domain/orders.ts` → 1
- `grep -c "export async function getOrderById" src/lib/domain/orders.ts` → 1
- `grep -c "export async function listTags" src/lib/domain/tags.ts` → 1
- `grep -c "export async function getTagById" src/lib/domain/tags.ts` → 1
- `grep -c "export async function listPipelines" src/lib/domain/pipelines.ts` → 1
- `grep -c "export async function listStages" src/lib/domain/pipelines.ts` → 1
- `grep -c "export async function getPipelineById" src/lib/domain/pipelines.ts` → 1
- `grep -c "export async function getStageById" src/lib/domain/pipelines.ts` → 1
- `npx tsc --noEmit` → exit 0, zero errors anywhere in the codebase
- `git status --short .planning/STATE.md .planning/ROADMAP.md` → clean (orchestrator-owned, not touched)
