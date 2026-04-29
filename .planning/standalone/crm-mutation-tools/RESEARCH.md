# Research — crm-mutation-tools

**Generated:** 2026-04-29
**Mode:** ecosystem + implementation hybrid (codebase mirror + new idempotency table design)
**Inputs:** CONTEXT.md (16 decisions D-pre-01..D-10), sibling crm-query-tools (shipped 2026-04-29) — full source + RESEARCH + PATTERNS + LEARNINGS + INTEGRATION-HANDOFF, codebase audit
**Status:** Ready for /gsd-plan-phase

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-pre-01:** Mirror of `crm-query-tools`. Same factory shape (`createCrmMutationTools(ctx)`), same file structure (`src/lib/agents/shared/crm-mutation-tools/{index,types,contacts,orders,notes,tasks,helpers}.ts` + `__tests__/`), same observability emit pattern, same PII redaction.
- **D-pre-02:** Regla 3 absolute. **ZERO** `createAdminClient` or `@supabase/supabase-js` imports in the module. Verifiable via grep returning 0 real matches (only doc-comments allowed).
- **D-pre-03:** Workspace from `ctx.workspaceId` only — NEVER input. Domain filters by `workspace_id` in every query.
- **D-pre-04:** NEVER hard DELETE. Soft-delete only via `archived_at` / `closed_at` / `completed_at`.
- **D-pre-05:** Base resource mutations (tags, pipelines, stages, templates, users) FORBIDDEN absolutely. Return `resource_not_found` if a referenced base resource doesn't exist.
- **D-pre-06:** Branching `none` — work on main, push after each plan.
- **D-01:** **Coexistence.** `crm-writer` (two-step propose+confirm) stays alive unchanged. mutation-tools is a NEW alternative, not a replacement. Migration of existing agents lives in dedicated follow-up standalones.
- **D-02:** **Full suite — 15 tools** in this standalone: contacts(3) + orders(5) + notes(4) + tasks(3). Closed list.
- **D-03:** **Idempotency-Key + dedicated table.** Creation operations accept `idempotencyKey?: string`. Storage in NEW table `crm_mutation_idempotency_keys (workspace_id, tool_name, key, result_id, result_payload, created_at; PK (workspace_id, tool_name, key))`. Second call with same key → `{ status: 'duplicate', data: <re-hydrated> }`. TTL 30 days via Inngest cron.
- **D-04:** Authorization via `ctx.workspaceId` membership — agent's ctx is trusted by design. NO admin gate for destructive operations in V1.
- **D-05:** Coverage Unit (~30-40) + Integration env-gated (~6-10) + E2E Playwright (runner endpoint + Kanban verify).
- **D-06:** Audit emits to `agent_observability_events` (same destination as query-tools). Three `pipeline_decision:*` events per mutation: `crm_mutation_invoked` / `crm_mutation_completed` / `crm_mutation_failed`. NO new audit table. NO duplicate to `crm_bot_actions`.
- **D-07:** Discriminated union `MutationResult<T>` with 7 statuses: `executed | resource_not_found | stage_changed_concurrently | validation_error | duplicate | workspace_mismatch | error`. NEVER throw for expected cases.
- **D-08:** **No feature flag.** Module is new with zero production consumers at ship time.
- **D-09:** On `status='executed'`, return entity completely re-hydrated from domain layer post-mutation (1 RTT extra is acceptable cost for fresh state).
- **D-10:** E2E Playwright dispatches mutations via runner endpoint hardened (4-gate) and verifies Kanban UI render for orders. Notes/tasks verify via second Supabase query.

### Claude's Discretion

- Slug of runner endpoint route (`/api/test/crm-mutation-tools/runner` recommended — mirrors query-tools).
- Exact DB table name (`crm_mutation_idempotency_keys` recommended).
- Module internal structure (one file per entity: contacts/orders/notes/tasks).
- Event name suffixes (`crm_mutation_*` recommended).
- Inngest cron name (`crm-mutation-idempotency-cleanup` recommended).
- Project skill name (`crm-mutation-tools` recommended).

### Deferred Ideas (OUT OF SCOPE)

- Migrate `somnio-sales-v3-pw-confirmation` to mutation-tools → standalone follow-up `crm-mutation-tools-pw-confirmation-integration`.
- Migrate other agents using crm-writer → per-agent follow-ups.
- Delete `crm-writer` module / `crm_bot_actions` table — coexists indefinitely.
- Update items inside an order (`updateOrder.products`) → V1.1 deferred.
- Real DELETE for any entity → never (soft-delete only).
- Base resource mutations (tags, pipelines, stages, templates, users) → never in this module.
- Bulk operations (`bulkArchiveOrders`, etc.) → demand-driven backlog.
- Admin gate for destructive operations → only when an agent requires it.
- Optimistic concurrency on `updateOrder` (like CAS for `moveOrderToStage`) → defer until concrete pain.
- Unified `crm_mutations_log` table → defer.

---

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Impact on Plan |
|------------|--------|----------------|
| GSD complete obligatorio (Regla 0) | CLAUDE.md | Every plan: discuss → research → plan → execute → verify → LEARNINGS. |
| Push to Vercel after code changes (Regla 1) | CLAUDE.md | Each plan ends with `git push origin main`. |
| Bogota timezone (Regla 2) | CLAUDE.md | `created_at` defaults `timezone('America/Bogota', NOW())`. NEVER set `created_at` client-side in domain. |
| Domain layer obligatorio (Regla 3) | CLAUDE.md | ZERO `createAdminClient` in module. All mutations via `@/lib/domain/*`. Verifiable via grep. |
| Migration before deploy (Regla 5) | CLAUDE.md | Plan creating `crm_mutation_idempotency_keys` table PAUSES for user to apply SQL in production before pushing code that uses it. |
| Documentation always synced (Regla 4) | CLAUDE.md | Plan 07 updates CLAUDE.md (`Module Scope: crm-mutation-tools`), `.claude/rules/agent-scope.md`, `.claude/skills/crm-mutation-tools.md`. |

---

## Phase Requirements

This standalone has no requirement IDs (CONTEXT.md is the spec). The 15 tool inventory from D-02 is the closed scope.

| ID | Description | Research Support |
|----|-------------|------------------|
| MUT-CT-01 | `createContact(input)` | Wraps `createContact` (`src/lib/domain/contacts.ts:95`). Idempotency-eligible (D-03). |
| MUT-CT-02 | `updateContact({contactId, ...})` | Wraps `updateContact` (`src/lib/domain/contacts.ts:189`). Pre-check via `getContactById` (Regla 3 pattern). |
| MUT-CT-03 | `archiveContact(contactId)` | Wraps `archiveContact` (`src/lib/domain/contacts.ts:466`). Already idempotent in domain. |
| MUT-OR-01 | `createOrder(input)` | Wraps `createOrder` (`src/lib/domain/orders.ts:224`). Idempotency-eligible. |
| MUT-OR-02 | `updateOrder({orderId, ...})` | Wraps `updateOrder` (`src/lib/domain/orders.ts:412`). NO products in V1 (deferred). |
| MUT-OR-03 | `moveOrderToStage({orderId, stageId})` | Wraps `moveOrderToStage` (`src/lib/domain/orders.ts:597`). **CAS-protected.** Propagates `stage_changed_concurrently` verbatim. |
| MUT-OR-04 | `archiveOrder(orderId)` | Wraps `archiveOrder` (`src/lib/domain/orders.ts:1614`). Already idempotent. |
| MUT-OR-05 | `closeOrder(orderId)` | **GAP.** No `closeOrder` exists in domain. No `closed_at` column anywhere in the codebase. **See `## Domain Layer Audit` for resolution path.** |
| MUT-NT-01 | `addContactNote({contactId, body})` | Wraps `createNote` (`src/lib/domain/notes.ts:123`). Note: domain function name is `createNote` (contact note); CONTEXT.md uses `addContactNote`. Both are valid; tool exposes `addContactNote` as the public name. |
| MUT-NT-02 | `addOrderNote({orderId, body})` | Wraps `createOrderNote` (`src/lib/domain/notes.ts:455`). |
| MUT-NT-03 | `archiveContactNote(noteId)` | Wraps `archiveNote` (`src/lib/domain/notes.ts:606`). Already idempotent. |
| MUT-NT-04 | `archiveOrderNote(noteId)` | Wraps `archiveOrderNote` (`src/lib/domain/notes.ts:674`). Already idempotent. |
| MUT-TK-01 | `createTask(input)` | Wraps `createTask` (`src/lib/domain/tasks.ts:86`). |
| MUT-TK-02 | `updateTask({taskId, ...})` | Wraps `updateTask` (`src/lib/domain/tasks.ts:170`). |
| MUT-TK-03 | `completeTask(taskId)` | Wraps `completeTask` (`src/lib/domain/tasks.ts:281`). Already idempotent. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 15 mutation tools | Backend / library (`src/lib/agents/shared/crm-mutation-tools/`) | Domain layer (`src/lib/domain/{contacts,orders,notes,tasks}.ts`) | Tools call domain (Regla 3); domain calls Supabase admin client. ZERO admin client in module. |
| Idempotency dedup | DB (`crm_mutation_idempotency_keys`) + helper in `helpers.ts` | Domain layer for re-hydration (`getContactById`, `getOrderById`, etc.) | Composite PK `(workspace_id, tool_name, key)` enforces uniqueness; helper performs lookup-then-execute-then-store. |
| TTL cleanup of idempotency rows | Inngest cron `crm-mutation-idempotency-cleanup` | DB | Daily sweep of rows `created_at < NOW() - 30 days`. Mirrors `crm-bot-expire-proposals` pattern at `src/inngest/functions/crm-bot-expire-proposals.ts`. |
| Observability events | In-memory collector via AsyncLocalStorage (`src/lib/observability`) | `agent_observability_events` table | `recordEvent('pipeline_decision', 'crm_mutation_*', payload)`. Same pattern as crm-query-tools. |
| Test runner endpoint (E2E) | API route (`src/app/api/test/crm-mutation-tools/runner/route.ts`) | createCrmMutationTools factory | 4-gate hardened: NODE_ENV + secret + env-workspace + tool allow-list. Mirrors `src/app/api/test/crm-query-tools/runner/route.ts`. |
| Unit tests | Vitest under `src/lib/agents/shared/crm-mutation-tools/__tests__/` | mocked domain functions | Mirror crm-query-tools test layout. |
| Integration tests | Vitest under `src/__tests__/integration/crm-mutation-tools/` | Live Supabase (env-gated `describe.skipIf`) | Pattern from `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts`. |
| E2E tests | Playwright under `e2e/crm-mutation-tools.spec.ts` | Dev server + runner endpoint + Kanban UI | Reuse existing `playwright.config.ts` + `e2e/fixtures/{auth,seed}.ts` (Wave 0 already done by query-tools). |

---

## Executive Summary

**The codebase already has every primitive this standalone needs.** Build is **assembly + extension**, not invention.

