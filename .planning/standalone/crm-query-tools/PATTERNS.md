# Pattern Map — crm-query-tools

**Mapped:** 2026-04-29
**Standalone:** `.planning/standalone/crm-query-tools/`
**Files analyzed:** 28 (24 NEW + 4 EXTEND)
**Analogs found:** 25 / 28 (high), 2 / 28 (medium — Wave 0 bootstrap), 1 / 28 (low — placement decision)

---

## Summary

The codebase has a near-complete pattern set for this build:

- **Tools, types, factory aggregator, domain layer, observability emit, RLS migration template, multi-select UI, Vitest mock, integration test scaffolding** are all 1:1 copy/extend from `crm-reader/*`, `crm-writer-adapter`, `routing/*`, `carrier_configs`, `workspace_agent_config`, `platform_config`, and `crm-bots/reader.test.ts`.
- **Wave 0 gaps** (Playwright bootstrap + test runner endpoint) lack direct analogs in this repo. Recommended patterns are flagged MEDIUM/LOW confidence with concrete templates.
- **Anti-pattern enforcement** verified via grep: zero `createAdminClient` invocations exist in `src/lib/agents/crm-reader/tools/**` (only one comment line that DOCUMENTS the invariant). Pattern compliance is real.
- **One placement decision** flagged: `.claude/skills/` directory does not exist in this repo (only `.claude/rules/` exists with 3 files). Recommend creating `.claude/skills/` (matches user-stated convention in CONTEXT D-26) OR placing the skill at `.claude/rules/crm-query-tools.md` to follow what's already on disk. Planner decides.

---

## Pattern Reuse Map

### NEW files (24)

| # | New File | Analog (file:line) | Role | Data Flow | Confidence |
|---|----------|-------------------|------|-----------|------------|
| 1 | `supabase/migrations/2026MMDDHHMMSS_crm_query_tools_config.sql` | `supabase/migrations/20260209000000_agent_production.sql:11-39` (RLS) + `supabase/migrations/20260224000000_guide_gen_config.sql:18-26` (FK SET NULL) + `supabase/migrations/20260420000443_platform_config.sql:30-37` (GRANTs) | Migration | DDL | HIGH |
| 2 | `src/lib/domain/crm-query-tools-config.ts` | `src/lib/domain/contacts.ts:539-580` (search) + `src/lib/domain/contacts.ts:610-658` (getById) + `src/lib/domain/pipelines.ts:49-83` (workspace-scoped read) | Domain | CRUD | HIGH |
| 3 | `src/lib/agents/shared/crm-query-tools/index.ts` | `src/lib/agents/crm-reader/tools/index.ts:17-24` (factory aggregator) | Tool factory | Module composition | HIGH |
| 4 | `src/lib/agents/shared/crm-query-tools/types.ts` | `src/lib/agents/crm-reader/types.ts:14-58` (discriminated union) | Type | — | HIGH |
| 5 | `src/lib/agents/shared/crm-query-tools/contacts.ts` | `src/lib/agents/crm-reader/tools/contacts.ts:24-77` (tool factory + AI SDK v6 `tool()`) | Tool | Request → domain → typed result | HIGH |
| 6 | `src/lib/agents/shared/crm-query-tools/orders.ts` | `src/lib/agents/crm-reader/tools/orders.ts:22-73` (4 tools, same shape) | Tool | Request → domain → typed result | HIGH |
| 7 | `src/lib/agents/shared/crm-query-tools/helpers.ts` | RESEARCH.md `Example 3` (active-order filter) — no direct analog, derived | Utility | Pure compute | MEDIUM |
| 8 | `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` | `src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts:1-90` (vi.hoisted + vi.mock) | Test (unit) | Mock domain → assert tool result | HIGH |
| 9 | `src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts` | Same as #8 | Test (unit) | Mock domain → assert tool result | HIGH |
| 10 | `src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts` | `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts:1-55` (pure-function unit test) | Test (unit) | Pure compute assertions | HIGH |
| 11 | `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts` | `src/__tests__/integration/crm-bots/reader.test.ts:1-90` (env-gated, real Supabase) | Test (integration) | Live DB seed → tool call → assert isolation | HIGH |
| 12 | `src/__tests__/integration/crm-query-tools/config-driven.test.ts` | Same as #11 | Test (integration) | Seed config → assert FK behavior | HIGH |
| 13 | `src/__tests__/integration/crm-query-tools/duplicates.test.ts` | Same as #11 | Test (integration) | Seed dup phones → assert duplicates flag | HIGH |
| 14 | `src/app/(dashboard)/agentes/crm-tools/page.tsx` | `src/app/(dashboard)/agentes/routing/page.tsx:1-156` (Server Component + getActiveWorkspaceId + parallel domain fetch) | UI page | Server render | HIGH |
| 15 | `src/app/(dashboard)/agentes/crm-tools/_actions.ts` | `src/app/(dashboard)/agentes/routing/_actions.ts:1-133` (server action + revalidatePath + getActiveWorkspaceId guard) | Server action | Form submit → domain → revalidate | HIGH |
| 16 | `src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx` | `src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx:36-136` (popover + checkbox multi-select with grouping) + `src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx` (Client Component pattern) | UI component | Client form state → server action call | HIGH |
| 17 | `playwright.config.ts` | NO ANALOG IN REPO — Wave 0 bootstrap | Config | — | MEDIUM (recommendation below) |
| 18 | `e2e/crm-query-tools.spec.ts` | NO ANALOG IN REPO — Wave 0 bootstrap; RESEARCH.md `Example 6` provides skeleton | Test (E2E) | Browser → UI → DB → tool runner | MEDIUM |
| 19 | `e2e/fixtures/auth.ts` | NO ANALOG IN REPO; closest is `src/__tests__/integration/crm-bots/reader.test.ts:40-51` (env-gated TEST_API_KEY pattern) | Test fixture | Auth bootstrap | MEDIUM |
| 20 | `e2e/fixtures/seed.ts` | NO ANALOG IN REPO; closest pattern is `src/__tests__/integration/orders-cas.test.ts` setup blocks (workspace seeding) | Test fixture | DB seed | MEDIUM |
| 21 | `src/app/api/test/crm-query-tools/runner/route.ts` | NO ANALOG — `src/app/api/test/` directory does not exist in repo. Closest pattern: any `src/app/api/v1/**/route.ts` for Next 16 route handler shape | API route (env-gated) | HTTP POST → tool invocation | LOW (must propose minimal pattern) |
| 22 | `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` | `.planning/standalone/somnio-sales-v3-pw-confirmation/INTEGRATION-HANDOFF.md` if exists, else `.planning/standalone/somnio-recompra-crm-reader/LEARNINGS.md` (handoff narrative pattern) | Doc | — | MEDIUM |
| 23 | `.claude/skills/crm-query-tools.md` | NO ANALOG — `.claude/skills/` directory DOES NOT EXIST. Closest is `.claude/rules/agent-scope.md` (PUEDE / NO PUEDE template) | Skill doc | — | LOW (placement decision needed) |
| 24 | `.planning/standalone/crm-query-tools/LEARNINGS.md` | Other shipped standalones (e.g., `.planning/standalone/client-activation-auto-revoke/`) | Doc | — | HIGH |

### EXTEND files (4)

| # | File | Section to Extend | What's missing | Confidence |
|----|------|------------------|----------------|------------|
| 25 | `src/lib/domain/contacts.ts` | `ContactDetail` interface (lines 592-603), SELECT (line 619), mapping (lines 642-653) | `department: string \| null` field surface (column exists in DB, not in interface) | HIGH |
| 26 | `src/lib/domain/orders.ts` | `OrderDetail` interface (lines 1736-1753), SELECT (line 1764), mapping (lines 1789-1799) | `shippingAddress`, `shippingCity`, `shippingDepartment` fields (columns exist per `orders.ts:442-444`, not surfaced in read interface) | HIGH |
| 27 | `CLAUDE.md` | After last "Module Scope" or "Scopes por Agente" subsection | New section `### Module Scope: crm-query-tools (PUEDE / NO PUEDE)` per D-06 | HIGH |
| 28 | `package.json` | `devDependencies` (line 93) + `scripts` (line 5) | `@playwright/test` devDep + `test:e2e` script | HIGH |

