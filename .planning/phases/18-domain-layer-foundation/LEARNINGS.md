# Phase 18 Learnings — Domain Layer Foundation

## Phase Stats
- **Plans:** 10 (9 implementation + 1 verification)
- **Commits:** ~22 feat + 2 hotfix = ~24 total
- **Duration:** 1 day (2026-02-13)
- **Domain functions:** 33 across 8 modules
- **New tool handlers:** 13
- **Dead triggers activated:** 2

## Critical Bugs Found

### Bug 1: initializeTools() dropped during refactor
- **Severity:** P0 — orders silently not created
- **Root cause:** Plan 18-03 refactored ProductionOrdersAdapter from `createContactAndOrder()` (which called `initializeTools()`) to `findOrCreateContact()` directly (which does NOT)
- **Lesson:** When refactoring a call chain, trace ALL side effects of the original path. `createContactAndOrder()` had `initializeTools()` as a hidden dependency that wasn't in the function signature.
- **Prevention:** Add `initializeTools()` as the FIRST line of any function that eventually calls `executeToolFromAgent` in serverless contexts (Inngest, edge functions). It's idempotent — calling it extra times is safe.

### Bug 2: workspace_members .single() with multi-workspace
- **Severity:** P1 — page inaccessible
- **Root cause:** Pre-existing from Phase 11, surfaced when user joined second workspace
- **Lesson:** EVERY query to `workspace_members` that uses `.single()` MUST filter by `workspace_id`. Without it, users in 2+ workspaces get errors.
- **Prevention:** When writing workspace_members queries, always include `.eq('workspace_id', workspaceId)`.

## Architecture Patterns Established

### Domain Layer Pattern
```
src/lib/domain/{entity}.ts
- Uses createAdminClient() (bypasses RLS)
- Filters by workspace_id (manual isolation)
- Emits automation triggers after mutation
- Returns DomainResult<T> { success, data?, error? }
- Params: (ctx: DomainContext, params: EntityParams)
```

### Caller Hierarchy (who calls what)
```
Server Actions → domain/ (auth + Zod + revalidatePath as adapter concerns)
Tool Handlers  → domain/ (needs initializeTools() in serverless)
Action Executor → domain/ (cascade depth propagated)
Webhooks       → domain/ (Shopify, WhatsApp)
Adapters       → domain/ (ProductionOrdersAdapter)
```

### What stays OUT of domain/
- Auth/session checks (server action concern)
- Zod validation (server action concern)
- revalidatePath (server action concern)
- WIP limit checks (server action adapter concern)
- shopify_order_id field (webhook adapter concern)
- unarchiveConversation (simple status flip, no trigger needed)
- Custom field DEFINITIONS CRUD (admin config, not CRM mutation)

## Trigger Emission Rules
- Every domain mutation that maps to a TRIGGER_CATALOG entry emits its trigger
- Emissions are fire-and-forget (never block the caller)
- Cascade depth passed from DomainContext to prevent infinite loops (MAX=3)
- Keyword match emits once per automation (first matching keyword wins)
- task.overdue cron runs every 15 min, 24h dedup window, 200 task cap

## Refactoring Strategy That Worked
1. Create domain function with full DB logic + trigger emission
2. Wire callers one by one (server actions, tool handlers, executor, webhooks, adapters)
3. Remove old inline DB code from callers
4. Verify no orphaned trigger emissions remain in old callers

## What Would Be Different Next Time
- Run `initializeTools()` audit BEFORE marking a plan complete when tool handlers are involved
- Add integration test: "bot creates order end-to-end" as automated check (not just human verify)
- When refactoring call chains, create a "side effects checklist" of everything the old path did