- **Mirror infrastructure exists:** `crm-query-tools` (shipped 2026-04-29) provides the factory pattern, observability wrapper, PII redaction helper (`phoneSuffix`), test layout, runner endpoint design, types layout, and migration template. Copy structurally.
- **Domain functions all exist** for 14 of the 15 tools — `createContact`, `updateContact`, `archiveContact`, `createOrder`, `updateOrder`, `moveOrderToStage`, `archiveOrder`, `createNote` (contact), `createOrderNote`, `archiveNote`, `archiveOrderNote`, `createTask`, `updateTask`, `completeTask`. **Only `closeOrder` is missing** — see Domain Layer Audit for resolution.
- **AI SDK v6 already pinned at `^6.0.86`** in `package.json:49`. The two-step cast pattern `(tool as unknown as { execute: (input: unknown) => Promise<unknown> }).execute(...)` is the canonical pattern for tests/runner — documented in crm-query-tools LEARNINGS Plan 02 Bug 1.
- **Playwright already bootstrapped** (Wave 0 of query-tools — `@playwright/test@1.58.2`, `playwright.config.ts`, `e2e/fixtures/{auth,seed}.ts`, `test:e2e` scripts). NO additional Wave 0 needed for framework setup.
- **CAS contract for `moveOrderToStage` is verified** at `src/lib/domain/orders.ts:597-770`: returns `{ success: false, error: 'stage_changed_concurrently', data: { currentStageId } }` when CAS rejects. Mutation tool propagates verbatim into `MutationResult.stage_changed_concurrently` with `expectedStageId` (the stage ID the agent attempted to move FROM, captured by domain) and `actualStageId` (`currentStageId` re-fetched after CAS reject).
- **Soft-delete columns confirmed:** `contacts.archived_at`, `orders.archived_at`, `contact_notes.archived_at`, `order_notes.archived_at`, `tasks.completed_at`. `closed_at` does NOT exist — open question for `closeOrder`.