---

## Per-File Pattern Excerpts

### File 1 — `supabase/migrations/2026MMDDHHMMSS_crm_query_tools_config.sql`

**Closest analog:** `supabase/migrations/20260209000000_agent_production.sql:11-39` (RLS template) + `supabase/migrations/20260224000000_guide_gen_config.sql:18-26` (FK SET NULL on stage_id) + `supabase/migrations/20260420000443_platform_config.sql:30-37` (mandatory GRANTs)
**Role:** Migration (DDL)
**Data flow:** One-time schema creation
**Confidence:** HIGH

**Excerpt from RLS analog (`20260209000000_agent_production.sql:11-39`):**

```sql
CREATE TABLE workspace_agent_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_enabled BOOLEAN NOT NULL DEFAULT false,
  conversational_agent_id TEXT NOT NULL DEFAULT 'somnio-sales-v1',
  ...
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

ALTER TABLE workspace_agent_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_agent_config_select"
  ON workspace_agent_config FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "workspace_agent_config_insert"
  ON workspace_agent_config FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "workspace_agent_config_update"
  ON workspace_agent_config FOR UPDATE
  USING (is_workspace_admin(workspace_id));
```

**Excerpt from FK analog (`20260224000000_guide_gen_config.sql:18-26`):**

```sql
ALTER TABLE carrier_configs
  ADD COLUMN IF NOT EXISTS pdf_inter_pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_inter_stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,
```

**Excerpt from GRANTs LEARNING (`20260420000443_platform_config.sql:30-37`):**

```sql
-- LEARNING propagado: toda migracion futura que cree una tabla debe incluir
-- GRANTs explicitos aqui mismo — no asumir que las tablas creadas en prod via
-- SQL Editor hereden los privileges que habrian tenido via `supabase db push`.
GRANT ALL    ON TABLE public.platform_config TO service_role;
GRANT SELECT ON TABLE public.platform_config TO authenticated;
```

**Adaptations required for crm-query-tools:**
- Two tables: `crm_query_tools_config` (singleton, `workspace_id` PK, `pipeline_id` nullable) + `crm_query_tools_active_stages` (junction, `workspace_id` + `stage_id` composite PK).
- FK behavior:
  - `crm_query_tools_config.pipeline_id REFERENCES pipelines(id) ON DELETE SET NULL` — matches `carrier_configs` pattern (recovers default "all pipelines" semantics).
  - `crm_query_tools_active_stages.stage_id REFERENCES pipeline_stages(id) ON DELETE CASCADE` — junction row vanishes when stage deleted (Pitfall 2).
  - Both tables: `workspace_id REFERENCES workspaces(id) ON DELETE CASCADE`.
- Timestamps use `timezone('America/Bogota', NOW())` (Regla 2).
- Index `CREATE INDEX idx_crm_query_tools_active_stages_ws ON crm_query_tools_active_stages(workspace_id);` for tool-time JOIN.
- 6 RLS policies (3 per table): SELECT via `is_workspace_member`, INSERT/UPDATE via `is_workspace_admin`. **DELETE on junction** also needs `is_workspace_admin` since UI uses delete-then-insert junction sync.
- Mandatory GRANTs for BOTH tables (LEARNING from `platform_config`).
- Plan includes the **Regla 5 PAUSE step** before pushing code that references the new schema.

---

### File 2 — `src/lib/domain/crm-query-tools-config.ts`

**Closest analog:** `src/lib/domain/contacts.ts:539-580` (`searchContacts` shape) + `src/lib/domain/pipelines.ts:49-83` (`listPipelines` workspace-scoped read with parallel queries)
**Role:** Domain (CRUD)
**Data flow:** `DomainContext` → admin Supabase client → `DomainResult<T>`
**Confidence:** HIGH

**Excerpt from analog (`src/lib/domain/contacts.ts:610-658`, `getContactById`):**

```typescript
// Source: src/lib/domain/contacts.ts:610-658
export async function getContactById(
  ctx: DomainContext,
  params: GetContactByIdParams,
): Promise<DomainResult<ContactDetail | null>> {
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, phone, email, address, city, custom_fields, created_at, archived_at, contact_tags(tag_id, tags(id, name))')
      .eq('workspace_id', ctx.workspaceId)
      .eq('id', params.contactId)
      .maybeSingle()

    if (error) return { success: false, error: error.message }
    if (!data) return { success: true, data: null }
    // ... mapping
    return { success: true, data: { ... } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
```

**Adaptations required:**
- Two functions: `getCrmQueryToolsConfig(ctx): Promise<CrmQueryToolsConfig>` (NOT wrapped in `DomainResult` — fail-open default `{ pipelineId: null, activeStageIds: [] }` per RESEARCH `Example 4`) and `updateCrmQueryToolsConfig(ctx, params): Promise<DomainResult<CrmQueryToolsConfig>>` (wrapped — caller needs error to surface to UI).
- `getCrmQueryToolsConfig` does **two parallel queries** with `Promise.all`:
  - `crm_query_tools_config` row via `.maybeSingle()` for `pipeline_id`
  - `crm_query_tools_active_stages` rows for `stage_id[]`
- `updateCrmQueryToolsConfig` uses **upsert + delete-then-insert junction** pattern (research suggests acceptable inconsistency for admin UI — last-write-wins). Wrap in transaction if Supabase client supports it; else accept brief inconsistency.
- Both filter by `ctx.workspaceId` (Regla 3 multi-tenant).
- `createModuleLogger('domain.crm-query-tools-config')` for structured logs.
- Module-level export of `CrmQueryToolsConfig` interface — consumed by tools, server actions, and UI page.

---

### File 3 — `src/lib/agents/shared/crm-query-tools/index.ts`

**Closest analog:** `src/lib/agents/crm-reader/tools/index.ts:17-24`
**Role:** Tool factory aggregator
**Data flow:** Module composition (no I/O at this layer)
**Confidence:** HIGH

**Excerpt from analog (verbatim):**

```typescript
// Source: src/lib/agents/crm-reader/tools/index.ts:1-24
import type { ReaderContext } from '../types'
import { makeContactReadTools } from './contacts'
import { makeOrderReadTools } from './orders'
import { makePipelineReadTools } from './pipelines'
import { makeTagReadTools } from './tags'

export function createReaderTools(ctx: ReaderContext) {
  return {
    ...makeContactReadTools(ctx),
    ...makeOrderReadTools(ctx),
    ...makePipelineReadTools(ctx),
    ...makeTagReadTools(ctx),
  }
}
```

**Adaptations required:**
- Rename `createReaderTools` → `createCrmQueryTools` (D-04 export name).
- Two sub-factories only: `makeContactQueryTools`, `makeOrderQueryTools` (D-02: 5 tools across 2 entity files — pipelines/tags out of scope).
- Re-export shared types `CrmQueryLookupResult`, `CrmQueryListResult`, `CrmQueryToolsContext` for downstream consumers.
- Optional `options?` parameter signature per D-04 — RESEARCH Open Q1 recommends YAGNI (omit until first concrete need).

---

### File 4 — `src/lib/agents/shared/crm-query-tools/types.ts`

**Closest analog:** `src/lib/agents/crm-reader/types.ts:14-58`
**Role:** Type
**Data flow:** —
**Confidence:** HIGH

**Excerpt from analog (verbatim, `crm-reader/types.ts:14-58`):**

```typescript
// Source: src/lib/agents/crm-reader/types.ts
export interface ReaderContext {
  workspaceId: string
  /** caller agent id or API-key prefix; used by observability */
  invoker?: string
}

/**
 * Discriminated tool return shape (Pitfall 5 mitigation).
 * 'not_found_in_workspace' is explicit — the LLM must echo it literally.
 */
export type ToolLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found_in_workspace' }
  | { status: 'error'; message: string }

export type ToolListResult<T> =
  | { status: 'ok'; count: number; items: T[] }
  | { status: 'error'; message: string }
```

**Adaptations required (per D-07, D-10, D-15, D-17, D-27):**

```typescript
// Required new shape:
export interface CrmQueryToolsContext {
  workspaceId: string
  invoker?: string  // e.g. 'somnio-recompra-v1'
}

export type CrmQueryLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found' }                                    // D-10: phone unknown (renamed from not_found_in_workspace per RESEARCH Open Q7)
  | { status: 'no_orders'; contact: ContactDetail }            // D-10: contact exists but no orders
  | { status: 'no_active_order'; contact: ContactDetail; last_terminal_order?: OrderDetail }  // D-17
  | { status: 'config_not_set'; contact: ContactDetail }       // D-27: workspace never configured active stages
  | { status: 'error'; error: { code: string; message?: string } }

export type CrmQueryListResult<T> =
  | { status: 'ok'; count: number; items: T[] }
  | { status: 'not_found'; }            // D-10 (when called by phone, no contact)
  | { status: 'no_orders'; contact: ContactDetail }
  | { status: 'error'; error: { code: string; message?: string } }
```

- **Important divergence from crm-reader:** error shape is `{ error: { code, message? } }` (nested) instead of `{ message }` (flat). Aligns with the `D-09 invalid_phone` and `D-08 multiple_active` use cases that need a stable error code for downstream agents to switch on. Document this in `INTEGRATION-HANDOFF.md`.
- ContactDetail / OrderDetail are imported from `@/lib/domain/contacts` and `@/lib/domain/orders` (D-18 — no fork).

---

### File 5 — `src/lib/agents/shared/crm-query-tools/contacts.ts`

**Closest analog:** `src/lib/agents/crm-reader/tools/contacts.ts:1-77`
**Role:** Tool (1 tool: `getContactByPhone`)
**Data flow:** AI SDK v6 tool input → phone normalize → domain `searchContacts` + `getContactById` → typed result
**Confidence:** HIGH

**Excerpt from analog (verbatim, `crm-reader/tools/contacts.ts:1-77`):**

```typescript
/**
 * CRM Reader — Contact Tools
 * Phase 44 Plan 04.
 *
 * BLOCKER 1 invariant (2026-04-18): this file MUST import ONLY from
 * '@/lib/domain/*' for data access. NO createAdminClient. NO @supabase/supabase-js.
 * Grep enforcement lives in Plan 04 Task 2 verify block.
 */

import { tool } from 'ai'
import { z } from 'zod'
import {
  searchContacts,
  getContactById,
  type ContactListItem,
  type ContactDetail,
} from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import type { ReaderContext, ToolLookupResult, ToolListResult } from '../types'

const logger = createModuleLogger('crm-reader.contacts')

export function makeContactReadTools(ctx: ReaderContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    contactsSearch: tool({
      description:
        'Busca contactos del workspace por telefono, email o parte del nombre. ' +
        'Retorna maximo 20 resultados por defecto. Campos devueltos: id, name, phone, email, createdAt.',
      inputSchema: z.object({
        query: z.string().min(1).describe('Texto de busqueda...'),
        limit: z.number().int().min(1).max(50).default(20),
      }),
      execute: async ({ query, limit }): Promise<ToolListResult<ContactListItem>> => {
        const result = await searchContacts(domainCtx, { query, limit })
        if (!result.success) {
          logger.error({ error: result.error, workspaceId: ctx.workspaceId }, 'contactsSearch domain error')
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),
  }
}
```

**Adaptations required:**
- Top-of-file BLOCKER 1 comment — copy verbatim, change phase reference to "standalone crm-query-tools".
- Function name `makeContactQueryTools` (matches new module convention).
- Single tool `getContactByPhone` with `inputSchema = z.object({ phone: z.string().min(7).describe('...') })`.
- Add `normalizePhone` import: `import { normalizePhone } from '@/lib/utils/phone'`.
- Add observability: `import { getCollector } from '@/lib/observability'`.
- Execute body follows RESEARCH `Example 2` shape:
  1. Emit `crm_query_invoked` event.
  2. Normalize phone — return `{ status: 'error', error: { code: 'invalid_phone' } }` if `null`.
  3. Call `searchContacts(domainCtx, { query: e164.replace(/^\+/, ''), limit: 50 })`.
  4. Filter exact matches via `normalizePhone(c.phone) === e164`.
  5. Sort DESC by `createdAt`, set primary + duplicates.
  6. Call `getContactById(domainCtx, { contactId: primary.id })` for full detail with tags + custom_fields.
  7. Emit `crm_query_completed` event with `latencyMs`, `status`, `duplicatesCount`.
  8. Return typed `CrmQueryLookupResult` with `duplicates_count` + `duplicates: string[]` (D-08).
- PII redaction: log `phoneSuffix: phone.replace(/\D/g, '').slice(-4)` only — never full phone.

---

### File 6 — `src/lib/agents/shared/crm-query-tools/orders.ts`

**Closest analog:** `src/lib/agents/crm-reader/tools/orders.ts:1-73`
**Role:** Tool (4 tools: `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`)
**Data flow:** AI SDK v6 tool input → optional phone normalize → domain `listOrders` / `getOrderById` → optional helper filter → typed result
**Confidence:** HIGH

**Excerpt from analog (verbatim, `crm-reader/tools/orders.ts:22-73`):**

```typescript
export function makeOrderReadTools(ctx: ReaderContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    ordersList: tool({
      description:
        'Lista pedidos del workspace. Filtros opcionales: pipelineId, stageId, contactId. ' +
        'Excluye archivados por defecto. Paginacion via limit/offset.',
      inputSchema: z.object({
        pipelineId: z.string().uuid().optional(),
        stageId: z.string().uuid().optional(),
        contactId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
      execute: async (input): Promise<ToolListResult<OrderListItem>> => {
        const result = await listOrders(domainCtx, input)
        if (!result.success) {
          logger.error({ error: result.error, workspaceId: ctx.workspaceId }, 'ordersList domain error')
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        const items = result.data ?? []
        return { status: 'ok', count: items.length, items }
      },
    }),

    ordersGet: tool({
      description: 'Obtiene un pedido por ID con sus items (order_products). ...',
      inputSchema: z.object({ orderId: z.string().uuid() }),
      execute: async ({ orderId }): Promise<ToolLookupResult<OrderDetail>> => {
        const result = await getOrderById(domainCtx, { orderId })
        if (!result.success) {
          logger.error({ error: result.error, workspaceId: ctx.workspaceId, orderId }, 'ordersGet domain error')
          return { status: 'error', message: result.error ?? 'unknown' }
        }
        if (!result.data) return { status: 'not_found_in_workspace' }
        return { status: 'found', data: result.data }
      },
    }),
  }
}
```

**Adaptations required (per tool):**

1. **`getLastOrderByPhone`** — input: `{ phone }`. Flow: normalize → resolve contact via `searchContacts` (filter exact phone match) → if no contact, `{ status: 'not_found' }` → call `listOrders(domainCtx, { contactId: primary.id, limit: 1 })` → if empty, `{ status: 'no_orders', contact: detail }` → else fetch full `getOrderById` for the first item → return `{ status: 'found', data: orderDetail }`.

2. **`getOrdersByPhone`** — input: `{ phone, limit?, offset? }`. Flow: same contact resolution → call `listOrders(domainCtx, { contactId, limit, offset })` → return `{ status: 'ok', count, items }`. Note: items are list-shape (not detail) for paging efficiency.

3. **`getActiveOrderByPhone`** — input: `{ phone, pipelineId? }`. Flow: same contact resolution → call helper `findActiveOrderForContact(domainCtx, contactId, pipelineId)` (file 7) → if `cfg.activeStageIds.length === 0` AND no override, return `{ status: 'config_not_set', contact: detail }` (D-27) → else if no active, `{ status: 'no_active_order', contact, last_terminal_order? }` (D-17) → else fetch `getOrderById` for `actives[0].id`, return `{ status: 'found', data, other_active_orders_count }` (D-15).

4. **`getOrderById`** — input: `{ orderId: z.string().uuid() }`. Verbatim copy of `crm-reader/tools/orders.ts:54-71` with status renamed `not_found_in_workspace` → `not_found`.

- All 4 tools wrap with the same observability events as File 5 (`crm_query_invoked`, `crm_query_completed`, `crm_query_failed`).
- All input schemas use Zod with descriptive `.describe()` strings (LLM consumes them).

---

### File 7 — `src/lib/agents/shared/crm-query-tools/helpers.ts`