**Primary recommendation:** Plan as **6 waves** (smaller than query-tools' 7 because no UI):

1. **W0 (single plan)** — Migration `crm_mutation_idempotency_keys` + Inngest cleanup cron + Plan 02-style PAUSE for Regla 5.
2. **W1** — Module skeleton (`index`, `types`, `helpers` with idempotency helper) + first tool to prove shape (recommend `createContact` — simplest, idempotency-eligible).
3. **W2** — Remaining 2 contact tools + 5 order tools (largest plan; ~7 tools).
4. **W3** — 4 note tools + 3 task tools (~7 tools).
5. **W4** — Integration env-gated tests + E2E runner endpoint + Playwright spec (Kanban verification).
6. **W5** — `INTEGRATION-HANDOFF.md` + `.claude/skills/crm-mutation-tools.md` + `.claude/rules/agent-scope.md` cross-ref + `CLAUDE.md` Module Scope section + LEARNINGS + SUMMARY.

**Open question for plan-phase or discuss-phase user clarification:** `closeOrder` semantics (see Domain Layer Audit § MUT-OR-05).

---

## Standard Stack

### Core (already in `package.json`, no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `^6.0.86` | AI SDK v6 — `tool({ description, inputSchema, execute })` | Pinned project-wide; query-tools uses identically. |
| `zod` | (transitive via `ai`) | Input schema validation per tool | `inputSchema: z.object({...})` in every `tool({...})`. Enforces shape before execute. |
| `@supabase/supabase-js` | (already installed) | **ONLY in domain layer.** Module imports forbidden (Regla 3). | n/a in module. |
| `vitest` | (already installed) | Unit + integration tests | Pattern at `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts`. |
| `@playwright/test` | `1.58.2` (pinned exact) | E2E framework — already bootstrapped by query-tools Wave 0 | `playwright.config.ts` + `e2e/fixtures/{auth,seed}.ts` already exist. |
| `inngest` | `^3.51.0` (already installed) | Daily TTL cleanup cron `crm-mutation-idempotency-cleanup` | Cron syntax `'TZ=America/Bogota 0 3 * * *'` daily 03:00 Bogota — same pattern as `close-stale-sessions.ts:35`. |

### Internal helpers (project, no new code)

| Helper | Path | Use |
|--------|------|-----|
| `createCrmMutationTools(ctx)` factory aggregator | `src/lib/agents/shared/crm-mutation-tools/index.ts` (NEW) | Mirror of `createCrmQueryTools` at `src/lib/agents/shared/crm-query-tools/index.ts:23-28`. |
| `getCollector()?.recordEvent(...)` | `src/lib/observability/index.ts:32` (export), `src/lib/observability/collector.ts:153` (signature) | Emit `pipeline_decision:crm_mutation_*` events. |
| `createModuleLogger('crm-mutation-tools.contacts')` | `src/lib/audit/logger.ts` | Structured log on errors. Pattern at `src/lib/agents/shared/crm-query-tools/contacts.ts:40`. |
| `phoneSuffix(raw: string): string` | NEW (mirror `src/lib/agents/shared/crm-query-tools/contacts.ts:42-44`) | PII redaction — last 4 digits only in observability payloads. |
| `bodyTruncate(s: string, max=200): string` | NEW helper for `addContactNote` / `addOrderNote` body redaction in observability payloads | D-06 PII redaction (note body truncated to 200 chars in event payload). |
| `randomUUID` | `crypto` (Node built-in) | Generate idempotency `result_id` if domain doesn't return one. Pattern at `src/lib/agents/crm-writer/two-step.ts:16`. |

### Domain functions (consumed)

See `## Domain Layer Audit` section below.

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Decision |
|------------|-----------|----------|----------|
| Idempotency table | Re-use `crm_bot_actions` | crm-writer's table mixes propose+confirm lifecycle; mutation-tools is single-shot — would muddle semantics | LOCKED: dedicated table (D-03) |
| Idempotency table | Session-state JSONB | Cross-session keys impossible; no per-tool composite index | LOCKED: dedicated table (D-03) |
| Idempotency cleanup | DB trigger / scheduled SQL function | Inngest cron is already established for similar TTL sweeps (`crm-bot-expire-proposals`) | Recommend Inngest cron |
| Per-tool idempotency hashing of input | Caller-provided opaque key | Hashing input would require canonicalization (object key order, etc.) — fragile | LOCKED: caller-provided string (D-03) |
| Hard delete with archive flag | Soft-delete via `archived_at` | Hard delete loses audit trail; archive preserves history | LOCKED: soft-delete only (D-pre-04) |
| New table `crm_mutations_log` | Reuse `agent_observability_events` | Forensics cost: schema design + indexes + RLS — premature | LOCKED: reuse `agent_observability_events` (D-06) |

**Installation (V0 — nothing new to install):**

```bash
# All deps already in package.json. No installs needed.
# Wave 0 only adds: 1 Supabase migration + 1 Inngest cron file.
```

**Version verification (verified via `package.json` 2026-04-29):**

- `ai@^6.0.86` — current as of project lock; version pinned across query-tools and crm-writer.
- `@playwright/test@1.58.2` — pinned exact (matches Railway robot Docker image; query-tools LEARNINGS Plan 01 Bug 1).
- `inngest@^3.51.0` — pinned project-wide.

---

## Architecture Patterns

### System Architecture Diagram

```
┌─ Agent (e.g. somnio-sales-v3-pw-confirmation in future follow-up)
│   │
│   ▼ tools: { ...createCrmMutationTools(ctx) }
│   │
│   ▼ tool.execute({ contactId, body, idempotencyKey? })
│
└─→ src/lib/agents/shared/crm-mutation-tools/
       │
       ├─ contacts.ts ─┐
       ├─ orders.ts ───┼─ tool({ description, inputSchema, execute }) per tool
       ├─ notes.ts ────┤
       ├─ tasks.ts ────┘
       │
       │ each execute():
       │   1. recordEvent('pipeline_decision', 'crm_mutation_invoked', { tool, ws, invoker, inputRedacted })
       │   2. if idempotencyKey → lookup → on hit: re-hydrate from result_id → return { status: 'duplicate', data }
       │   3. existence pre-check via getXxxById (resource_not_found short-circuit)
       │   4. call domain.mutate(domainCtx, params)
       │      ↓
       │     domain returns DomainResult<T> { success, data?, error? }
       │      ↓
       │     special-case errors:
       │       'Pedido no encontrado' / 'Contacto no encontrado' → resource_not_found
       │       'stage_changed_concurrently' → stage_changed_concurrently
       │       generic ZodError / param invalid → validation_error
       │       other → error
       │   5. on success: re-hydrate via getXxxById → MutationResult.executed { data: full entity }
       │   6. if idempotencyKey → store row in crm_mutation_idempotency_keys (workspace_id, tool_name, key, result_id, result_payload)
       │   7. recordEvent('pipeline_decision', 'crm_mutation_completed' | 'crm_mutation_failed', { ... })
       │   8. return MutationResult<T>
       │
       ▼
   src/lib/domain/{contacts,orders,notes,tasks}.ts
       │
       ▼ createAdminClient() — bypasses RLS, filters by ctx.workspaceId
   Supabase (Postgres)
       │
       ▼ DDL
   ├─ contacts (archived_at)
   ├─ orders (archived_at, NO closed_at)
   ├─ contact_notes (archived_at)
   ├─ order_notes (archived_at)
   ├─ tasks (completed_at)
   ├─ crm_mutation_idempotency_keys (NEW: workspace_id, tool_name, key, result_id, result_payload, created_at)
   └─ agent_observability_events  ← observability sink (existing)

┌─ Inngest cron (daily 03:00 Bogota)
│  crm-mutation-idempotency-cleanup
│  DELETE FROM crm_mutation_idempotency_keys WHERE created_at < NOW() - INTERVAL '30 days'
└──────────────────────────────────────────────────────────────────

┌─ Test runner (DEV/preview only)
│  POST /api/test/crm-mutation-tools/runner
│  4-gate: NODE_ENV !== prod + x-test-secret + TEST_WORKSPACE_ID + ALLOWED_TOOLS Set
│  → invokes createCrmMutationTools({ workspaceId: TEST_WORKSPACE_ID, invoker: 'playwright-e2e' })
│  → Playwright spec dispatches mutations → navigates /crm/pedidos → asserts Kanban render
└──────────────────────────────────────────────────────────────────
```

### Recommended Project Structure

```
src/lib/agents/shared/crm-mutation-tools/        # NEW
├── index.ts              # createCrmMutationTools(ctx) factory aggregator
├── types.ts              # MutationResult<T> + CrmMutationToolsContext
├── helpers.ts            # idempotency helper (lookup/store), redaction, observability emit wrapper
├── contacts.ts           # 3 tools: createContact, updateContact, archiveContact
├── orders.ts             # 5 tools: createOrder, updateOrder, moveOrderToStage, archiveOrder, closeOrder
├── notes.ts              # 4 tools: addContactNote, addOrderNote, archiveContactNote, archiveOrderNote
├── tasks.ts              # 3 tools: createTask, updateTask, completeTask
└── __tests__/
    ├── contacts.test.ts
    ├── orders.test.ts
    ├── notes.test.ts
    ├── tasks.test.ts
    └── helpers.test.ts   # idempotency helper unit tests

src/__tests__/integration/crm-mutation-tools/    # NEW (env-gated)
├── cross-workspace.test.ts          # workspace isolation
├── idempotency.test.ts              # replay returns duplicate, no double-mutate
├── soft-delete.test.ts              # archived_at populated, no row deleted
└── stage-change-concurrent.test.ts  # CAS reject path

e2e/crm-mutation-tools.spec.ts        # NEW (Playwright)

src/app/api/test/crm-mutation-tools/runner/route.ts   # NEW (4-gate hardened)

supabase/migrations/{timestamp}_crm_mutation_idempotency_keys.sql   # NEW

src/inngest/functions/crm-mutation-idempotency-cleanup.ts            # NEW (Inngest cron)

.claude/skills/crm-mutation-tools.md       # NEW project skill
.planning/standalone/crm-mutation-tools/   # this dir
├── INTEGRATION-HANDOFF.md
└── LEARNINGS.md
```

### Pattern 1: Per-File Factory Aggregated in `index.ts`

**What:** Each entity file exports a `make<Entity>MutationTools(ctx)` function that returns `{ tool1, tool2, ... }`. The `index.ts` aggregates via spread.

**When to use:** Always — canonical pattern from crm-query-tools.

**Example:**

```typescript
// Source: src/lib/agents/shared/crm-query-tools/index.ts:23-28 (mirror this exactly)
import { makeContactMutationTools } from './contacts'
import { makeOrderMutationTools } from './orders'
import { makeNoteMutationTools } from './notes'
import { makeTaskMutationTools } from './tasks'

export function createCrmMutationTools(ctx: CrmMutationToolsContext) {
  return {
    ...makeContactMutationTools(ctx),
    ...makeOrderMutationTools(ctx),
    ...makeNoteMutationTools(ctx),
    ...makeTaskMutationTools(ctx),
  }
}
```

**Why:** Per-call instantiation; no module-scope state. Each agent caller receives fresh tool instances with their own `ctx` captured in closure (Pitfall 6 from query-tools).

### Pattern 2: Discriminated Union Return with Status Enum

**What:** `MutationResult<T>` with 7 statuses. Every tool returns this shape — no throws for expected outcomes.

**When to use:** Always.

**Example:**

```typescript
// types.ts (NEW — modeled on src/lib/agents/shared/crm-query-tools/types.ts:33-39)
import type { ContactDetail } from '@/lib/domain/contacts'
import type { OrderDetail } from '@/lib/domain/orders'

export interface CrmMutationToolsContext {
  workspaceId: string
  /** Caller agent id for observability (e.g. 'somnio-sales-v3-pw-confirmation'). Optional. */
  invoker?: string
}

export type ResourceType =
  | 'contact' | 'order' | 'note' | 'task'
  | 'tag' | 'pipeline' | 'stage' | 'template' | 'user'   // base resources we cannot mutate (D-pre-05)

export type MutationResult<T> =
  | { status: 'executed'; data: T }
  | { status: 'resource_not_found'; error: { code: string; message?: string; missing: { resource: ResourceType; id: string } } }
  | { status: 'stage_changed_concurrently'; error: { code: 'stage_changed_concurrently'; expectedStageId: string; actualStageId: string } }
  | { status: 'validation_error'; error: { code: string; message: string; field?: string } }
  | { status: 'duplicate'; data: T }                        // idempotency hit
  | { status: 'workspace_mismatch'; error: { code: 'workspace_mismatch' } }
  | { status: 'error'; error: { code: string; message?: string } }
```

**Reuse note:** `ResourceType` matches `src/lib/agents/crm-writer/types.ts:43-52` (the writer's `ResourceNotFoundError.resource_type`) — same union to keep both modules consistent. Re-export from this module rather than re-import from crm-writer (avoid cross-module dependency).

### Pattern 3: Existence Pre-Check Pattern (Mirror crm-writer)

**What:** Before mutating, call `getXxxById` from domain to verify the entity exists in this workspace. Return `resource_not_found` if not.

**When to use:** All update/move/archive/close/complete tools (anything that takes an existing entity ID as input).

**Example:**

```typescript
// In orders.ts, updateOrder execute:
import { getOrderById, updateOrder as domainUpdateOrder } from '@/lib/domain/orders'

execute: async (input) => {
  const startedAt = Date.now()
  collector?.recordEvent('pipeline_decision', 'crm_mutation_invoked', { tool: 'updateOrder', workspaceId: ctx.workspaceId, invoker: ctx.invoker, orderIdSuffix: input.orderId.slice(-8) })

  // Pre-check existence (Regla 3 + writer pattern from src/lib/agents/crm-writer/tools/...)
  const existing = await getOrderById(domainCtx, { orderId: input.orderId })
  if (!existing.success || !existing.data) {
    collector?.recordEvent('pipeline_decision', 'crm_mutation_failed', { tool: 'updateOrder', errorCode: 'resource_not_found', latencyMs: Date.now() - startedAt })
    return {
      status: 'resource_not_found',
      error: { code: 'order_not_found', missing: { resource: 'order', id: input.orderId } },
    }
  }
  // ... proceed with mutation
}
```

### Pattern 4: Idempotency Helper (NEW — wraps creation tools)

**What:** Lookup-then-execute-then-store pattern around domain mutation calls.

**When to use:** Creation tools only — `createContact`, `createOrder`, `createTask`, `addContactNote`, `addOrderNote`. Update/move/archive/close/complete tools are idempotent by domain semantics (re-applying same input → same final state).

**Pseudo-flow:**

```
async function withIdempotency<TInput, TResult>(
  domainCtx, ctx, toolName, key | undefined, input,
  rehydrateById: (id: string) => Promise<TResult>,
  doMutate: () => Promise<{ id: string; payload: TResult }>,
): Promise<{ status: 'executed' | 'duplicate'; data: TResult }> {
  if (!key) {
    const { id, payload } = await doMutate()
    return { status: 'executed', data: payload }
  }
  // 1. Lookup
  const existing = await selectIdempotencyRow({ workspaceId: ctx.workspaceId, toolName, key })
  if (existing) {
    // Re-hydrate from result_id (D-09: always return fresh entity, not cached payload)
    const fresh = await rehydrateById(existing.result_id)
    if (fresh) return { status: 'duplicate', data: fresh }
    // Race: row was archived/deleted post-storage → fall through to result_payload as last-resort
    return { status: 'duplicate', data: existing.result_payload as TResult }
  }
  // 2. Execute
  const { id, payload } = await doMutate()
  // 3. Store (best-effort; if INSERT fails because someone else inserted same key — race condition — re-fetch)
  const stored = await insertIdempotencyRow({ workspaceId: ctx.workspaceId, toolName, key, resultId: id, resultPayload: payload })
  if (!stored && /* unique violation */) {
    // Race: another caller wrote first → fetch their row + re-hydrate
    const winner = await selectIdempotencyRow({ workspaceId: ctx.workspaceId, toolName, key })
    if (winner) {
      const fresh = await rehydrateById(winner.result_id)
      return { status: 'duplicate', data: fresh ?? winner.result_payload as TResult }
    }
  }
  return { status: 'executed', data: payload }
}
```

**Critical re-hydration rule (D-09):** Always re-fetch via `getXxxById` rather than trusting cached `result_payload`. The payload is a tombstone for crash-recovery only; live state must be fresh.

**The helper itself uses `createAdminClient` indirectly** — it must do so via a NEW domain function `idempotency.ts` (under `src/lib/domain/`) so the module stays clean of admin client imports (Regla 3).

### Pattern 5: Observability Emit Wrapper

**What:** Three events per tool-call: `crm_mutation_invoked`, `crm_mutation_completed`, `crm_mutation_failed`. PII-redacted payload.

**When to use:** Every tool, every execute branch.

**Example:**

```typescript
// helpers.ts
import { getCollector } from '@/lib/observability'

export interface MutationEventBase {
  tool: string
  workspaceId: string
  invoker?: string
}

export function emitInvoked(base: MutationEventBase, redactedInput: Record<string, unknown>) {
  getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_invoked', {
    ...base,
    inputRedacted: redactedInput,
  })
}

export function emitCompleted(base: MutationEventBase, payload: { resultStatus: string; latencyMs: number; resultId?: string; idempotencyKeyHit?: boolean }) {
  getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_completed', { ...base, ...payload })
}

export function emitFailed(base: MutationEventBase, payload: { errorCode: string; latencyMs: number }) {
  getCollector()?.recordEvent('pipeline_decision', 'crm_mutation_failed', { ...base, ...payload })
}
```

**Reuse:** `phoneSuffix` helper inline (mirror `src/lib/agents/shared/crm-query-tools/contacts.ts:42-44`):

```typescript
function phoneSuffix(raw: string): string {
  return raw.replace(/\D/g, '').slice(-4)
}
function bodyTruncate(s: string, max = 200): string {
  return s.length > max ? s.slice(0, max) + '…' : s
}
```

### Pattern 6: Two-Step Cast for AI SDK v6 `execute(input)`

**What:** Tests, runners, and integration test code invoke tools with single `input` argument. AI SDK v6 strict typing rejects direct cast; need two-step `as unknown as` cast.

**When to use:** All tests + runner endpoint.

**Example:**

```typescript
// canonical pattern from src/app/api/test/crm-query-tools/runner/route.ts:78
const result = await (tool as unknown as { execute: (input: unknown) => Promise<unknown> }).execute(body.input ?? {})
```

**Reference:** crm-query-tools LEARNINGS.md "Plan 02 Bug 1: Cast directo `Tool -> { execute }` rechazado por TS strict" — pattern propagated to Plans 03, 04, 06.

### Pattern 7: Hardened Test Runner Endpoint (4-Gate)

**What:** POST endpoint at `/api/test/crm-mutation-tools/runner` with 4 layers of guards.

**When to use:** E2E only (Wave 4). Mirror exactly from `src/app/api/test/crm-query-tools/runner/route.ts`.

**Gates (in order):**

1. **NODE_ENV gate FIRST** — return 404 in production.
2. **`x-test-secret` header** strict equality vs `process.env.PLAYWRIGHT_TEST_SECRET` (re-use existing env var).
3. **Workspace from env** — `process.env.TEST_WORKSPACE_ID` (re-use existing). NEVER from request body.
4. **Tool allow-list** — `Set` of the 15 mutation tool names; reject any other input.

```typescript
const ALLOWED_TOOLS = new Set([
  // contacts
  'createContact', 'updateContact', 'archiveContact',
  // orders
  'createOrder', 'updateOrder', 'moveOrderToStage', 'archiveOrder', 'closeOrder',
  // notes
  'addContactNote', 'addOrderNote', 'archiveContactNote', 'archiveOrderNote',
  // tasks
  'createTask', 'updateTask', 'completeTask',
])
```

### Anti-Patterns to Avoid

- **Hard-rolling idempotency dedup:** Don't write your own hashing/dedup logic. Use the table-backed helper (Pattern 4). Hashing inputs requires canonicalization (key order, whitespace, etc.) — fragile.
- **Caching tool results:** D-19 firme inherited from query-tools. Caching introduces stale-data bugs critical when other agents/automations mutate rows mid-turn (esp. relevant under crm-stage-integrity standalone).
- **Hardcoding stage names:** Stage references must always be UUIDs. Inherited from D-13 of query-tools.
- **Accepting `workspaceId` in input schema:** Workspace ALWAYS from `ctx`. Accepting it in input is a cross-workspace exploit vector (T-W5-03 analog).
- **CAS retry loop:** When `moveOrderToStage` returns `stage_changed_concurrently`, the tool MUST propagate verbatim and NOT retry. Decision to re-propose is the agent loop's responsibility (mirrors crm-writer behavior — `.claude/rules/agent-scope.md` § CRM Writer Bot).
- **Cross-feature refactor as side-effect:** Don't try to unify with crm-writer types/utilities mid-standalone. Mirror separately; refactor in a future standalone if convergence justifies.
- **Mixing package managers:** If `pnpm-lock.yaml` exists, use pnpm only. `npm install` corrupts pnpm lockfile (LEARNINGS Plan 01 Bug 3).

---

## Domain Layer Audit

For each of the 15 tools, the exact domain function it wraps. **Verified by reading `src/lib/domain/{contacts,orders,notes,tasks}.ts` 2026-04-29.**

| Tool (Public Name) | Domain Function | Path:Line | Status | Notes |
|--------------------|-----------------|-----------|--------|-------|
| `createContact` | `createContact` | `src/lib/domain/contacts.ts:95` | ✓ EXISTS | Returns `DomainResult<CreateContactResult>` with `contactId`. Re-hydrate via `getContactById`. |
| `updateContact` | `updateContact` | `src/lib/domain/contacts.ts:189` | ✓ EXISTS | Returns `DomainResult<UpdateContactResult>`. Re-hydrate via `getContactById`. |
| `archiveContact` | `archiveContact` | `src/lib/domain/contacts.ts:466` | ✓ EXISTS | Already idempotent at domain layer (returns existing `archived_at` if already archived). |
| `createOrder` | `createOrder` | `src/lib/domain/orders.ts:224` | ✓ EXISTS | Returns `{ orderId, stageId }`. Re-hydrate via `getOrderById`. Auto-resolves first stage if not provided. |
| `updateOrder` | `updateOrder` | `src/lib/domain/orders.ts:412` | ✓ EXISTS | Note: domain `UpdateOrderParams.products` exists but **V1 mutation tool MUST omit it from input schema** (CONTEXT § Fuera de scope). |
| `moveOrderToStage` | `moveOrderToStage` | `src/lib/domain/orders.ts:597` | ✓ EXISTS | **CAS-protected behind `platform_config.crm_stage_integrity_cas_enabled` flag.** When CAS rejects, returns `{ success: false, error: 'stage_changed_concurrently', data: { currentStageId } }`. Tool MUST detect this string + map to `MutationResult.stage_changed_concurrently`. |
| `archiveOrder` | `archiveOrder` | `src/lib/domain/orders.ts:1614` | ✓ EXISTS | Idempotent at domain layer. |
| `closeOrder` | **`closeOrder` does NOT exist in domain** | (missing) | ✗ **GAP** | **No `closed_at` column on `orders` table** (verified `grep -rn closed_at supabase/migrations/` returns 0). The doc-comment of `archiveOrder` at `src/lib/domain/orders.ts:1606-1610` explicitly says: *"If the workspace's convention is to also move to a 'closed' stage, the caller (writer tool) should first call moveOrderToStage then archiveOrder — or just archive."* **Resolution path — see below.** |
| `addContactNote` | `createNote` | `src/lib/domain/notes.ts:123` | ✓ EXISTS | Domain function name is `createNote` (contact note); tool exposes `addContactNote` per CONTEXT D-02. |
| `addOrderNote` | `createOrderNote` | `src/lib/domain/notes.ts:455` | ✓ EXISTS | |
| `archiveContactNote` | `archiveNote` | `src/lib/domain/notes.ts:606` | ✓ EXISTS | Domain function name is `archiveNote` (operates on `contact_notes`); tool exposes `archiveContactNote` for clarity. Idempotent. |
| `archiveOrderNote` | `archiveOrderNote` | `src/lib/domain/notes.ts:674` | ✓ EXISTS | Idempotent. |
| `createTask` | `createTask` | `src/lib/domain/tasks.ts:86` | ✓ EXISTS | Validates exclusive arc: at most one of contactId/orderId/conversationId. |
| `updateTask` | `updateTask` | `src/lib/domain/tasks.ts:170` | ✓ EXISTS | Toggles `completed_at` when status changes to/from 'completed'. |
| `completeTask` | `completeTask` | `src/lib/domain/tasks.ts:281` | ✓ EXISTS | Idempotent (no-op if already completed). Sets `completed_at` + emits `task.completed` trigger. |

### `closeOrder` Resolution Path (open question)

**The architectural ambiguity:** "Close" semantics are not represented in the schema. CONTEXT.md D-02 lists `closeOrder(orderId)` as a tool with "toggle `closed_at`", but no such column exists. Two viable resolutions:

**Resolution A: Add `orders.closed_at` column + new domain `closeOrder` function** — fits the soft-delete invariant cleanly.
- Migration adds column.
- New domain function `closeOrder(ctx, { orderId }) → DomainResult<{ orderId, closedAt }>` mirroring `archiveOrder`.
- Tool wraps it. Idempotent (return existing `closed_at` if already set).
- **Cost:** 1 column add + 1 domain function + 1 trigger consideration (no automation triggers needed since "closed" isn't an event today).
- **Recommended.** This is the cleanest mapping to D-pre-04's "soft-delete only" rule.

**Resolution B: Map `closeOrder` semantically onto move-to-closed-stage + archive** — what the existing `archiveOrder` doc-comment already suggests.
- No new schema. Tool calls `moveOrderToStage(orderId, <closed_stage_id_from_config>)` then `archiveOrder(orderId)`.
- **Problem:** Requires per-workspace config of "which stage means closed". Adds new config row akin to `crm_query_tools_config` — bigger scope creep.
- **Not recommended** for this standalone.

**Resolution C: Drop `closeOrder` from V1** — defer to V1.1 or out-of-scope.
- 14 tools instead of 15.
- **Decision burden on user.** Should be raised in plan-phase or via follow-up discuss.

**Recommendation for plan-phase:** Adopt Resolution A. Plan 0 (the migration plan) adds:
1. Migration `crm_mutation_idempotency_keys` (new table).
2. Migration `orders.closed_at` column + `closeOrder` domain function.

Both apply under one Regla 5 PAUSE.

**Action item for plan-phase or discuss-phase:** Confirm with user that Resolution A is correct OR explicitly de-scope to Resolution C. Adding a column is a low-cost migration; dropping a tool is also low-cost. **Do not silently default — surface this.**

### `updateOrder.products` (V1.1 deferred per CONTEXT)

Domain `UpdateOrderParams` (line 112-118 of orders.ts) accepts `products` array. **The mutation tool's input schema MUST omit this field** in V1. CONTEXT § Fuera de scope: *"Update items de un pedido (`updateOrder.products`) — V1 no incluye, deferido a V1.1."* Tool's zod schema:

```typescript
inputSchema: z.object({
  orderId: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  closingDate: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  // NO products field in V1
  // ...
})
```

---

## Idempotency Table Design

### Migration SQL (drop into `supabase/migrations/{timestamp}_crm_mutation_idempotency.sql`)

```sql
-- Standalone crm-mutation-tools — Wave 0.
-- Creates idempotency-key dedup table for creation mutation tools.
--
-- D-03: opt-in idempotency via caller-provided string key.
-- D-pre-02: NO admin client in module — domain layer file
--   src/lib/domain/crm-mutation-idempotency.ts is the SOLE writer of this table.
-- Regla 2: timestamps use timezone('America/Bogota', NOW()).
-- LEARNING propagated (platform_config 20260420000443): mandatory GRANTs for
--   service_role + authenticated.

-- ─────────────────────────────────────────────────────────────────────
-- Table: crm_mutation_idempotency_keys
-- Purpose: dedup creation mutations across retries within TTL.
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crm_mutation_idempotency_keys (
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tool_name      TEXT NOT NULL,
  key            TEXT NOT NULL,
  result_id      UUID NOT NULL,           -- FK varies by tool_name; not enforced (polymorphic)
  result_payload JSONB NOT NULL,          -- tombstone for crash-recovery; D-09 says always re-hydrate via result_id
  created_at     TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  PRIMARY KEY (workspace_id, tool_name, key)
);

-- Index for TTL cleanup cron (sweeps by created_at)
CREATE INDEX IF NOT EXISTS idx_crm_mutation_idempotency_keys_created_at
  ON public.crm_mutation_idempotency_keys(created_at);

ALTER TABLE public.crm_mutation_idempotency_keys ENABLE ROW LEVEL SECURITY;

-- RLS: workspace members can SELECT (forensics / audit UI future-use); only
-- service_role inserts/deletes (domain layer + Inngest cron). NO UPDATE policy
-- — idempotency rows are immutable post-insert.
CREATE POLICY "crm_mutation_idempotency_keys_select"
  ON public.crm_mutation_idempotency_keys FOR SELECT
  USING (is_workspace_member(workspace_id));

-- INSERT: service_role only (no policy = denies authenticated path; service_role bypasses RLS)
-- DELETE: service_role only (cron sweeps)
-- NO UPDATE policy intentionally — rows are write-once.

GRANT ALL    ON TABLE public.crm_mutation_idempotency_keys TO service_role;
GRANT SELECT ON TABLE public.crm_mutation_idempotency_keys TO authenticated;

COMMENT ON TABLE public.crm_mutation_idempotency_keys IS
  'Dedup table for crm-mutation-tools creation operations. PK (workspace_id, tool_name, key). Rows are immutable; TTL 30 days swept by Inngest cron crm-mutation-idempotency-cleanup. Standalone crm-mutation-tools D-03.';
COMMENT ON COLUMN public.crm_mutation_idempotency_keys.result_payload IS
  'Tombstone snapshot of executed mutation result. D-09 says callers should ALWAYS re-hydrate fresh via result_id; this column is fallback for orphaned rows only.';
```

### Domain layer (NEW file `src/lib/domain/crm-mutation-idempotency.ts`)

This is the SOLE file using `createAdminClient` against this table. Module-side helpers call this domain.

```typescript
// Skeleton — full implementation in plan tasks.
import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'

export interface IdempotencyRow {
  workspaceId: string
  toolName: string
  key: string
  resultId: string
  resultPayload: unknown
  createdAt: string
}

export async function getIdempotencyRow(
  ctx: DomainContext,
  params: { toolName: string; key: string },
): Promise<DomainResult<IdempotencyRow | null>> { /* SELECT ... WHERE workspace_id + tool_name + key */ }

export async function insertIdempotencyRow(
  ctx: DomainContext,
  params: { toolName: string; key: string; resultId: string; resultPayload: unknown },
): Promise<DomainResult<{ inserted: boolean }>> { /* INSERT ... ON CONFLICT DO NOTHING; returns inserted=false on conflict */ }

export async function pruneIdempotencyRows(
  olderThanDays: number,
): Promise<DomainResult<{ deleted: number }>> { /* used by Inngest cron */ }
```

### Helper Flow (in `src/lib/agents/shared/crm-mutation-tools/helpers.ts`)

```typescript
import { getIdempotencyRow, insertIdempotencyRow } from '@/lib/domain/crm-mutation-idempotency'

export async function withIdempotency<TResult>(
  domainCtx: DomainContext,
  ctx: CrmMutationToolsContext,
  toolName: string,
  key: string | undefined,
  doMutate: () => Promise<{ id: string; data: TResult }>,
  rehydrate: (id: string) => Promise<TResult | null>,
): Promise<{ status: 'executed' | 'duplicate'; data: TResult; idempotencyKeyHit: boolean }> {
  if (!key) {
    const { data } = await doMutate()
    return { status: 'executed', data, idempotencyKeyHit: false }
  }

  // Lookup
  const lookup = await getIdempotencyRow(domainCtx, { toolName, key })
  if (lookup.success && lookup.data) {
    const fresh = await rehydrate(lookup.data.resultId)
    return {
      status: 'duplicate',
      data: fresh ?? (lookup.data.resultPayload as TResult),
      idempotencyKeyHit: true,
    }
  }

  // Execute
  const { id, data } = await doMutate()

  // Store (best-effort — race detected via inserted=false)
  const stored = await insertIdempotencyRow(domainCtx, {
    toolName, key, resultId: id, resultPayload: data,
  })
  if (stored.success && stored.data && !stored.data.inserted) {
    // Race: another caller wrote first. Their row wins; re-hydrate.
    const winner = await getIdempotencyRow(domainCtx, { toolName, key })
    if (winner.success && winner.data) {
      const fresh = await rehydrate(winner.data.resultId)
      return {
        status: 'duplicate',
        data: fresh ?? (winner.data.resultPayload as TResult),
        idempotencyKeyHit: true,
      }
    }
  }
  return { status: 'executed', data, idempotencyKeyHit: false }
}
```

### TTL Cleanup Cron (NEW Inngest function)

**File:** `src/inngest/functions/crm-mutation-idempotency-cleanup.ts`

**Pattern source:** `src/inngest/functions/crm-bot-expire-proposals.ts` (existing TTL sweep cron).

**Shape:**

```typescript
import { inngest } from '@/inngest/client'
import { pruneIdempotencyRows } from '@/lib/domain/crm-mutation-idempotency'

/**
 * Standalone crm-mutation-tools — Wave 0.
 * Sweeps crm_mutation_idempotency_keys older than 30 days.
 * Cron: TZ=America/Bogota 0 3 * * *  (daily 03:00 Bogota — off-peak).
 */
export const crmMutationIdempotencyCleanupCron = inngest.createFunction(
  { id: 'crm-mutation-idempotency-cleanup', name: 'CRM Mutation: Idempotency Cleanup' },
  { cron: 'TZ=America/Bogota 0 3 * * *' },
  async ({ step, logger }) => {
    const result = await step.run('prune-old-keys', () => pruneIdempotencyRows(30))
    logger.info({ ...result, cronRunAt: new Date().toISOString() }, 'crm-mutation-idempotency-cleanup complete')
    return result
  },
)
```

Register in `src/app/api/inngest/route.ts` alongside other functions (find existing list — same pattern as crmBotExpireProposalsCron).

---

## Observability

### Event Names (D-06 — confirms recommendation)

Three events per tool-call, all under `event_type='pipeline_decision'`:

| Event Label | When | Payload |
|-------------|------|---------|
| `crm_mutation_invoked` | Start of execute() | `{ tool, workspaceId, invoker?, inputRedacted }` |
| `crm_mutation_completed` | Success path (executed OR duplicate) | `{ tool, workspaceId, invoker?, latencyMs, resultStatus, resultId?, idempotencyKeyHit }` |
| `crm_mutation_failed` | Failure path | `{ tool, workspaceId, invoker?, latencyMs, errorCode }` |

**Naming rationale:** Mirrors crm-query-tools (`crm_query_invoked` / `_completed` / `_failed`) — easy to query side-by-side.

### Payload Field Reference

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `tool` | string | `'updateOrder'` | Public tool name (matches MUT-XX-XX requirement IDs). |
| `workspaceId` | UUID | (workspace UUID) | Always from `ctx.workspaceId`. |
| `invoker` | string \| undefined | `'somnio-sales-v3-pw-confirmation'` | Optional caller agent ID. |
| `inputRedacted` | object | `{ orderIdSuffix: '12345678', body: 'Cliente con…', phoneSuffix: '4567' }` | PII-redacted snapshot. |
| `latencyMs` | number | `127` | `Date.now() - startedAt`. |
| `resultStatus` | string | `'executed'` / `'duplicate'` / `'resource_not_found'` / `'stage_changed_concurrently'` / `'validation_error'` / `'workspace_mismatch'` / `'error'` | Mirrors `MutationResult.status`. |
| `resultId` | UUID \| undefined | (created/updated entity ID) | Optional — present on success. |
| `errorCode` | string | `'order_not_found'` / `'invalid_phone'` / `'db_error'` | Error code from MutationResult. |
| `idempotencyKeyHit` | boolean | `true` if `status='duplicate'` returned via key lookup | New field unique to mutation-tools (query-tools doesn't have idempotency). |

### PII Redaction Helpers

**Reuse (from query-tools):**
- `phoneSuffix(raw)` → last 4 digits only. Inline in each entity file (orders/contacts), pattern at `src/lib/agents/shared/crm-query-tools/contacts.ts:42-44`.

**NEW for mutation-tools:**
- `bodyTruncate(s, max=200)` — for `addContactNote` / `addOrderNote` body fields. Place in `helpers.ts` since notes is the only entity needing it.
- `idSuffix(uuid)` → last 8 chars of UUID for log readability. Pattern at `src/lib/agents/shared/crm-query-tools/orders.ts:375` (`orderId.slice(-8)`).

**No email hash needed unless `createContact`/`updateContact` accept email** — they do (per `CreateContactParams.email`). Recommend hashing only the local-part of email if logged: `email.split('@')[0].slice(0, 3) + '…@' + email.split('@')[1]`. Document in helpers.ts.

### Forensics Query (for INTEGRATION-HANDOFF.md)

```sql
SELECT
  event_label,
  payload->>'tool'        AS tool_name,
  payload->>'invoker'     AS caller_agent,
  payload->>'resultStatus' AS result_status,
  payload->>'errorCode'   AS error_code,
  (payload->>'latencyMs')::int AS latency_ms,
  created_at
FROM agent_observability_events
WHERE event_type = 'pipeline_decision'
  AND event_label IN ('crm_mutation_invoked', 'crm_mutation_completed', 'crm_mutation_failed')
  AND workspace_id = $1
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

---

## Test Strategy

### Wave 0 / Plan 0 (migration + cron)

- Apply migration `crm_mutation_idempotency_keys.sql` + (if Resolution A adopted) `orders_closed_at.sql`.
- **Regla 5 PAUSE** for user to apply SQL in production.
- Add Inngest cron `crm-mutation-idempotency-cleanup`.
- Deploy + verify Inngest registration via `/api/inngest` introspection.

### Unit Tests (~30-40 tests)

**Pattern:** mirror `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts:1-110`.

**Mock targets:**
- `@/lib/domain/contacts` — mock `createContact`, `updateContact`, `archiveContact`, `getContactById`.
- `@/lib/domain/orders` — mock `createOrder`, `updateOrder`, `moveOrderToStage`, `archiveOrder`, `getOrderById`. (+ `closeOrder` if Resolution A.)
- `@/lib/domain/notes` — mock `createNote`, `createOrderNote`, `archiveNote`, `archiveOrderNote`, `getNoteById` if exists.
- `@/lib/domain/tasks` — mock `createTask`, `updateTask`, `completeTask`, `getTaskById` if exists.
- `@/lib/domain/crm-mutation-idempotency` — mock `getIdempotencyRow`, `insertIdempotencyRow`.
- `@/lib/observability` — mock `getCollector`.

**Coverage targets:**
- One test per tool per status (executed, resource_not_found, validation_error, error). `~4 tests × 15 tools = ~60 tests` upper bound; trim duplicates → realistic 30-40.
- Idempotency: replay returns `duplicate` + `idempotencyKeyHit: true` in observability payload.
- `moveOrderToStage`: `stage_changed_concurrently` propagation verified — domain returns `error: 'stage_changed_concurrently'`, tool returns `MutationResult.stage_changed_concurrently` with `expectedStageId` + `actualStageId` (from `data.currentStageId`).
- Workspace mismatch: input contains an entity ID belonging to another workspace → `getXxxById` returns null → tool returns `resource_not_found` (NOT `workspace_mismatch`). **Note:** `workspace_mismatch` status is reserved for explicit cross-workspace input detection (e.g. if input ever carried `workspaceId` field — which it doesn't, per D-pre-03). In V1 this status may be unreachable; document as defensive.
- Observability: assert `recordEventMock.mock.calls.map((c) => c[1])` matches `['crm_mutation_invoked', 'crm_mutation_completed' | 'crm_mutation_failed']`.

### Integration Tests (~6-10 tests, env-gated `describe.skipIf`)

**Path:** `src/__tests__/integration/crm-mutation-tools/`.

**Pattern:** mirror `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts:1-75`.

**Files:**

1. **`cross-workspace.test.ts`** — Insert seed contact in WS_A. Tool with `ctx.workspaceId = WS_B` attempts to update/archive that contact → `resource_not_found`. Verify isolation.
2. **`idempotency.test.ts`** — `createContact` with `idempotencyKey='test-key-1'`. First call → `executed` + new contact ID. Second call → `duplicate` + same contact ID. Verify only ONE row in `contacts` (no double-create). Verify `crm_mutation_idempotency_keys` has exactly one row.
3. **`soft-delete.test.ts`** — Seed contact + note + order + task. Call `archiveContact`, `archiveContactNote`, `archiveOrder`, `completeTask`. Verify each row has `archived_at` / `completed_at` populated and is NOT deleted from DB. Cross-check `SELECT count(*) FROM contacts WHERE id=$1` returns 1.
4. **`stage-change-concurrent.test.ts`** — Seed order in stage A. Mutate stage to B via direct `createAdminClient` (simulating concurrent move from another source). THEN call `moveOrderToStage` from tool with old `stageId=A`. **Requires `crm_stage_integrity_cas_enabled=true` flag in `platform_config`.** Verify result: `MutationResult.stage_changed_concurrently` with `actualStageId=B`.
5. **`base-resource-not-found.test.ts`** (optional) — `createOrder` with bogus `pipelineId` → `resource_not_found` with `missing.resource: 'pipeline'`. Verifies D-pre-05 contract.

### E2E Playwright (~2-4 tests)

**Path:** `e2e/crm-mutation-tools.spec.ts`.

**Pattern:** Use existing `e2e/fixtures/{auth,seed}.ts` from query-tools Wave 0.

**Test structure:**

```typescript
import { test, expect } from '@playwright/test'

test.describe('crm-mutation-tools E2E', () => {
  test('createOrder appears in Kanban initial stage', async ({ page, request }) => {
    // 1. Dispatch via runner endpoint
    const dispatch = await request.post('/api/test/crm-mutation-tools/runner', {
      headers: { 'x-test-secret': process.env.PLAYWRIGHT_TEST_SECRET! },
      data: { tool: 'createOrder', input: { pipelineId: '...', name: 'E2E test order', /*...*/ } },
    })
    const result = await dispatch.json()
    expect(result.status).toBe('executed')

    // 2. Navigate Kanban
    await page.goto('/crm/pedidos')
    await expect(page.getByText('E2E test order')).toBeVisible()
  })

  test('moveOrderToStage moves order across columns', async ({ page, request }) => { /* ... */ })

  test('archiveOrder hides order from Kanban', async ({ page, request }) => { /* ... */ })

  test('completeTask via runner — verified via Supabase round-trip (no UI)', async ({ request }) => {
    // 1. Dispatch completeTask
    // 2. Direct Supabase query asserts tasks.completed_at IS NOT NULL
    // 3. Assert agent_observability_events has crm_mutation_completed event
  })
})
```

### Sampling Rate

- **Per task commit:** `npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__` (~5-10s).
- **Per wave merge:** unit + integration env-gated (skipped without env) (~30s with skip, ~2min with full env).
- **Phase gate:** unit + integration + Playwright E2E (~5min full).

### Wave 0 Gaps

- **Test framework:** ✓ already bootstrapped by query-tools (Playwright + Vitest both present).
- **Fixtures:** `e2e/fixtures/auth.ts` + `seed.ts` — auth helper exists; `seed.ts` body filled in query-tools Plan 06. May need extension for mutation-test fixtures (e.g., seed pipelines + stages for `createOrder` test).
- **Env vars:** `PLAYWRIGHT_TEST_SECRET`, `TEST_WORKSPACE_ID` — already exist for query-tools. Reuse.
- **New files only:** unit + integration test directories, runner endpoint, E2E spec.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Idempotency dedup | Custom hash-of-input + in-memory Set/Map | `crm_mutation_idempotency_keys` table + helper from `helpers.ts` | Hashing input requires canonicalization (key order, whitespace) — fragile. Table-backed survives restarts, scales across instances. |
| PII redaction (phone) | New regex / formatter | `phoneSuffix` inline (mirror `src/lib/agents/shared/crm-query-tools/contacts.ts:42-44`) | Already established pattern. |
| PII redaction (email) | New helper | `email.split('@').map((p, i) => i === 0 ? p.slice(0, 3) + '…' : p).join('@')` inline | Three-line helper; avoid abstraction premature. |
| AI SDK v6 tool signature | `Tool<INPUT, OUTPUT>` direct cast | Two-step cast `as unknown as { execute }` | Documented LEARNINGS Plan 02 Bug 1 — TS strict rejects direct cast. |
| Phone normalization | Custom regex E.164 parser | `normalizePhone` from `@/lib/utils/phone` (used by `webhook-processor.ts`) | Already battle-tested across reader + Somnio agents. |
| Workspace isolation | Manual `workspace_id` checks in tools | `ctx.workspaceId` → `domainCtx` → domain layer filters | Regla 3 enforces this; deviating breaks the contract. |
| CAS retry logic | Loop with backoff | NO retry — propagate `stage_changed_concurrently` to agent | Mirrors crm-writer behavior (`.claude/rules/agent-scope.md` § CRM Writer Bot D-06). Agent decides re-propose strategy. |
| Hard-DELETE for cleanup | `DELETE FROM contacts/orders/tasks/notes WHERE …` | Soft-delete via `archived_at` / `completed_at` | D-pre-04 absolute. Hard delete loses audit trail and breaks FK CASCADE assumptions. |
| TTL cleanup | Postgres trigger + scheduled job | Inngest cron `crm-mutation-idempotency-cleanup` | Established pattern (`crm-bot-expire-proposals.ts`); centralized error handling + observability. |
| Re-hydration after mutation | Use `result.data` from domain (just IDs) | Re-fetch via `getXxxById` post-mutation | D-09 explicit: 1 RTT extra is the cost of correctness. Caller gets fresh state. |
| Stage UUID lookup by name | Hardcoded stage names | UUIDs in input | LEARNINGS Plan 02 D-13. Stage rename breaks hardcoded mappings. |

**Key insight:** This module is a wrapper. Almost zero net-new logic — just orchestration of pre-existing primitives. Hand-rolling anything new (especially auth, dedup, observability) is a code smell. The one and only NEW concept is the idempotency table — and its helper is itself ~50 lines.

---

## Common Pitfalls

### Pitfall 1: CAS Retry Temptation

**What goes wrong:** Tool catches `stage_changed_concurrently` and retries internally — silently masking concurrent edits and creating non-deterministic behavior.

**Why it happens:** "Just one retry can't hurt" mentality. But the whole point of CAS is to surface the conflict to the caller for an informed decision.

**How to avoid:** Tool MUST propagate verbatim. Document in tool's doc-comment: *"NEVER retries on `stage_changed_concurrently`. Caller (agent loop) decides whether to re-propose or escalate to human."*

**Warning signs:** Test "stage-change-concurrent" passes despite CAS reject? Check the tool isn't swallowing the error.

### Pitfall 2: Workspace ID in Input Schema

**What goes wrong:** A developer adds `workspaceId: z.string().uuid()` to a tool's input schema "for explicitness". Now an agent can pass an arbitrary workspace ID and exfiltrate cross-workspace data.

**Why it happens:** Looks "clean" to make context explicit. Forgets that `ctx.workspaceId` is the trusted source.

**How to avoid:**
- Code review: any `inputSchema` containing `workspaceId` is a BLOCKER.
- Grep gate: `grep -E "workspaceId.*uuid|workspaceId.*string" src/lib/agents/shared/crm-mutation-tools/` should return zero matches inside `inputSchema` blocks.

**Warning signs:** Cross-workspace integration test (`cross-workspace.test.ts`) catches this if written correctly.

### Pitfall 3: AI SDK v6 `execute()` Direct Cast

**What goes wrong:** TS strict rejects `(tool as { execute: ... }).execute(input)` — needs two-step `as unknown as`.

**Why it happens:** AI SDK v6 generic `Tool<INPUT, OUTPUT>` strict signature requires `(input, options)` two-arg form; direct cast assumes single-arg.

**How to avoid:** Use the canonical pattern from `src/app/api/test/crm-query-tools/runner/route.ts:78`:

```typescript
const result = await (tool as unknown as { execute: (input: unknown) => Promise<unknown> }).execute(input)
```

**Warning signs:** TS build fails with `Property 'execute' does not exist on type 'Tool<...>'`.

### Pitfall 4: Hard-DELETE Temptation

**What goes wrong:** A developer reads `deleteContact` / `deleteOrder` / `deleteTask` exist in domain (they do — for human UI use only) and wires them into a mutation tool.

**Why it happens:** Easy to confuse "delete" semantically with "archive" when the tool's name was `archiveOrder`.

**How to avoid:**
- Doc-comment in each tool file: *"BLOCKER invariant: NEVER call deleteContact/deleteOrder/deleteTask from this module. Soft-delete only via archived_at/completed_at. D-pre-04."*
- Grep gate: `grep -E "deleteContact|deleteOrder|deleteTask\b" src/lib/agents/shared/crm-mutation-tools/` → 0 matches.

**Warning signs:** Integration `soft-delete.test.ts` will catch this if written correctly (asserts row count UNCHANGED after archive).

### Pitfall 5: Idempotency Race — INSERT Wins, We Don't Know

**What goes wrong:** Two concurrent calls with same `idempotencyKey` race the INSERT. PK conflict → one fails. Naive code returns `executed` for both, doubles the create.

**Why it happens:** Forgetting that INSERT can fail with unique violation. Or using `upsert` and silently overwriting.

**How to avoid:**
- INSERT uses `ON CONFLICT DO NOTHING` + checks the returned row count. If 0 rows inserted → race detected → re-fetch winner row + re-hydrate.
- See helper flow in `## Idempotency Table Design`.

**Warning signs:** Integration test `idempotency.test.ts` runs two mutations with same key in `Promise.all` → only ONE row should exist in entity table.

### Pitfall 6: `result_payload` Drift (Stale Idempotency Cache)

**What goes wrong:** A second `idempotencyKey` lookup hits → tool returns `result_payload` (cached snapshot from initial mutation). Meanwhile, another agent has updated the entity. Caller gets stale data.

**Why it happens:** Treating `result_payload` as the source of truth.

**How to avoid:** D-09 — ALWAYS re-hydrate via `result_id`. Use `result_payload` only as fallback when re-hydration returns null (entity archived/deleted post-storage).

**Warning signs:** `getXxxById` returns null but tool returns stale data.

### Pitfall 7: Validation Error vs Resource Not Found Confusion

**What goes wrong:** Tool returns `validation_error` when domain returns `'Pipeline no encontrado en este workspace'` for `createOrder` — but this is actually a "referenced base resource doesn't exist" case.

**Why it happens:** Domain layer returns generic error strings. Tool needs to map them.

**How to avoid:** Map domain error messages to MutationResult statuses explicitly:

```typescript
const errorMap: Array<[RegExp, MutationResult<never>['status']]> = [
  [/no encontrad[oa]/i, 'resource_not_found'],
  [/^stage_changed_concurrently$/i, 'stage_changed_concurrently'],
  [/requerido|obligatorio|invalid/i, 'validation_error'],
]
```

**Warning signs:** Integration test `base-resource-not-found.test.ts` with bogus pipelineId returns `error` instead of `resource_not_found`.

### Pitfall 8: Missing CAS Flag = Silent Last-Write-Wins on `moveOrderToStage`

**What goes wrong:** Tool tests pass under Vitest mocks; integration test under flag-disabled DB doesn't exercise CAS path; production behaves last-write-wins.

**Why it happens:** `moveOrderToStage` CAS is gated by `platform_config.crm_stage_integrity_cas_enabled` (default `false` per `src/lib/domain/orders.ts:632`).

**How to avoid:**
- Integration test `stage-change-concurrent.test.ts` MUST set `platform_config.crm_stage_integrity_cas_enabled=true` in beforeAll.
- Document in INTEGRATION-HANDOFF: production deployment requires flag flip to enable CAS protection.

**Warning signs:** Integration test passes but stage_changed_concurrently never fires.

### Pitfall 9: `closeOrder` Missing Domain Function (current state)

**What goes wrong:** Plan attempts to wrap a non-existent domain function. Either crashes at TS compile or silently no-ops.

**Why it happens:** CONTEXT.md D-02 lists `closeOrder` but the column + function don't exist (verified via grep, confirmed in `archiveOrder` doc-comment).

**How to avoid:** Resolve via Resolution A (add column + function) in Wave 0 OR descope to Resolution C. **Plan-phase MUST NOT skip this.** See `## Domain Layer Audit § closeOrder`.

**Warning signs:** Wave 0 plan doesn't mention `closed_at` column or `closeOrder` domain function.

### Pitfall 10: Cross-Module Refactor Temptation

**What goes wrong:** Developer notices `crm-writer/types.ts:43-52` has `ResourceType` union and `crm-mutation-tools/types.ts` re-defines it. Tries to unify them mid-standalone.

**Why it happens:** "DRY" instinct.

**How to avoid:** Mirror separately in this standalone. Cross-module type unification is a deferred standalone. LEARNINGS Plan 05 patterns (#7).

**Warning signs:** Imports from `@/lib/agents/crm-writer/types` inside `src/lib/agents/shared/crm-mutation-tools/`.

### Pitfall 11: Two-Step Writer + Deterministic Mutation Race

**What goes wrong:** Agent A uses crm-writer to propose `archiveOrder` (status='proposed' in `crm_bot_actions`). Agent B uses mutation-tools to call `archiveOrder` directly. Both target same orderId. Writer's `confirmAction` later succeeds (idempotent on already-archived order; archiveOrder is idempotent at domain). But the `crm_bot_actions` row shows "executed" implying writer caused the change — misleading audit.

**Why it happens:** Coexistence of two write paths on same entities (D-01). Both modules independently call the same domain functions.

**How to avoid:** **Document this as a known limitation in INTEGRATION-HANDOFF.md.** No orchestration enforces ordering. Recommend: a workspace should not have BOTH a crm-writer-using agent AND a mutation-tools-using agent operating on the same entity classes simultaneously. If they do, audit forensics need both `crm_bot_actions` and `agent_observability_events` queried together.

**Warning signs:** Forensics shows entity in conflicting states across two audit sources.

---

## Code Examples

Verified file paths to mirror exactly:

### Module Skeleton (mirror `src/lib/agents/shared/crm-query-tools/index.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/index.ts:23-28`

### Types (mirror `src/lib/agents/shared/crm-query-tools/types.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/types.ts:24-51`

Key adaptations: replace `CrmQueryLookupResult` / `CrmQueryListResult` with `MutationResult<T>` (7 statuses per D-07).

### Helpers (mirror `src/lib/agents/shared/crm-query-tools/helpers.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/helpers.ts`

Key adaptations: replace `resolveContactByPhone` / `findActiveOrderForContact` (read helpers) with `withIdempotency` + `mapDomainError` (write helpers).

### Tool Template (mirror `src/lib/agents/shared/crm-query-tools/contacts.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/contacts.ts:46-167`

Key adaptations:
- `tool({ description, inputSchema, execute })` shape unchanged.
- Pre-check via `getXxxById` before mutation.
- Post-mutation re-hydration via `getXxxById` (D-09).
- Three observability events per execute branch.

### Test Runner Endpoint (mirror `src/app/api/test/crm-query-tools/runner/route.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/app/api/test/crm-query-tools/runner/route.ts:1-89`

Key adaptations: replace `ALLOWED_TOOLS` Set with the 15 mutation tool names.

### Migration (mirror `supabase/migrations/20260429172905_crm_query_tools_config.sql`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/supabase/migrations/20260429172905_crm_query_tools_config.sql`

Key adaptations: drop the active_stages junction table; replace with single `crm_mutation_idempotency_keys` table + index on `created_at`. Same RLS pattern (member SELECT, service_role ALL, authenticated SELECT).

### Inngest Cron (mirror `src/inngest/functions/crm-bot-expire-proposals.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/inngest/functions/crm-bot-expire-proposals.ts:43-72`

Key adaptations: change cron to `'TZ=America/Bogota 0 3 * * *'` (daily 03:00 vs 1-min sweeps); call `pruneIdempotencyRows(30)` instead of expire-proposals logic.

### Integration Test (mirror `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/__tests__/integration/crm-query-tools/cross-workspace.test.ts:1-75`

Key adaptations: replace tool calls with mutation tool calls; assert row state in DB post-mutation via direct admin client.

### Unit Test Pattern (mirror `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts`)

**Mirror file:** `/mnt/c/Users/Usuario/Proyectos/morfx-new/src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts:1-110`

Key adaptations: `vi.hoisted` block names new domain mocks (createContactMock, updateContactMock, etc.). Use the two-step cast pattern (Pitfall 3).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Agents mutating CRM via two-step propose+confirm only (`crm-writer`) | Coexistence: deterministic in-loop tool calls (`crm-mutation-tools`) for confident mutations + propose+confirm for human-in-loop | This standalone (2026-04-29) | Latency mitad (50-150ms vs 150-300ms two-step). Determinism (single state vs propose+confirm). Symmetry with query-tools. |
| Hard-coded retries on stage moves | CAS-protected `moveOrderToStage` + `stage_changed_concurrently` propagation | Standalone `crm-stage-integrity` (2026-04-21..) | Surfaces conflict to agent; no silent overwrite. |
| Hard DELETE on archive | Soft-delete only (`archived_at` / `completed_at`) | Phase 44 (2026-03..04) | Audit trail preserved; FK CASCADE intact. |
| Per-mutation cache in session_state | No cache; re-hydrate per call | crm-query-tools D-19 (2026-04-29) | Eliminates stale data class of bugs. |
| Custom tool framework | AI SDK v6 `tool({...})` | Project-wide | Standard typed schema, future-proof. |
| Twilio | Onurix (SMS) | 2026-04-16 | Not relevant to mutation-tools. |

**Deprecated/outdated for mutation-tools context:**
- **None to deprecate in this standalone.** crm-writer is NOT deprecated (D-01 coexistence).

---

## Assumptions Log

| # | Claim | Section | Source | Risk if Wrong |
|---|-------|---------|--------|---------------|
| A1 | `closeOrder` does not exist in domain or schema | Domain Layer Audit § MUT-OR-05 | [VERIFIED: grep `closed_at` over `src/lib/domain/` + `supabase/migrations/` returns 0 matches; `archiveOrder` doc-comment at `src/lib/domain/orders.ts:1606-1610` confirms] | If wrong (column exists with another name): plan adds redundant migration. Low risk; verifiable in 30s. |
| A2 | Resolution A (add `orders.closed_at` + new domain function) is correct interpretation of CONTEXT D-02 | Domain Layer Audit § closeOrder | [ASSUMED] — CONTEXT D-02 says "toggle closed_at" but doesn't specify migration path. | If user wants Resolution C (descope): plan changes from 15 to 14 tools. Surface in plan-phase. |
| A3 | Idempotency `result_payload` storage is JSONB sufficient for re-hydration fallback | Idempotency Table Design | [VERIFIED: pattern from `crm_bot_actions.preview JSONB` at `src/lib/agents/crm-writer/two-step.ts:68`] | If wrong: rare race on archived entity returns stale snapshot. Low risk; D-09 says always re-hydrate first. |
| A4 | Existing `PLAYWRIGHT_TEST_SECRET` + `TEST_WORKSPACE_ID` env vars can be reused for mutation runner | Test Strategy § E2E | [VERIFIED: query-tools runner endpoint uses these at `src/app/api/test/crm-query-tools/runner/route.ts:34,47`] | If wrong (vars not set in preview): E2E spec skips. Visible failure mode. |
| A5 | `stage_changed_concurrently` flag (`platform_config.crm_stage_integrity_cas_enabled`) is acceptable as integration test prerequisite | Test Strategy § Integration | [VERIFIED: `src/lib/domain/orders.ts:632`] | If wrong (flag not flippable in test env): integration test for CAS skips with notice. Low risk. |
| A6 | `is_workspace_member` + `is_workspace_admin` RLS helpers exist and apply to the new table | Idempotency Table Design § Migration | [VERIFIED: used in `supabase/migrations/20260429172905_crm_query_tools_config.sql:26,30`] | If wrong: migration apply fails; user catches in Regla 5 PAUSE. |
| A7 | `agent_observability_events` table accepts arbitrary JSONB payloads for `pipeline_decision:*` events | Observability | [VERIFIED: query-tools emits identical structure at `src/lib/agents/shared/crm-query-tools/contacts.ts:71-74`] | If wrong: events drop silently. Detected in unit tests via mock assertions. |
| A8 | The `workspace_mismatch` status from D-07 is reachable in V1 | Test Strategy § Unit | [ASSUMED] D-pre-03 says workspace ALWAYS from ctx; tools' input schemas don't accept workspaceId — so this status path may be dead code in V1. | Low risk. If unreachable, retain as defensive placeholder + document. |
| A9 | The 15-tool list is closed and final per D-02 | All sections | [VERIFIED: CONTEXT.md D-02 explicitly says "Lista cerrada para este standalone"] | If user adds tools: scope creep, re-plan. |
| A10 | `crm_mutation_idempotency_keys` polymorphic `result_id UUID NOT NULL` (no FK) is acceptable | Idempotency Table Design | [ASSUMED] Polymorphic keys (one row maps to a contact, order, note, or task by tool_name discriminator) — FK to a single table would force per-tool tables. | If wrong (user wants strong referential integrity): switch to per-tool tables (5 tables instead of 1) — significant cost. Recommend defending the polymorphic design in plan-phase. |
| A11 | Domain functions for note-by-id + task-by-id exist or are easy to add | Test Strategy + Pattern 4 | [PARTIAL] `getNoteById` + `getTaskById` were not verified by grep. May need to be added to domain in this standalone for re-hydration. | LOW risk; trivial getters. Plan adds them if missing. |
| A12 | `inngest@^3.51.0` cron syntax `'TZ=America/Bogota 0 3 * * *'` works | Stack | [VERIFIED: identical syntax at `src/inngest/functions/close-stale-sessions.ts:35`] | If wrong: cron schedule offset by 5h (UTC). Visible in Inngest dashboard. |

---

## Open Questions

### Q1: `closeOrder` semantics — Resolution A, B, or C?

- **What we know:** `closed_at` does not exist in schema. `closeOrder` does not exist in domain. CONTEXT D-02 lists it but doesn't specify implementation path. `archiveOrder`'s doc-comment suggests "move to closed stage + archive" pattern.
- **What's unclear:** User intent — did they assume `closed_at` exists (it doesn't), did they want a new column, or is "close" synonymous with "archive" semantically?
- **Recommendation:** Surface to user in plan-phase opening. **Default position:** Resolution A (add column + domain function in Wave 0). One-line clarification suffices: *"closeOrder semantics — add `orders.closed_at` column + domain function (Resolution A) OR descope to V1.1 (Resolution C)?"*

### Q2: Polymorphic `result_id` vs. per-tool tables for idempotency?

- **What we know:** A single `crm_mutation_idempotency_keys` table with `result_id UUID NOT NULL` (no FK constraint) is the simplest design. Per-tool tables (`crm_mutation_idempotency_keys_contacts`, `_orders`, `_notes`, `_tasks`) gives FK referential integrity.
- **What's unclear:** Forensics value of FK enforcement vs. operational cost of N tables.
- **Recommendation:** Polymorphic single table (A10). The TTL cron sweeps everything; FK CASCADE is already on `workspace_id` (via `workspaces` FK) so workspace deletion cleans up. Per-tool tables = unnecessary fragmentation.

### Q3: Email PII redaction — needed in observability payload?

- **What we know:** `createContact` / `updateContact` accept `email`. Domain logs include emails today (`createNote` activity preview, etc.).
- **What's unclear:** Whether mutation observability needs to redact email or pass through.
- **Recommendation:** Redact local-part of email in observability payload — `joserome…@gmail.com` (first 8 chars + masked). Implement as inline helper in `helpers.ts`. Cost: 5 lines.

### Q4: Should `validation_error` map zod errors automatically?

- **What we know:** AI SDK `tool({ inputSchema })` parses input via zod automatically. Invalid input throws BEFORE `execute` is called — caller sees zod error, not `MutationResult.validation_error`.
- **What's unclear:** Whether we need a wrapper that catches zod errors and converts them. The existing query-tools doesn't (zod errors throw upstream).
- **Recommendation:** No wrapper. Match query-tools behavior. Caller (agent loop) handles zod errors at AI SDK layer. Document in INTEGRATION-HANDOFF: *"Invalid input → AI SDK throws zod error before execute; this is NOT a MutationResult.validation_error. Use `validation_error` for cross-field validation errors detected inside execute (e.g., contactId+orderId both provided in createTask)."*

### Q5: Should the runner endpoint expose internal idempotency state?

- **What we know:** Playwright spec might need to assert `idempotencyKeyHit: true` after a replay.
- **What's unclear:** Whether runner returns the full MutationResult with this metadata or strips it.
- **Recommendation:** Pass through verbatim. The runner endpoint already returns the tool's result raw (`return NextResponse.json(result)` at line 79 of query-tools runner). Test assertions read `result.status === 'duplicate'` directly.

### Q6: Should we add a per-tool README or just one INTEGRATION-HANDOFF?

- **What we know:** crm-query-tools has one INTEGRATION-HANDOFF + one project skill.
- **What's unclear:** Mutation tools' surface is larger (15 vs 5). Single doc may grow long.
- **Recommendation:** Mirror query-tools — one INTEGRATION-HANDOFF + one skill. Use clear `### Tool: createContact` section headers; let readers Cmd+F.

### Q7: Should `updateContact` accept partial-update semantics or replace-all?

- **What we know:** Domain `UpdateContactParams` accepts optional fields (partial). `updateContact` at `src/lib/domain/contacts.ts:189` performs partial update (only changes provided fields).
- **What's unclear:** Whether to expose all fields in tool input schema or a subset.
- **Recommendation:** All fields except `customFields` — `customFields` is JSONB and complex schema. Defer to V1.1. Match query-tools' D-pre-06 "entity-complete operations" interpretation: tool accepts partial update but operates on a whole entity.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build + runtime | ✓ | 20.x (Vercel default) | — |
| pnpm | Install | ✓ | (matches `pnpm-lock.yaml`) | NEVER use npm/bun (LEARNINGS Plan 01 Bug 3) |
| AI SDK v6 | Tool framework | ✓ | `^6.0.86` | — |
| Playwright | E2E | ✓ | `1.58.2` (pinned exact) | — |
| Vitest | Unit + integration | ✓ | (in package.json) | — |
| Inngest | TTL cron | ✓ | `^3.51.0` | — |
| Supabase Postgres | DB | ✓ | (production) | — |
| `crm_query_tools_config` table | (reference for migration template only) | ✓ (shipped 2026-04-29) | — | — |
| `crm_bot_actions` table | (reference for crm-writer pattern only) | ✓ | — | — |
| `agent_observability_events` table | Audit sink | ✓ (existing) | — | — |
| `platform_config.crm_stage_integrity_cas_enabled` | Integration test prerequisite | ✓ flag exists | default `false` | Test must flip flag to true in beforeAll |
| `PLAYWRIGHT_TEST_SECRET` env | Runner endpoint gate | ✓ (set for query-tools) | — | E2E skipped without |
| `TEST_WORKSPACE_ID` env | Runner workspace | ✓ (set for query-tools) | — | E2E skipped without |
| `TEST_WORKSPACE_ID_2` env | Cross-workspace test | ✓ (set for query-tools) | — | Integration test skipped without |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — environment is fully provisioned by query-tools predecessor.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (unit + integration) | Vitest (already installed) |
| Framework (E2E) | `@playwright/test@1.58.2` (already installed by query-tools Wave 0) |
| Config file | `vitest.config.ts` (existing) + `playwright.config.ts` (existing) |
| Quick run command | `npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__` |
| Full suite command | `npx vitest run && npx playwright test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MUT-CT-01 | createContact happy path + idempotency hit | unit | `npx vitest run src/lib/agents/shared/crm-mutation-tools/__tests__/contacts.test.ts -t "createContact"` | ❌ Wave 1 |
| MUT-CT-02 | updateContact resource_not_found | unit | `npx vitest run -t "updateContact resource_not_found"` | ❌ Wave 2 |
| MUT-CT-03 | archiveContact idempotent | unit | `npx vitest run -t "archiveContact idempotent"` | ❌ Wave 2 |
| MUT-OR-01 | createOrder + Kanban render | E2E | `npx playwright test -g "createOrder appears in Kanban"` | ❌ Wave 4 |
| MUT-OR-02 | updateOrder partial update | unit | `npx vitest run -t "updateOrder"` | ❌ Wave 2 |
| MUT-OR-03 | moveOrderToStage CAS reject path | integration | `npx vitest run src/__tests__/integration/crm-mutation-tools/stage-change-concurrent.test.ts` | ❌ Wave 4 |
| MUT-OR-04 | archiveOrder hides from Kanban | E2E | `npx playwright test -g "archiveOrder hides"` | ❌ Wave 4 |
| MUT-OR-05 | closeOrder | unit | `npx vitest run -t "closeOrder"` | ❌ Wave 2 (after Resolution A migration) |
| MUT-NT-01..04 | notes CRUD + soft-delete | unit + integration | `npx vitest run -t "Note"` + `soft-delete.test.ts` | ❌ Wave 3 + Wave 4 |
| MUT-TK-01..03 | tasks CRUD + completeTask | unit + integration | `npx vitest run -t "Task"` + `soft-delete.test.ts` | ❌ Wave 3 + Wave 4 |
| All | cross-workspace isolation | integration | `npx vitest run src/__tests__/integration/crm-mutation-tools/cross-workspace.test.ts` | ❌ Wave 4 |
| All | idempotency replay | integration | `npx vitest run src/__tests__/integration/crm-mutation-tools/idempotency.test.ts` | ❌ Wave 4 |

### Sampling Rate

- **Per task commit:** unit tests for the modified entity file (~5-10s).
- **Per wave merge:** unit + integration env-gated suite (~30s skipped, ~2min full).
- **Phase gate:** unit + integration + Playwright E2E all green; runner endpoint smoke (~5min).

### Wave 0 Gaps

- ❌ `supabase/migrations/{timestamp}_crm_mutation_idempotency_keys.sql` (NEW)
- ❌ (Resolution A) `supabase/migrations/{timestamp}_orders_closed_at.sql` (NEW)
- ❌ `src/lib/domain/crm-mutation-idempotency.ts` (NEW)
- ❌ `src/inngest/functions/crm-mutation-idempotency-cleanup.ts` (NEW)
- ❌ Registration of new cron in `src/app/api/inngest/route.ts`
- ✓ Test framework (Playwright + Vitest already bootstrapped)
- ✓ E2E fixtures (extend `e2e/fixtures/seed.ts` with mutation-tools seed helpers)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Inherited from agent's invocation context. Tool trusts `ctx.workspaceId` only after agent's middleware validated session. NO auth checks inside tool. |
| V3 Session Management | no | Stateless tools — no session created or referenced. Idempotency rows are workspace-scoped, not session-scoped. |
| V4 Access Control | yes | Workspace isolation via domain-layer `workspace_id` filter. Cross-workspace integration test (`cross-workspace.test.ts`) verifies. RLS on idempotency table requires workspace membership. |
| V5 Input Validation | yes | zod schemas on every tool's `inputSchema`. Phone normalization for contact tools. Body length limits implicit (DB column types — `content TEXT` is permissive but `bodyTruncate` redacts in observability). |
| V6 Cryptography | no | No new crypto. Existing patterns (UUID via `crypto.randomUUID`) reused. |
| V13 API Security | yes | Test runner endpoint at `/api/test/crm-mutation-tools/runner` 4-gate hardened: NODE_ENV + secret + env-workspace + tool allow-list (mirrors query-tools runner). |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace mutation via input forgery | Tampering / Information Disclosure | `ctx.workspaceId` only — never input. Domain filters by `workspace_id` (Regla 3). Tool input schema MUST NOT contain `workspaceId` (Pitfall 2). |
| Replay attack via idempotency key collision | Spoofing / Tampering | PK `(workspace_id, tool_name, key)` — keys are workspace-scoped; one workspace's keys can't collide with another's. RLS prevents cross-workspace SELECT. |
| Stale read on idempotency replay | Tampering / Information Disclosure | D-09: re-hydrate via `result_id`, not `result_payload`. Pitfall 6. |
| Concurrent stage move race | Tampering | CAS at domain level (`crm_stage_integrity_cas_enabled` flag); tool propagates `stage_changed_concurrently` verbatim, never retries (Pitfall 1). |
| Hard DELETE bypassing audit trail | Repudiation | D-pre-04: soft-delete only via `archived_at` / `completed_at`. Domain `deleteContact/deleteOrder/deleteTask` are FORBIDDEN inside this module (Pitfall 4). |
| PII leak in observability events | Information Disclosure | `phoneSuffix` (last 4 only), `bodyTruncate` (200 chars max), email local-part redaction inline in observability emit. |
| Test runner endpoint exposed in prod | Elevation of Privilege | NODE_ENV gate FIRST (404 in prod) + secret header + env workspace + tool allow-list (4 layers). |
| SQL injection via tool input | Tampering | All DB calls go through Supabase JS client (parameterized queries). zod validates input shape. |
| `.claude/skills/` write blocked | Operational | Orchestrator pre-write pattern (LEARNINGS Plan 07 Bug 1). Plan 5 (this standalone's docs plan) MUST anticipate. |

---

## Sources

### Primary (HIGH confidence — VERIFIED in codebase)

- `src/lib/agents/shared/crm-query-tools/{index,types,contacts,orders,helpers}.ts` — full mirror reference, all line ranges read 2026-04-29.
- `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts:1-110` — unit test pattern.
- `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts:1-75` — integration test pattern.
- `src/app/api/test/crm-query-tools/runner/route.ts:1-89` — runner endpoint pattern.
- `supabase/migrations/20260429172905_crm_query_tools_config.sql:1-99` — migration template.
- `src/lib/domain/contacts.ts` (lines 27-672 sampled) — createContact, updateContact, archiveContact, getContactById all exist.
- `src/lib/domain/orders.ts` (lines 75-1932 sampled) — createOrder, updateOrder, moveOrderToStage (CAS), archiveOrder, getOrderById exist; **closeOrder DOES NOT EXIST**, **closed_at column DOES NOT EXIST**.
- `src/lib/domain/notes.ts` (lines 1-715 sampled) — createNote, createOrderNote, archiveNote, archiveOrderNote exist.
- `src/lib/domain/tasks.ts:1-385` — createTask, updateTask, completeTask, deleteTask exist.
- `src/lib/agents/crm-writer/two-step.ts:1-80` — confirms crm-writer pattern; informs Pitfall 11 documentation.
- `src/lib/agents/crm-writer/types.ts:43-52` — `ResourceType` union (mirror in mutation-tools types).
- `src/inngest/functions/crm-bot-expire-proposals.ts:43-72` — Inngest cron pattern.
- `src/inngest/functions/close-stale-sessions.ts:35` — `'TZ=America/Bogota'` cron syntax verified.
- `package.json:15,49,75` — verified versions of `@ai-sdk/anthropic`, `ai@^6.0.86`, `@playwright/test`.
- `.planning/standalone/crm-query-tools/{CONTEXT,RESEARCH,LEARNINGS}.md` — sibling standalone reference (RESEARCH partially read; LEARNINGS read in full).
- `CLAUDE.md` — Reglas 0-6, scope rules.

### Secondary (MEDIUM confidence — pattern-inferred)

- `crm_query_tools_active_stages` junction table pattern → informs idempotency table single-table polymorphic design (NOT junction — our case is keyed by tool_name discriminator, not entity FK).
- D-19 "no cache" rationale from query-tools → mirror for mutation-tools' "always re-hydrate" rule (D-09).

### Tertiary (LOW confidence — flagged for plan-phase or discuss confirmation)

- `closeOrder` Resolution choice (A/B/C) — assumption A is recommended but not user-confirmed. **Surface in plan-phase.**
- `workspace_mismatch` status reachability in V1 — possibly dead code (A8). Document defensively.
- `result_id UUID NOT NULL` polymorphic FK design — recommend single table (A10), but per-tool tables is a valid alternative if user prioritizes referential integrity.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all packages already pinned in `package.json`; mirror module shipped 2026-04-29.
- Architecture: HIGH — direct mirror of crm-query-tools structure; only NEW concept is idempotency table which is well-bounded.
- Domain Layer Audit: HIGH — verified by direct codebase read 2026-04-29; one explicit gap surfaced (`closeOrder`).
- Idempotency Design: MEDIUM — table schema is concrete; polymorphic `result_id` design is defensible but not yet user-confirmed.
- Pitfalls: HIGH — most are documented from query-tools LEARNINGS (Plan 02 Bug 1, Plan 04 Bug 1, Plan 05 Bug 4, Plan 07 Bug 1) + crm-writer scope rules.
- Tests: HIGH — direct mirror of query-tools test pattern; Playwright already bootstrapped; all env vars exist.
- Observability: HIGH — same collector + same event shape as query-tools.
- Security: HIGH — same 4-gate runner endpoint; same workspace-isolation rules; soft-delete invariant.

**Research date:** 2026-04-29

**Valid until:** 2026-05-29 (30 days, stable codebase). After that, re-verify versions and any new domain functions added.

---

*Research complete. Ready for `/gsd-plan-phase crm-mutation-tools`.*
*Sibling reference: `.planning/standalone/crm-query-tools/` (shipped 2026-04-29 — same patterns, opposite verb).*