**Closest analog:** RESEARCH `Example 3` (no exact codebase analog — derived from `getActiveOrderForContact` at `src/lib/domain/orders.ts:1820+` which uses `is_closed` instead of config)
**Role:** Utility
**Data flow:** Pure compute (no I/O except domain `listOrders`)
**Confidence:** MEDIUM (derived pattern; logic is straightforward)

**Excerpt from RESEARCH `Example 3`:**

```typescript
// src/lib/agents/shared/crm-query-tools/helpers.ts (recommended)
import { listOrders, type OrderListItem } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'
import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'

export async function findActiveOrderForContact(
  domainCtx: DomainContext,
  contactId: string,
  pipelineIdOverride?: string,
): Promise<{
  active: OrderListItem | null
  otherActiveCount: number
  lastTerminal: OrderListItem | null
  configWasEmpty: boolean   // D-27 flag
}> {
  const cfg = await getCrmQueryToolsConfig(domainCtx)
  const activeStageIds = new Set(cfg.activeStageIds)
  const pipelineId = pipelineIdOverride ?? cfg.pipelineId ?? undefined

  const result = await listOrders(domainCtx, { contactId, pipelineId, limit: 50 })
  if (!result.success) throw new Error(result.error)

  const orders = (result.data ?? []).slice().sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  )
  const actives = activeStageIds.size > 0
    ? orders.filter((o) => activeStageIds.has(o.stageId))
    : []
  const terminals = activeStageIds.size > 0
    ? orders.filter((o) => !activeStageIds.has(o.stageId))
    : orders   // when config empty, treat all as "terminal candidates" but caller decides

  return {
    active: actives[0] ?? null,
    otherActiveCount: Math.max(0, actives.length - 1),
    lastTerminal: terminals[0] ?? null,
    configWasEmpty: activeStageIds.size === 0,
  }
}
```

**Adaptations required:**
- The `configWasEmpty` flag is the D-27 signal — caller in `orders.ts` returns `{ status: 'config_not_set' }` when this is true.
- Pure helper exports for unit testing in `__tests__/helpers.test.ts` — D-15 multi-active sort, D-17 last-terminal selection, D-27 empty-config handling all testable via fixtures.
- Phone-normalization wrapper (`resolveContactByPhone(domainCtx, phone): Promise<ContactDetail | null>`) also lives here — used by all 3 phone-based order tools.

---

### File 8 — `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts`

**Closest analog:** `src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts:1-90` (vi.hoisted + vi.mock)
**Role:** Test (unit)
**Data flow:** Mock domain → invoke tool → assert typed result
**Confidence:** HIGH

**Excerpt from analog (verbatim, `crm-writer-adapter.test.ts:1-58`):**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { proposeActionMock, confirmActionMock } = vi.hoisted(() => ({
  proposeActionMock: vi.fn(),
  confirmActionMock: vi.fn(),
}))

vi.mock('@/lib/agents/crm-writer/two-step', () => ({
  proposeAction: proposeActionMock,
  confirmAction: confirmActionMock,
}))

// Imports AFTER mocks
import {
  updateOrderShipping,
  ...
} from '../../engine-adapters/production/crm-writer-adapter'

const WORKSPACE_ID = 'a3843b3f-c337-4836-92b5-89c58bb98490' // Somnio
const CTX = { agentId: ..., conversationId: 'conv-test-1' } as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe('crm-writer-adapter — updateOrderShipping happy path (D-12)', () => {
  it('propose succeeds + confirm executed → ...', async () => {
    proposeActionMock.mockResolvedValueOnce({ status: 'proposed', ... })
    confirmActionMock.mockResolvedValueOnce({ status: 'executed', output: ... })
    const result = await updateOrderShipping(WORKSPACE_ID, ORDER_ID, { ... }, CTX)
    expect(result.status).toBe('executed')
  })
})
```

**Adaptations required:**
- Mocks: `searchContacts`, `getContactById` from `@/lib/domain/contacts` + `getCollector` from `@/lib/observability` (assert event emission).
- Test cases (D-07, D-08, D-09, D-10):
  - happy path → status `'found'`, data has tags + custom_fields + duplicates_count: 0
  - D-09 invalid phone → `{ status: 'error', error: { code: 'invalid_phone' } }`
  - D-10 phone not found → `{ status: 'not_found' }`
  - D-08 duplicates: 2 contacts same phone → most recent + `duplicates_count: 1` + `duplicates: [otherId]`
  - DB error → `{ status: 'error', error: { code: 'db_error' } }`
  - Observability: assert `recordEvent` called with `'pipeline_decision'` + correct labels
- ~6-8 tests, ~150 lines.

---

### File 9 — `src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts`

**Closest analog:** Same as File 8
**Role:** Test (unit)
**Data flow:** Mock `listOrders`, `getOrderById`, `getCrmQueryToolsConfig` → invoke 4 tools → assert
**Confidence:** HIGH

**Adaptations required:**
- Mock 3 modules: `@/lib/domain/orders`, `@/lib/domain/contacts`, `@/lib/domain/crm-query-tools-config`.
- Test matrix (~15-20 tests):
  - `getLastOrderByPhone`: not_found, no_orders, found
  - `getOrdersByPhone`: empty, paged, contact not found
  - `getActiveOrderByPhone`: D-15 (multi-active newest first), D-17 (no_active_order with last_terminal), D-27 (config_not_set when activeStageIds empty), D-16 (pipelineId override)
  - `getOrderById`: found, not_found, error

---

### File 10 — `src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts`

**Closest analog:** `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts:1-55` (pure function unit test)
**Role:** Test (unit)
**Data flow:** Fixtures → invoke helper → assert
**Confidence:** HIGH

**Excerpt from analog (verbatim, `transitions.test.ts:1-55`):**

```typescript
import { describe, it, expect } from 'vitest'
import { resolveTransition } from '../transitions'
import { createPreloadedState, computeGates } from '../state'
import type { AgentState, Gates } from '../types'

function buildPreloadedState(): AgentState {
  return createPreloadedState({
    nombre: 'Jose',
    apellido: 'Romero',
    telefono: '+573001234567',
    ...
  })
}

describe('resolveTransition — D-05 + Q#1 saludo fallback', () => {
  it('returns null for initial + saludo (...)', () => {
    const state = buildPreloadedState()
    const gates = buildGatesForPreloaded(state)
    const result = resolveTransition('initial', 'saludo', state, gates)
    expect(result).toBeNull()
  })
})
```

**Adaptations required:**
- Tests for `findActiveOrderForContact`: empty config returns `configWasEmpty: true`, single active returns 0 otherActiveCount, multi-active returns newest by `createdAt DESC` + `otherActiveCount`, all-terminal returns `lastTerminal` populated.
- Mock `listOrders` + `getCrmQueryToolsConfig`.
- ~6-8 tests.

---

### File 11 — `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts`

**Closest analog:** `src/__tests__/integration/crm-bots/reader.test.ts:1-90`
**Role:** Test (integration)
**Data flow:** Real Supabase admin client → seed data → invoke tool → assert workspace isolation
**Confidence:** HIGH

**Excerpt from analog (verbatim, `crm-bots/reader.test.ts:1-90`):**

```typescript
import { describe, expect, it, beforeAll, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3020'
const TEST_WORKSPACE_ID = process.env.TEST_WORKSPACE_ID ?? ''
const TEST_API_KEY = process.env.TEST_API_KEY ?? ''

beforeAll(() => {
  if (!TEST_WORKSPACE_ID || !TEST_API_KEY) {
    throw new Error(
      'TEST_WORKSPACE_ID and TEST_API_KEY env vars are required. ...'
    )
  }
})

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !srk) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required ...')
  return createClient(url, srk)
}
```

**Adaptations required:**
- Skip if env vars missing (`describe.skipIf(!TEST_WORKSPACE_ID)`).
- Seed: 2 workspaces (existing TEST_WORKSPACE_ID + secondary TEST_WORKSPACE_ID_2 from env), each with a contact at the same phone `+573009999999`.
- Invoke tool via direct import (NOT HTTP, since this isn't an API route): `createCrmQueryTools({ workspaceId: TEST_WORKSPACE_ID })` → `getContactByPhone({ phone: '+573009999999' })`.
- Assert returned contact ID belongs to TEST_WORKSPACE_ID's row, NOT TEST_WORKSPACE_ID_2's.
- `afterEach` cleanup: delete seeded contacts from both workspaces.

---

### File 12 — `src/__tests__/integration/crm-query-tools/config-driven.test.ts`

**Closest analog:** Same as File 11 + Pitfall 2 D-13 FK CASCADE behavior
**Role:** Test (integration)
**Data flow:** Seed config + active stages → delete a stage → assert junction CASCADE removes row
**Confidence:** HIGH

**Adaptations required:**
- Seed: workspace with 1 pipeline, 3 stages (S1, S2, S3); insert config row + 2 active stages (S1, S2).
- Test 1: Call `getCrmQueryToolsConfig(ctx)` → assert `activeStageIds.length === 2`.
- Test 2: Delete stage S1 from `pipeline_stages` → call `getCrmQueryToolsConfig(ctx)` → assert `activeStageIds.length === 1` (S2 remains, S1 auto-removed by FK CASCADE).
- Test 3: Delete pipeline → assert `pipeline_id` becomes `null` (FK SET NULL).
- Cleanup all seeded data in `afterEach`.

---

### File 13 — `src/__tests__/integration/crm-query-tools/duplicates.test.ts`

**Closest analog:** Same as File 11
**Role:** Test (integration)
**Data flow:** Seed 2+ contacts same phone in same workspace → invoke tool → assert duplicates flag
**Confidence:** HIGH

**Adaptations required:**
- Seed: 3 contacts in TEST_WORKSPACE_ID with phone `+573009999998`, different `created_at` (T1 < T2 < T3).
- Invoke `getContactByPhone({ phone: '+573009999998' })`.
- Assert `data.id === T3.id` (most recent), `duplicates_count === 2`, `duplicates.length === 2`, `duplicates.includes(T1.id) && includes(T2.id)`.
- Cleanup.

---

### File 14 — `src/app/(dashboard)/agentes/crm-tools/page.tsx`

**Closest analog:** `src/app/(dashboard)/agentes/routing/page.tsx:1-156`
**Role:** UI (Server Component)
**Data flow:** `getActiveWorkspaceId` → parallel domain fetch → render Client Component with initial data
**Confidence:** HIGH

**Excerpt from analog (verbatim, `routing/page.tsx:31-50`):**

```typescript
export default async function RoutingRulesPage() {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <p className="text-muted-foreground">No hay workspace seleccionado.</p>
      </div>
    )
  }

  const result = await listRules({ workspaceId })
  const rules = result.success ? result.data : []
  const errorMessage = result.success ? null : result.error

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">Routing Rules</h1>
          ...
```

**Adaptations required:**
- Imports: `getCrmQueryToolsConfig` from domain + `listPipelines` from domain.
- DomainContext: `{ workspaceId, source: 'server-action' }`.
- `Promise.all([getCrmQueryToolsConfig(ctx), listPipelines(ctx)])` for parallel reads.
- Render `<ConfigEditor initialConfig={config} pipelines={pipelines}>` Client Component.
- Heading: "Herramientas CRM" with subtitle from RESEARCH `Example 5`.
- Empty workspace fallback identical to analog.

---

### File 15 — `src/app/(dashboard)/agentes/crm-tools/_actions.ts`

**Closest analog:** `src/app/(dashboard)/agentes/routing/_actions.ts:1-133`
**Role:** Server action
**Data flow:** Form submit → `getActiveWorkspaceId` guard → domain `updateCrmQueryToolsConfig` → `revalidatePath`
**Confidence:** HIGH

**Excerpt from analog (verbatim, `routing/_actions.ts:62-99`):**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { upsertRule, deleteRule, ... } from '@/lib/domain/routing'
import { getActiveWorkspaceId } from '@/app/actions/workspace'

export async function createOrUpdateRuleAction(
  rule: Partial<RoutingRule>,
): Promise<{ success: true; ruleId: string } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) return { success: false, error: 'No workspace context' }

  // Defense-in-depth: validate again on server
  const v = validateRule(rule)
  if (!v.ok) return { success: false, error: `Schema invalido: ${v.errors.join('; ')}` }

  const result = await upsertRule({ workspaceId }, rule as Parameters<typeof upsertRule>[1])
  if (!result.success) return result

  revalidatePath('/agentes/routing')
  return { success: true, ruleId: result.data.id }
}
```

**Adaptations required:**
- Single action `saveCrmQueryToolsConfigAction(input: { pipelineId: string | null; activeStageIds: string[] })`.
- `'use server'` directive at top.
- `getActiveWorkspaceId` guard — return early `{ success: false, error: 'No workspace' }` if null.
- Defense-in-depth: validate `pipelineId` is uuid-or-null, `activeStageIds.every(uuid)` — Zod schema.
- Call `updateCrmQueryToolsConfig({ workspaceId, source: 'server-action' }, input)`.
- On success → `revalidatePath('/agentes/crm-tools')`.
- Per `routing/_actions.ts:1-19` comment block: document the Regla 3 invariant explicitly (cero `createAdminClient` import in this file — verifiable via grep).

---

### File 16 — `src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx`

**Closest analog:** `src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx:36-136` (popover + checkbox grouped multi-select) + `src/app/(dashboard)/agentes/routing/editor/_components/editor-client.tsx` (Client Component with `useState` + form submit)
**Role:** UI (Client Component)
**Data flow:** Form state → server action call → toast feedback
**Confidence:** HIGH

**Excerpt from analog (verbatim, `MultiSelect.tsx:36-90`):**

```typescript
'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface MultiSelectGroup {
  label: string | null
  options: string[]
}

export function MultiSelect({ value, onChange, options, groups, placeholder = 'Selecciona...' }: Props) {
  const [open, setOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(value), [value])

  const toggle = (option: string) => {
    if (selectedSet.has(option)) {
      onChange(value.filter((v) => v !== option))
    } else {
      onChange([...value, option])
    }
  }
  ...
}
```

**Adaptations required:**
- `'use client'` directive.
- Props: `{ initialConfig: CrmQueryToolsConfig, pipelines: PipelineWithStages[] }`.
- State: `useState` for `pipelineId` (UUID | null) and `activeStageIds` (UUID[]).
- **Reuse `MultiSelect`** from routing editor (import directly, OR copy to a shared `@/components/ui/multi-select.tsx` location). Pass `groups` shape: `pipelines.map(p => ({ label: p.name, options: p.stages.map(s => s.id) }))`.
- BUT `MultiSelect` uses `string[]` of option labels, not `{id, label}` pairs — must adapt: pass IDs as values + render names via lookup. Alternative: build a small in-line variant that accepts `{value, label}[]` pairs (cleaner for this UI).
- Pipeline picker: Radix Select dropdown OR simple `<select>` — analog uses select shadcn component (verify location at `@/components/ui/select`).
- Save button calls `saveCrmQueryToolsConfigAction(...)` and shows toast via `sonner` (`toast.success` / `toast.error`).
- Form layout follows editorial-theme of `/agentes` post-Plan-04 (mostly `Card` + `CardContent` like `routing/page.tsx:71`).

---

### File 17 — `playwright.config.ts`

**Closest analog:** NO ANALOG IN REPO (Wave 0 bootstrap — `@playwright/test` not installed)
**Role:** Config
**Data flow:** —
**Confidence:** MEDIUM (recommended template; planner verifies)

**Recommended pattern:**

```typescript
// playwright.config.ts (NEW — Wave 0 bootstrap)
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,                  // serial — tests share test workspace fixtures
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                            // single worker — Supabase test data isolation
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3020', // CLAUDE.md port 3020
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3020',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

**Adaptations required:**
- Pin `@playwright/test` minor matching existing `playwright@1.58.2` (MEMORY: "Docker image version MUST match playwright npm package exactly" — same lesson applies even outside Docker).
- `testDir: './e2e'` per RESEARCH A9 assumption.
- `baseURL` reads from env with `localhost:3020` fallback (Regla — port 3020).
- `webServer.command: 'npm run dev'` so Playwright auto-starts the Next dev server.
- `vitest.config.ts` already excludes `.claude/**` but does NOT exclude `e2e/**` (line 19-24); planner adds `'e2e/**'` to the exclude array so Vitest doesn't accidentally pick up Playwright specs.

---

### File 18 — `e2e/crm-query-tools.spec.ts`

**Closest analog:** RESEARCH `Example 6` (recommended skeleton)
**Role:** Test (E2E)
**Data flow:** Browser → UI → DB (real Supabase) → API runner endpoint → tool invocation → assert
**Confidence:** MEDIUM

**Excerpt from RESEARCH `Example 6`:**

```typescript
import { test, expect } from '@playwright/test'

test.describe('crm-query-tools UI ↔ DB ↔ tool integration', () => {
  test('configures active stages via UI and tool respects them', async ({ page, request }) => {
    await page.goto('/agentes/crm-tools')

    await page.getByRole('combobox', { name: 'Pipeline' }).click()
    await page.getByRole('option', { name: 'Ventas Somnio Standard' }).click()

    await page.getByRole('combobox', { name: 'Stages activos' }).click()
    await page.getByRole('checkbox', { name: 'NUEVO PAG WEB' }).check()
    await page.getByRole('checkbox', { name: 'FALTA INFO' }).check()
    await page.getByRole('button', { name: 'Cerrar' }).click()

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Configuracion guardada')).toBeVisible()

    const result = await request.post('/api/test/crm-query-tools/runner', {
      data: { tool: 'getActiveOrderByPhone', input: { phone: '+573001234567' } },
    })
    const json = await result.json()

    expect(json.status).toBe('found')
    expect(['NUEVO PAG WEB', 'FALTA INFO']).toContain(json.data.stageName)
  })
})
```

**Adaptations required:**
- Authenticate first via `e2e/fixtures/auth.ts` helper.
- Seed test data via `e2e/fixtures/seed.ts` in `test.beforeAll`.
- Cleanup in `test.afterAll`.
- Header secret on the runner API call (matches File 21).

---

### File 19 — `e2e/fixtures/auth.ts`

**Closest analog:** NO DIRECT ANALOG — closest is `src/__tests__/integration/crm-bots/reader.test.ts:14-15` (env-gated `TEST_API_KEY` pattern).
**Role:** Test fixture
**Data flow:** Set Supabase auth cookie / session in Playwright context
**Confidence:** MEDIUM

**Recommended pattern:**

```typescript
// e2e/fixtures/auth.ts (NEW)
import { type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * Sets a Supabase session cookie on the Playwright page so server components
 * see an authenticated user. Requires:
 *   TEST_USER_EMAIL + TEST_USER_PASSWORD env vars.
 *
 * Pattern: log in via @supabase/supabase-js with anon key, extract the
 * access_token, and set the `sb-<project-ref>-auth-token` cookie that
 * @supabase/ssr expects.
 */
export async function authenticateAsTestUser(page: Page) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const email = process.env.TEST_USER_EMAIL!
  const password = process.env.TEST_USER_PASSWORD!

  const supabase = createClient(url, anon)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`auth failed: ${error?.message}`)

  // Cookie name format: sb-<projectRef>-auth-token (Supabase SSR convention)
  const projectRef = new URL(url).hostname.split('.')[0]
  await page.context().addCookies([{
    name: `sb-${projectRef}-auth-token`,
    value: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
    domain: 'localhost',
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }])
}
```

**Adaptations required:**
- Verify cookie name format against the project's actual `@supabase/ssr` config (look at `src/lib/supabase/server.ts` if exists).
- Document `TEST_USER_EMAIL`/`TEST_USER_PASSWORD` env vars in INTEGRATION-HANDOFF.md.
- Optional: cache the session token to a file (`storageState`) per Playwright best practice.

---

### File 20 — `e2e/fixtures/seed.ts`

**Closest analog:** NO DIRECT ANALOG — closest pattern is `src/__tests__/integration/orders-cas.test.ts` setup blocks (admin client + insert)
**Role:** Test fixture
**Data flow:** Admin Supabase client → seed contacts/orders/pipelines/stages → return IDs for cleanup
**Confidence:** MEDIUM

**Recommended pattern:**

```typescript
// e2e/fixtures/seed.ts (NEW)
import { createClient } from '@supabase/supabase-js'

export interface SeededData {
  workspaceId: string
  pipelineId: string
  stageIds: string[]      // [activo1, activo2, terminal1]
  contactId: string
  orderIds: string[]
}

/** Returns admin client. Reuses TEST_WORKSPACE_ID env from existing integration tests. */
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function seedTestFixture(): Promise<SeededData> {
  const supabase = admin()
  const workspaceId = process.env.TEST_WORKSPACE_ID!

  // Insert pipeline + 3 stages (idempotent: try/upsert by name)
  // Insert contact with phone +573009999777
  // Insert 2 orders (one in stage activo1, one in stage terminal1)
  // Return all IDs for cleanup

  // ... full implementation
  return { workspaceId, pipelineId, stageIds: [], contactId: '', orderIds: [] }
}

export async function cleanupTestFixture(seeded: SeededData) {
  const supabase = admin()
  // Delete orders, contact, stages, pipeline (in dependency order)
}
```

---

### File 21 — `src/app/api/test/crm-query-tools/runner/route.ts`

**Closest analog:** NO ANALOG — `src/app/api/test/` directory does NOT exist in repo. Closest Next 16 route handler shape exists in any `src/app/api/v1/**/route.ts`.
**Role:** API route (env-gated test-only endpoint)
**Data flow:** HTTP POST → validate env+secret → invoke tool → return JSON
**Confidence:** LOW (must propose minimal pattern)

**Recommended pattern:**

```typescript
// src/app/api/test/crm-query-tools/runner/route.ts (NEW — env-gated)
//
// Test-only endpoint to invoke crm-query-tools from Playwright E2E.
// Returns 404 in production. Requires X-Test-Secret header match.
//
// Security (V13 ASVS):
//   - NODE_ENV !== 'production' (dev/preview only)
//   - Header secret match (PLAYWRIGHT_TEST_SECRET env)
//   - Workspace from env (TEST_WORKSPACE_ID), NOT from body
//
import { NextRequest, NextResponse } from 'next/server'
import { createCrmQueryTools } from '@/lib/agents/shared/crm-query-tools'

export async function POST(req: NextRequest) {
  // Env gate
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  // Secret gate
  const secret = req.headers.get('x-test-secret')
  if (!secret || secret !== process.env.PLAYWRIGHT_TEST_SECRET) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const workspaceId = process.env.TEST_WORKSPACE_ID
  if (!workspaceId) {
    return NextResponse.json({ error: 'TEST_WORKSPACE_ID not set' }, { status: 500 })
  }

  const body = await req.json() as { tool: string; input: Record<string, unknown> }

  const tools = createCrmQueryTools({ workspaceId, invoker: 'playwright-e2e' })
  const tool = tools[body.tool as keyof typeof tools]
  if (!tool) {
    return NextResponse.json({ error: `Unknown tool: ${body.tool}` }, { status: 400 })
  }

  // Note: AI SDK v6 tool() returns an object with execute() method
  const result = await (tool as { execute: (input: unknown) => Promise<unknown> }).execute(body.input)
  return NextResponse.json(result)
}
```

**Adaptations / open questions:**
- Verify Next 16 route handler signature against any existing `src/app/api/v1/*/route.ts` — exact match.
- The `tool.execute` call signature for AI SDK v6 — research suggests `tool()` from `ai` package returns an object with `execute(input)` callable directly. Planner must verify by reading `node_modules/ai` types or any existing test that imports a tool's execute directly.
- If direct `execute` call doesn't work, alternative: extract the tool factory's body into a plain async function (export both versions), and call that from the route.
- Document the `PLAYWRIGHT_TEST_SECRET` env var in INTEGRATION-HANDOFF.md.
- Flag confidence LOW because no in-repo analog confirms the AI SDK v6 tool execution pattern from non-LLM context.

---

### File 22 — `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md`

**Closest analog:** Not directly verified in tool calls but referenced in MEMORY.md (e.g., shipped standalones have similar handoffs)
**Role:** Doc
**Confidence:** MEDIUM

**Required sections:**
- Tool inventory with example invocations + JSON return shapes per status enum.
- Cleanup steps for each follow-up integration standalone (recompra + pw-confirmation): which Inngest function to delete, which session_state keys to remove, which CLAUDE.md scope to update.
- Wiring example: `tools: { ...createCrmQueryTools({ workspaceId, invoker: 'agent-id' }) }`.
- Known divergences from crm-reader (`not_found` vs `not_found_in_workspace`, error shape `{error: {code, message?}}` vs `{message}`).
- Configuration prerequisite: workspace MUST configure active stages via `/agentes/crm-tools` before `getActiveOrderByPhone` returns `'found'`.
- Test runner endpoint env requirements.

---

### File 23 — `.claude/skills/crm-query-tools.md`

**Closest analog:** **NO ANALOG — `.claude/skills/` directory DOES NOT EXIST in this repo.**
**Verified via:** `ls .claude/skills/` returns "No such file or directory". Only `.claude/rules/` exists with 3 files (`agent-scope.md`, `code-changes.md`, `gsd-workflow.md`).
**Role:** Skill/rules doc
**Confidence:** LOW (placement decision)

**Adaptations / placement options:**

**Option A (recommended by RESEARCH Open Q5):** Create `.claude/skills/` directory and place `crm-query-tools.md` there, matching CONTEXT D-26 verbatim ("project skill descubrible (`crm-query-tools` en `.claude/skills/` o equivalente)").
- Risk: Claude Code may not auto-discover this dir if it scans `.claude/rules/` only.
- Mitigation: cross-reference from `.claude/rules/agent-scope.md` Module Scope addition.

**Option B:** Place at `.claude/rules/crm-query-tools.md` to follow existing on-disk convention.
- Risk: User explicitly said "skills" in CONTEXT — this divergence should be confirmed in DISCUSSION-LOG follow-up.

**Recommendation:** Option A. The user's CONTEXT D-26 wording is direct and specific. Create the directory and document the convention in INTEGRATION-HANDOFF.md.

**Content pattern (regardless of placement):** Follow `.claude/rules/agent-scope.md:27-40` (CRM Reader Bot section) shape — PUEDE / NO PUEDE bullet lists + Validacion section.

---

### File 24 — `.planning/standalone/crm-query-tools/LEARNINGS.md`

**Closest analog:** Other shipped standalone LEARNINGS files (e.g., `client-activation-auto-revoke/LEARNINGS.md` per MEMORY).
**Role:** Doc
**Confidence:** HIGH

**Required sections (per Regla 4):**
- Bug log per wave.
- Patterns discovered.
- Decisions revisited.
- Performance numbers (latency per tool, % of tool calls that hit happy path).
- Followup tasks for the 2 integration standalones.

---

## Extend Map (existing files)

### File 25 — `src/lib/domain/contacts.ts` — Extend `ContactDetail`

**Section:** Lines 592-603 (interface), line 619 (SELECT), lines 642-653 (mapping).

**Current state (verbatim):**

```typescript
// Line 592-603
export interface ContactDetail {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  createdAt: string
  archivedAt: string | null
  tags: Array<{ id: string; name: string }>
  customFields: Record<string, unknown>
}

// Line 619 (inside getContactById)
.select('id, name, phone, email, address, city, custom_fields, created_at, archived_at, contact_tags(tag_id, tags(id, name))')

// Lines 642-653 (inside getContactById, after !data check)
return {
  success: true,
  data: {
    id: data.id,
    name: data.name,
    phone: data.phone,
    email: data.email,
    address: data.address,
    city: data.city,
    createdAt: data.created_at,
    archivedAt: data.archived_at,
    tags,
    customFields: (data.custom_fields as Record<string, unknown>) ?? {},
  },
}
```

**Required additions (RESEARCH Pitfall 10):**
- Add `department: string | null` field to `ContactDetail` interface (after `city`).
- Update SELECT (line 619): add `department` between `city` and `custom_fields` → `.select('id, name, phone, email, address, city, department, custom_fields, ...')`.
- Update mapping (line 642+): add `department: data.department` between `city` and `createdAt`.
- Note: `contacts` table already has `department` column (CONTEXT confirms via Pitfall 10). No migration needed for THIS field.

---

### File 26 — `src/lib/domain/orders.ts` — Extend `OrderDetail`

**Section:** Lines 1736-1753 (interface), line 1764 (SELECT), lines 1789-1799 (mapping).

**Current state (verbatim):**

```typescript
// Lines 1736-1753
export interface OrderDetail {
  id: string
  contactId: string | null
  pipelineId: string
  stageId: string
  totalValue: number
  description: string | null
  createdAt: string
  archivedAt: string | null
  items: Array<{
    id: string
    sku: string
    title: string
    unitPrice: number
    quantity: number
    subtotal: number
  }>
}

// Line 1764 (inside getOrderById)
.select('id, contact_id, pipeline_id, stage_id, total_value, description, created_at, archived_at, order_products(id, sku, title, unit_price, quantity, subtotal)')

// Lines 1789-1799 (mapping)
return {
  success: true,
  data: {
    id: data.id,
    contactId: data.contact_id,
    pipelineId: data.pipeline_id,
    stageId: data.stage_id,
    totalValue: Number(data.total_value),
    description: data.description,
    createdAt: data.created_at,
    archivedAt: data.archived_at,
    items,
  },
}
```

**Required additions (RESEARCH Pitfall 9):**
- Add to `OrderDetail` interface (after `description`):
  - `shippingAddress: string | null`
  - `shippingCity: string | null`
  - `shippingDepartment: string | null`
- Update SELECT (line 1764): add `shipping_address, shipping_city, shipping_department,` between `description` and `created_at`.
- Update mapping (lines 1789-1799): add three lines:
  ```typescript
  shippingAddress: data.shipping_address,
  shippingCity: data.shipping_city,
  shippingDepartment: data.shipping_department,
  ```
- Note: columns already exist (verified in `orders.ts:442-444` `updateOrder` writes them). Pure additive type/select extension — no migration.
- **Backward compat:** all existing crm-reader / crm-writer callers consume `OrderDetail` as-is and ignore new optional fields. Zero breaking changes.

---

### File 27 — `CLAUDE.md` — Add Module Scope Section

**Section:** After the existing `## OBLIGATORIO al Crear un Agente Nuevo` section, OR as a sibling subsection within the existing `### CRM Reader Bot` / `### CRM Writer Bot` block area.

**Current state:** No `Module Scope: crm-query-tools` section exists.

**Pattern to follow (verbatim from `.claude/rules/agent-scope.md:27-41` — CRM Reader Bot template):**

```markdown
### CRM Reader Bot (`crm-reader` — API `/api/v1/crm-bots/reader`)
- **PUEDE (solo lectura):**
  - `contacts_search` / `contacts_get` — buscar y leer contactos (...)
  ...
- **NO PUEDE:**
  - Mutar NADA (...)
  - Inventar recursos inexistentes (retorna `not_found_in_workspace`)
  - Acceder a otros workspaces (...)
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/crm-reader/tools/**` (BLOCKER 1 Phase 44)
  - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
  - Agent ID registrado: `'crm-reader'` (...)
```

**Required additions (D-06 adapted to module, not agent):**

```markdown
### Module Scope: crm-query-tools (`src/lib/agents/shared/crm-query-tools/`)
- **PUEDE (solo lectura):**
  - `getContactByPhone(phone)` — contacto + tags + custom_fields + duplicates flag
  - `getLastOrderByPhone(phone)` — último pedido del contacto + items + dirección
  - `getOrdersByPhone(phone, { limit?, offset? })` — historial paginado
  - `getActiveOrderByPhone(phone, { pipelineId? })` — pedido en stage activo (config-driven)
  - `getOrderById(orderId)` — pedido específico con items
- **NO PUEDE:**
  - Mutar NADA (crear/editar/archivar contactos, pedidos, notas, tareas — esas operaciones son scope crm-writer)
  - Acceder a otros workspaces (workspace_id viene del execution context del agente, NUNCA del input — D-05)
  - Cachear resultados (cada tool-call llega a domain layer fresh — D-19)
  - Escribir keys legacy `_v3:crm_context*` o `_v3:active_order` en session_state (D-21 — el caller decide persistencia)
  - Hardcodear nombres de stages — la lista de stages "activos" se lee de `crm_query_tools_config` + `crm_query_tools_active_stages` (D-11/D-13 config-driven UUID)
- **Validacion:**
  - Tool handlers importan EXCLUSIVAMENTE desde `@/lib/domain/*` — cero `createAdminClient` en `src/lib/agents/shared/crm-query-tools/**` (verifiable via grep)
  - Todas las queries pasan por domain layer que filtra por `workspace_id` (Regla 3)
  - Configuración persistente por workspace en tabla `crm_query_tools_config` (singleton) + `crm_query_tools_active_stages` (junction)
  - UI de configuración en `/agentes/crm-tools` (operador escoge stages activos + pipeline scope)
- **Consumidores documentados:**
  - (Pending — los agentes Somnio se migrarán en standalones follow-up: `crm-query-tools-recompra-integration` y `crm-query-tools-pw-confirmation-integration`. Hasta entonces, el módulo está listo pero sin consumidores en producción.)
```

---

### File 28 — `package.json` — Add Playwright

**Section:** `scripts` (line 5-11), `devDependencies` (line 93+).

**Current state:**

```json
"scripts": {
  "dev": "next dev -p 3020",
  "build": "next build",
  "start": "next start -p 3020",
  "lint": "eslint",
  "test": "vitest run"
},
...
"devDependencies": {
  "@tailwindcss/postcss": "^4",
  ...
  "vitest": "^1.6.1"
}
```

**Required additions:**
- Add to `scripts`:
  - `"test:e2e": "playwright test"`
  - `"test:e2e:ui": "playwright test --ui"`
- Add to `devDependencies`:
  - `"@playwright/test": "^1.58.2"` (pin minor matching existing `playwright@1.58.2` per MEMORY lesson)
- Verification step in plan: `npm install` succeeds + `npx playwright install chromium` succeeds.

---

## Anti-Patterns Flagged

### Verified compliance (defensive notes — no current violation)

- **`createAdminClient` in tool files** — VERIFIED ZERO violations.
  - Grep: `grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/crm-reader/tools/ --include="*.ts"`
  - Output: only one match in `contacts.ts:6` which is the **comment line documenting the invariant**, not a real import.
  - Plan must include same grep against `src/lib/agents/shared/crm-query-tools/` in Wave 2 verify block (expected: zero matches including the doc-comment line, which the new module's contacts.ts WILL replicate).

- **Hardcoded stage names** — would violate D-13. Plan must verify no string literals like `'CONFIRMADO'`, `'ENTREGADO'`, `'FALTA INFO'` appear in `src/lib/agents/shared/crm-query-tools/**`. Grep: `grep -rn "'CONFIRMADO'\|'ENTREGADO'\|'FALTA INFO'\|'NUEVO PAG WEB'" src/lib/agents/shared/crm-query-tools/` → expected zero matches.

### Risks if planner deviates

- **Reading `ctx.workspaceId` from input body** — Pattern check: every tool's `inputSchema` must NOT have `workspaceId` field. Grep on the new module: `grep -rn "workspaceId.*z\." src/lib/agents/shared/crm-query-tools/` → expected zero matches in inputSchema definitions.
- **Caching results in module scope** — Pattern check: no top-level `Map`, `Set`, `LRU` declarations in the new module's TS files. Grep: `grep -rn "new Map(\|new LRU\|^const cache" src/lib/agents/shared/crm-query-tools/` → expected zero matches.
- **Forking `OrderDetail` shape** — D-18 demands extension. Pattern check: the new types.ts must `import type { OrderDetail } from '@/lib/domain/orders'` (NOT redefine).
- **Throwing for `not_found` / `no_orders`** — D-07 forbids. Pattern check: tools' `execute` body has zero `throw` statements except inside helpers that are caught and converted to `{ status: 'error' }`.
- **Writing to `session_state` from tool code** — D-21 forbids. Pattern check: no imports from `@/lib/agents/somnio/SessionManager` or `session_state` in the new module.

### Mitigation: planner adds these greps to Wave verify steps

```bash
# Wave 2 — after creating contacts.ts:
grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
# Expected: 1 match in the BLOCKER 1 doc comment header, 0 in code.

# Wave 3 — after creating orders.ts + helpers.ts:
grep -rn "'CONFIRMADO'\|'ENTREGADO'\|'FALTA INFO'\|'NUEVO PAG WEB'\|is_closed" src/lib/agents/shared/crm-query-tools/
# Expected: 0 matches (we never use stage names or is_closed; config-driven UUIDs only).

grep -rn "throw " src/lib/agents/shared/crm-query-tools/ --include="*.ts" | grep -v "__tests__"
# Expected: 0 (or only in helpers caught upstream).

grep -rn "SessionManager\|datos_capturados" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
# Expected: 0 (D-21).
```

---

## Open Pattern Questions

1. **`.claude/skills/` directory placement (File 23)** — Directory does not exist; user CONTEXT D-26 references it explicitly. RECOMMENDATION: create the directory + place `crm-query-tools.md` there. Confirm with planner before plan-phase commits.

2. **AI SDK v6 tool execution from API route (File 21)** — `tool({...}).execute(input)` direct invocation pattern is not exemplified anywhere in the repo (all tool calls are LLM-driven). RECOMMENDATION: planner verifies by reading `node_modules/ai` package types. Fallback: extract tool body into plain async fn, route imports the plain fn directly. Confidence LOW until verified.

3. **`MultiSelect` reusability (File 16)** — Existing `MultiSelect` at `routing/editor/_components/` accepts `string[]` of OPTION LABELS, not `{id, label}` pairs. RECOMMENDATION: either build an inline variant in `_components/ConfigEditor.tsx` that accepts `{value, label}[]` (cleaner), OR adapt the existing component to accept either shape (broader reuse). Planner decides at Wave 4.

4. **Cookie name for Supabase session in Playwright auth (File 19)** — Format `sb-<projectRef>-auth-token` is convention but project may customize. RECOMMENDATION: planner reads `src/lib/supabase/server.ts` (or wherever `@supabase/ssr` is configured) to confirm cookie name before writing fixture.

5. **Playwright base URL in CI vs local** — `playwright.config.ts` references `localhost:3020` (CLAUDE.md port). For Vercel preview deployments running E2E in CI, baseURL should be the preview URL. RECOMMENDATION: env var `PLAYWRIGHT_BASE_URL` with sensible fallback (already in template).

6. **Whether to refactor `MultiSelect` to a shared `@/components/ui/multi-select.tsx`** — Currently lives in `routing/editor/_components/`. Could be moved to `@/components/ui/` for cross-feature reuse (used by both routing-editor and crm-tools). RECOMMENDATION: keep colocated copies in both feature dirs for THIS standalone (avoid cross-feature refactor). Backlog: shared component extraction in a future standalone.

---

## Wave Map (planner reference)

| Wave | Files | Pattern Anchors |
|------|-------|-----------------|
| W0 | 17, 19, 20, 28, vitest.config.ts edit | RESEARCH `Standard Stack` install steps + Playwright recommended config in this doc |
| W1 | 1, 2, 25, 26 | Migration analogs (3 files), domain analog (`contacts.ts:539-580`) |
| W2 | 3, 4, 5, 8 | crm-reader factory + types + contacts.ts excerpts above |
| W3 | 6, 7, 9, 10 | crm-reader orders.ts excerpt + helper template |
| W4 | 14, 15, 16, agentes/layout.tsx edit | routing/page + _actions + MultiSelect excerpts above |
| W5 | 11, 12, 13, 18, 21 | crm-bots/reader.test.ts excerpt + Playwright skeleton |
| W6 | 22, 23, 24, 27 | agent-scope.md template excerpt above |

---

## Metadata

**Analog search scope:** `src/lib/agents/crm-reader/`, `src/lib/agents/crm-writer/`, `src/lib/agents/somnio-pw-confirmation/`, `src/lib/agents/somnio-recompra/`, `src/lib/agents/engine-adapters/production/`, `src/lib/domain/`, `src/lib/observability/`, `src/lib/utils/`, `src/lib/audit/`, `src/app/(dashboard)/agentes/`, `src/__tests__/integration/crm-bots/`, `supabase/migrations/`, `.claude/rules/`, `package.json`, `vitest.config.ts`.

**Files scanned:** 28 directly read, ~10 more via Grep.

**Anti-pattern grep verification timestamp:** 2026-04-29.

**Pattern extraction date:** 2026-04-29.
