# Research — crm-query-tools

**Generated:** 2026-04-29
**Mode:** ecosystem + implementation
**Inputs:** CONTEXT.md (26 decisions), DISCUSSION-LOG.md, codebase grep
**Status:** Ready for /gsd-plan-phase

---

## Summary

The codebase already has every primitive this standalone needs. The build is mostly **assembly + extension**, not invention:

- The crm-reader **types** (`ToolLookupResult<T>`, `ToolListResult<T>`, `ContactDetail`, `OrderDetail`) and the **domain functions** (`searchContacts`, `getContactById`, `listOrders`, `getOrderById`) are reusable as-is. Two extensions are needed: `ContactDetail.department` and `OrderDetail.shippingAddress|shippingCity|shippingDepartment` (the columns exist in the DB but the interfaces don't surface them).
- Phone normalization helper is **`normalizePhone`** at `src/lib/utils/phone.ts:37` — already used by `webhook-processor.ts` (the canonical inbound path) via `src/app/actions/conversations.ts:12` and indirectly via `src/lib/agents/somnio/normalizers.ts:303`. Returns `string | null` (E.164 format).
- Observability emit helper is **`getCollector()?.recordEvent('pipeline_decision', label, payload)`** from `@/lib/observability` (`src/lib/observability/index.ts:32`, signature at `src/lib/observability/collector.ts:153`). Pattern is established in `crm-writer-adapter.ts:156-178`.
- AI SDK v6 tool registration uses `tool({ description, inputSchema: z.object({...}), execute: async (input) => {...} })` from `ai` + `zod`. Full pattern at `src/lib/agents/crm-reader/tools/contacts.ts:31-54`.
- `pipeline_stages.is_closed` boolean exists (`supabase/migrations/20260129000003_orders_foundation.sql:57`) but per D-11 we **ignore it** and use config-driven definition instead.
- DB pattern decision: **dedicated table `crm_query_tools_config` with FK `ON DELETE SET NULL` for individual stage references** is the right call (matches `carrier_configs` pattern at `supabase/migrations/20260224000000_guide_gen_config.sql:18-26`). Active stages live in a separate junction table to give per-stage FK behavior. Details in `## Architecture Patterns`.

**Critical blocker — Playwright UI E2E:** The project has `playwright` (the library, used by Railway robots — `package.json:75`) but **NOT `@playwright/test`** (the test framework). There is no `playwright.config.ts`, no `e2e/` or `tests/` directory, no `test:e2e` script, and no Playwright test files anywhere. **D-24's "E2E completo Playwright UI" requires installing `@playwright/test` and bootstrapping the framework from scratch in this standalone.** This is a non-trivial Wave 0 task that the planner must surface.

**Primary recommendation:** Plan as 7 waves: (W0) bootstrap `@playwright/test` + Vitest gaps; (W1) DB migration + domain layer for config CRUD; (W2) shared module skeleton + `getContactByPhone` (the simplest tool — proves shape) + unit tests; (W3) the 4 remaining tools in parallel; (W4) UI section under `/agentes/crm-tools` with multi-select stages + pipeline scope; (W5) integration + E2E tests; (W6) `INTEGRATION-HANDOFF.md` + project skill + CLAUDE.md scope addition.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 5 query tools (read CRM) | Backend / library (`src/lib/agents/shared/crm-query-tools/`) | Domain layer (`src/lib/domain/`) | Tools call domain (Regla 3); domain calls Supabase admin client. |
| Config DB schema (active stages, pipeline scope) | Database / Storage (`supabase/migrations/`, table `crm_query_tools_config`) | Domain layer (`src/lib/domain/crm-query-tools-config.ts`) | Workspace-scoped config table; FK to `pipeline_stages` and `pipelines`. |
| Config UI (multi-select stages, pipeline picker) | Frontend Server (Next.js Server Component at `src/app/(dashboard)/agentes/crm-tools/page.tsx`) | Server Actions (in `_actions.ts`) calling domain | Same pattern as `routing/page.tsx` + `routing/_actions.ts`. |
| Phone normalization | Library helper (`src/lib/utils/phone.ts:normalizePhone`) | — | Reused as-is. |
| Observability events | In-memory collector via AsyncLocalStorage (`src/lib/observability`) | — | `recordEvent('pipeline_decision', 'crm_query_*', payload)`. |
| Unit tests | Vitest under `src/lib/agents/shared/crm-query-tools/__tests__/` | — | Mocks domain functions. |
| Integration tests | Vitest under `src/__tests__/integration/crm-query-tools/` | Live Supabase (env-gated) | Pattern from `src/__tests__/integration/crm-bots/reader.test.ts:1-80`. |
| E2E tests | `@playwright/test` under `e2e/` (NEW) | Dev server `localhost:3020` | Bootstrapped in Wave 0. |

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** crm-reader **coexists**, NOT replaced. Tools are additional.
- **D-02:** **5 tools** initially: `getContactByPhone`, `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`. Lista cerrada.
- **D-03:** Reemplaza preload Inngest by on-demand tool-call. **Cleanup vive en follow-ups, NO en este standalone.**
- **D-04:** Módulo en `src/lib/agents/shared/crm-query-tools/`. Export `createCrmQueryTools(ctx, options?)`.
- **D-05:** Workspace isolation via `ctx.workspaceId`. Tools NUNCA aceptan `workspaceId` directo del input.
- **D-06:** En este standalone, agregar a `CLAUDE.md` la sección `Module Scope: crm-query-tools` (PUEDE/NO PUEDE).
- **D-07:** Typed result discriminated union: `{ status: 'found' | 'not_found' | 'no_orders' | 'no_active_order' | 'config_not_set' | 'multiple_active' | 'error', data?, error? }`. NUNCA throw para casos esperados.
- **D-27 (locked 2026-04-29):** Cuando la config de stages activos del workspace está vacía (operador nunca configuró), `getActiveOrderByPhone` retorna `{ status: 'config_not_set', contact: ContactDetail }`. Status distinto de `no_active_order` (que significa "config existe pero ningún pedido del contacto está en stages activos"). Razón: el agente puede distinguir "operador necesita configurar" vs "cliente sin pedido activo" y guiar al operador. Tools `getLastOrderByPhone` y `getOrderById` no aplican (no leen config). `getOrdersByPhone` no aplica.
- **D-08:** Si 2+ contactos con mismo phone → retornar el más reciente por `created_at` DESC + `duplicates_count: number` + `duplicates: string[]`.
- **D-09:** Phone normalization **dentro de la tool** usando helper existente del proyecto. Si no se puede normalizar → `{ status: 'error', error: { code: 'invalid_phone' } }`.
- **D-10:** Phone no existe → `{ status: 'not_found' }`. Phone existe pero sin pedidos → `{ status: 'no_orders', contact: ContactDetail }`.
- **D-11:** "Stages activos" + "pipeline scope" como **config persistente por workspace en DB**. NO hardcoded, NO param del caller, NO heurística por nombre.
- **D-12:** Granularidad = **una config compartida por workspace**.
- **D-13:** Stages referenciados por **UUID**. Validación runtime: si `stage_id` ya no existe, domain limpia entrada y emite warning log.
- **D-14:** UI = sección nueva en `/agentes` (slug TBD por planner).
- **D-15:** 2+ pedidos en stages activos → más reciente por `created_at` DESC + `other_active_orders_count > 0`.
- **D-16:** Pipeline scope = todas las pipelines del workspace por default. Param opcional `pipelineId` override.
- **D-17:** No hay pedido activo → `{ status: 'no_active_order', contact: ContactDetail, last_terminal_order?: OrderDetail }`.
- **D-18:** Shape = **espejo de `OrderDetail` y `ContactDetail` del crm-reader**. Si insuficiente → **extender** (no fork).
- **D-19:** **Sin cache**. Cada tool-call llega a domain layer con query Supabase fresh.
- **D-20:** **Todo siempre incluido** en output (tags, custom_fields, items, addresses).
- **D-21:** Tools NO escriben legacy keys (`_v3:crm_context*`, `_v3:active_order`).
- **D-22:** Cleanup Inngest preload **NO** se hace en este standalone.
- **D-23:** Observability: emitir `pipeline_decision:crm_query_*` events + structured logs.
- **D-24:** Cobertura = Unit + Integration + Playwright UI E2E.
- **D-25:** En este standalone NO hay rollout a agentes.
- **D-26:** Handoff = `INTEGRATION-HANDOFF.md` + project skill `crm-query-tools` (en `.claude/skills/`).

### Claude's Discretion

- Slug exacto bajo `/agentes` (e.g., `crm-tools`, `configuracion-tools`, `herramientas`).
- Nombre tabla DB (`crm_query_tools_config`, `agent_query_config`, `workspace_crm_config`).
- Nombre project skill (`crm-query-tools` por default).
- Estructura interna del módulo (un archivo por tool vs. uno solo).
- Naming de eventos `pipeline_decision:crm_query_*` (sufijos exactos).
- Tabla nueva dedicada vs columna JSONB en tabla existente.

### Deferred Ideas (OUT OF SCOPE)

- Migración `somnio-recompra-v1` a usar tools nuevas + cleanup `recompra-preload-context.ts` → standalone follow-up.
- Migración `somnio-sales-v3-pw-confirmation` + cleanup step 1 de `pw-confirmation-preload-and-invoke.ts` → standalone follow-up.
- Borrado keys legacy `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order` de session_state.
- Tools adicionales: `getOrdersByEmail`, `getContactByCustomField`, etc.
- Refactor crm-reader para importar del módulo compartido.
- Override per-agente de la config.
- Tools de mutación (crm-writer es el único path).

---

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Impact on Plan |
|------------|--------|----------------|
| GSD complete obligatorio (Regla 0) | CLAUDE.md | Every plan must follow discuss → research → plan → execute → verify → LEARNINGS. |
| Push to Vercel after code changes (Regla 1) | CLAUDE.md | Each plan ends with `git push origin main`. UI changes must reach prod before user tests. |
| America/Bogota timezone (Regla 2) | CLAUDE.md | Migration `created_at` and `updated_at` use `timezone('America/Bogota', NOW())`. UI displays use `toLocaleString('es-CO', { timeZone: 'America/Bogota' })`. |
| Domain layer único path para mutaciones (Regla 3) | CLAUDE.md | Tools call ONLY `@/lib/domain/*`. NO `createAdminClient` in `src/lib/agents/shared/crm-query-tools/**` (verifiable via grep). |
| Migración antes de deploy (Regla 5) | CLAUDE.md | Plan must include explicit "PAUSE — apply migration in prod, await user confirmation" step BEFORE pushing code that uses new schema. |
| Proteger agente prod (Regla 6) | CLAUDE.md | NO agent migration in this standalone (D-25). Module + UI ship without touching production agents → no flag needed. |
| Documentación siempre actualizada (Regla 4) | CLAUDE.md | Update `CLAUDE.md` (D-06 module scope), update `docs/` if architecture changed, write LEARNINGS.md. |
| Port 3020 dev (Stack tecnológico) | CLAUDE.md | Playwright config baseURL = `http://localhost:3020`. |
| Tool handlers solo via `@/lib/domain/*` (agent-scope.md) | `.claude/rules/agent-scope.md` | Reinforces Regla 3. |
| OBLIGATORIO al crear agente nuevo (CLAUDE.md sección final) | CLAUDE.md | "Module" not "agent", but spirit applies — define scope explícito antes de escribir código (D-06). |

---

## Standard Stack

### Core (locked, already in package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `^6.0.86` | AI SDK v6 — `tool()` factory for tool definitions | Used by all crm-reader/crm-writer/somnio agents. `[VERIFIED: package.json:47]` |
| `zod` | `^4.3.6` | Tool input schema validation | Standard for AI SDK v6 inputSchema. `[VERIFIED: package.json:91]` |
| `libphonenumber-js` | `^1.12.35` | E.164 phone normalization (consumed via `@/lib/utils/phone`) | Used by `normalizePhone` at `src/lib/utils/phone.ts:12-16`. `[VERIFIED: package.json:64]` |
| `@supabase/supabase-js` | `^2.93.1` | Domain layer DB access via `createAdminClient` | All domain functions use it. `[VERIFIED: package.json:41]` |
| `vitest` | `^1.6.1` | Unit + integration test runner | `npm run test` = `vitest run` per `package.json:10`. Config at `vitest.config.ts:1-26`. `[VERIFIED: vitest.config.ts]` |
| Next.js Server Components | `next ^16.1.6` | UI under `/agentes/[slug]` | Same pattern as `src/app/(dashboard)/agentes/routing/page.tsx`. `[VERIFIED: package.json:67]` |
| `@radix-ui/react-popover` + `@radix-ui/react-checkbox` | `^1.1.15` / `^1.3.3` | Multi-select UI for stages | Pattern at `src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx:1-136`. `[VERIFIED: codebase]` |
| Tailwind CSS | `^4` | Theming consistent with editorial post-Plan-04 | `cn()` helper from `@/lib/utils`. `[VERIFIED: codebase]` |

### Supporting (already in codebase, internal)

| Module | Path | Purpose | When to Use |
|--------|------|---------|-------------|
| `normalizePhone` | `src/lib/utils/phone.ts:37` | E.164 normalization, returns `string \| null` | D-09 phone normalization in every tool |
| `createAdminClient` | `src/lib/supabase/admin` | Bypasses RLS, used by domain layer | NEVER in tool files — only domain |
| `searchContacts`, `getContactById` | `src/lib/domain/contacts.ts:539, 610` | Contact lookups | Used by `getContactByPhone` |
| `listOrders`, `getOrderById` | `src/lib/domain/orders.ts:1684, 1755` | Order lookups | Used by `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById` |
| `listPipelines`, `listStages` | `src/lib/domain/pipelines.ts:49, 93` | Read pipelines + stages for UI dropdowns | Used by config UI |
| `getCollector`, `recordEvent` | `src/lib/observability/collector.ts:153`, exported via `src/lib/observability/index.ts:32` | Emit `pipeline_decision:crm_query_*` events | D-23 observability |
| `createModuleLogger` | `src/lib/audit/logger.ts:86` | Structured pino logger per module | D-23 structured logs |
| `tool` from `ai` package | `import { tool } from 'ai'` | AI SDK v6 tool factory | Pattern at `crm-reader/tools/contacts.ts:31` |
| `getActiveWorkspaceId` | `src/app/actions/workspace.ts` | Server-side workspace context for UI | UI page + server actions |
| `revalidatePath` | `next/cache` | Refresh UI after config save | Pattern at `routing/_actions.ts:21,95` |

### Alternatives Considered

| Instead of | Could Use | Why Not |
|------------|-----------|---------|
| Dedicated table `crm_query_tools_config` | JSONB key in `workspaces.settings` | JSONB has no FK to `pipeline_stages`. D-13 requires runtime cleanup if stage deleted — that's manual code, while a dedicated junction table gets `ON DELETE SET NULL` for free. Also: workspace-scoped config with FK is the **established codebase pattern** (`carrier_configs.pdf_inter_stage_id` at `20260224000000_guide_gen_config.sql:19`). |
| Dedicated table `crm_query_tools_config` | New columns on `workspace_agent_config` | `workspace_agent_config` is for agent runtime knobs (timer_preset, response_speed). Mixing in stage-list config would clutter and prevent FK behavior on individual stages (would need a junction table anyway). |
| One file per tool (`getContactByPhone.ts`, `getLastOrderByPhone.ts`, ...) | Single `tools.ts` file | crm-reader uses **grouped** files (`contacts.ts`, `orders.ts`, `pipelines.ts`, `tags.ts`) at `src/lib/agents/crm-reader/tools/`. Recommend grouping by entity: `contacts.ts` (1 tool), `orders.ts` (4 tools). Matches existing convention and keeps each file under ~200 lines. |
| `@playwright/test` | Skip E2E, use integration only | D-24 explicitly demands E2E. Bootstrap cost is ~1 plan. |
| `node-test` for unit tests | Vitest | `package.json:10` already standardizes on `vitest run`. No reason to deviate. |

**Installation (Wave 0):**
```bash
npm install --save-dev @playwright/test
npx playwright install chromium  # browser binary
```

**Version verification (do at plan-time, not assumed):**
```bash
npm view @playwright/test version  # current latest
npm view @playwright/test dist-tags
```
**Recommendation:** pin to a specific minor matching the already-installed `playwright@1.58.2` to avoid binary mismatch (Railway robot dockerfile lesson — see MEMORY: "Docker image version MUST match playwright npm package exactly"). For local E2E, this matters less, but consistency reduces friction.

---

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│  Operator Browser (Editorial UI)                                      │
│  /agentes/crm-tools                                                   │
│   ├─ Multi-select: stages activos (junction table CRUD)              │
│   ├─ Pipeline scope picker (dropdown from listPipelines)             │
│   └─ Save → Server Action                                            │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ revalidatePath('/agentes/crm-tools')
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js Server Action (_actions.ts)                                  │
│   ├─ getActiveWorkspaceId() → ctx                                    │
│   └─ updateCrmQueryToolsConfig(ctx, partial)                         │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ via @/lib/domain/crm-query-tools-config
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Domain Layer (src/lib/domain/crm-query-tools-config.ts)              │
│   ├─ getCrmQueryToolsConfig(ctx) → { activeStageIds, pipelineId }    │
│   ├─ updateCrmQueryToolsConfig(ctx, partial)                         │
│   └─ Filters by ctx.workspaceId, uses createAdminClient              │
└────────────────────────┬─────────────────────────────────────────────┘
                         │ Supabase
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Supabase tables                                                      │
│   ├─ crm_query_tools_config (workspace_id PK, pipeline_id NULLABLE)  │
│   └─ crm_query_tools_active_stages                                   │
│        (workspace_id, stage_id) — FK ON DELETE SET NULL              │
└──────────────────────────────────────────────────────────────────────┘

────────────────────────── Tool Invocation Flow ──────────────────────────

┌──────────────────────────────────────────────────────────────────────┐
│  Future Agent (NOT migrated in this standalone — see D-25)            │
│  tools: { ...createCrmQueryTools({ workspaceId, invoker: 'agent-id' }) }
└────────────────────────┬─────────────────────────────────────────────┘
                         │ inputs: { phone: "3001234567" }
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Tool execute() in src/lib/agents/shared/crm-query-tools/             │
│   1. Phone normalization                                              │
│      const e164 = normalizePhone(phone)                               │
│      if (!e164) return { status: 'error', error: { code: 'invalid_phone' } }│
│   2. Read config from domain                                          │
│      const cfg = await getCrmQueryToolsConfig(domainCtx)             │
│   3. Call domain query (workspace-filtered)                           │
│      const r = await searchContacts(domainCtx, { query: e164, ... })  │
│   4. Apply duplicates flag (D-08), active-stage filter (D-15), etc.  │
│   5. Emit observability event                                         │
│      collector?.recordEvent('pipeline_decision', 'crm_query_completed',│
│        { tool: 'getContactByPhone', latencyMs, status: 'found' })     │
│   6. Return typed ToolLookupResult / ToolListResult                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── agents/
│   │   └── shared/                          # NEW directory (D-04 — does not exist yet)
│   │       └── crm-query-tools/
│   │           ├── index.ts                 # exports createCrmQueryTools
│   │           ├── types.ts                 # extended ToolLookupResult variants for this module
│   │           ├── contacts.ts              # getContactByPhone (1 tool)
│   │           ├── orders.ts                # getLastOrderByPhone, getOrdersByPhone,
│   │           │                            #   getActiveOrderByPhone, getOrderById (4 tools)
│   │           ├── helpers.ts               # phone normalize wrapper, duplicates resolution,
│   │           │                            #   active-stage filtering
│   │           └── __tests__/
│   │               ├── contacts.test.ts
│   │               ├── orders.test.ts
│   │               └── helpers.test.ts
│   └── domain/
│       └── crm-query-tools-config.ts        # NEW: getCrmQueryToolsConfig, updateCrmQueryToolsConfig
├── app/
│   └── (dashboard)/
│       └── agentes/
│           ├── layout.tsx                   # ADD new tab "Herramientas CRM" → /agentes/crm-tools
│           └── crm-tools/                   # NEW directory (slug recommended: 'crm-tools')
│               ├── page.tsx                 # Server Component, reads config + listPipelines
│               ├── _actions.ts              # Server Actions for save
│               └── _components/
│                   └── ConfigEditor.tsx     # Client Component (multi-select, pipeline picker)
└── __tests__/
    └── integration/
        └── crm-query-tools/                 # NEW (mirrors crm-bots/ pattern)
            └── tools.test.ts                # cross-workspace leak, config-driven active filter
e2e/                                         # NEW directory (Wave 0)
├── crm-query-tools.spec.ts                  # Playwright UI E2E
└── fixtures/
    └── seed.ts                              # Seed contacts/orders/pipelines/stages
playwright.config.ts                         # NEW (Wave 0)
```

### Pattern 1: AI SDK v6 Tool Definition (mirrors crm-reader)

**What:** Tool exported via `tool({ description, inputSchema, execute })` from `ai` package.
**When:** Every tool in this module follows this exact shape.
**Example (verbatim from crm-reader for reference):**

```typescript
// Source: src/lib/agents/crm-reader/tools/contacts.ts:30-54
import { tool } from 'ai'
import { z } from 'zod'

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
    return { status: 'ok', count: items.length, items }
  },
}),
```

**Adaptation for crm-query-tools:** Same shape, but `inputSchema` has `phone` (raw string), and execute calls `normalizePhone` first. Return shape extends with `not_found`, `no_orders`, `no_active_order`, `config_not_set` (D-27), `multiple_active`, `invalid_phone`.

### Pattern 2: Two-Layer (Tool → Domain) Strict Invariant

**What:** Tool files import ONLY from `@/lib/domain/*`. Zero `createAdminClient`, zero raw Supabase.
**When:** Universal — verified via grep at PR review (BLOCKER 1 invariant per `crm-reader/tools/contacts.ts:5-7` comment).
**How to verify:**

```bash
grep -rn "createAdminClient\|@supabase/supabase-js" src/lib/agents/shared/crm-query-tools/ --include="*.ts"
# Expected: zero matches
```

The plan must include this grep in the Wave verification step.

### Pattern 3: Discriminated Union Return Shape

**What:** Every tool returns `ToolLookupResult<T> | ToolListResult<T>` with `status` field.
**When:** Both for happy paths and expected errors. Throws ONLY for unexpected errors (bug, null deref).
**Example:**

```typescript
// Reused from src/lib/agents/crm-reader/types.ts:50-58
export type ToolLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found_in_workspace' }
  | { status: 'error'; message: string }

// EXTENDED for crm-query-tools (per D-07, D-10, D-15, D-17, D-27):
export type CrmQueryLookupResult<T> =
  | { status: 'found'; data: T }
  | { status: 'not_found' }                                    // phone unknown
  | { status: 'no_orders'; contact: ContactDetail }             // contact exists, no orders
  | { status: 'no_active_order'; contact: ContactDetail; last_terminal_order?: OrderDetail }
  | { status: 'config_not_set'; contact: ContactDetail }        // D-27: workspace never configured active stages
  | { status: 'error'; error: { code: string; message?: string } }
```

**Note on naming:** crm-reader uses `not_found_in_workspace`; this standalone uses `not_found` (simpler — workspace isolation is implicit, since `ctx.workspaceId` is the only scope). Document this as an intentional divergence in `INTEGRATION-HANDOFF.md`.

### Pattern 4: Workspace-Scoped Config Table with Junction for Multi-Value FK

**What:** Two tables:
1. `crm_query_tools_config` — singleton per workspace (`workspace_id` is PK), holds scalar config (`pipeline_id` nullable).
2. `crm_query_tools_active_stages` — junction (`workspace_id`, `stage_id`) for the multi-select active stages.

**When:** D-13 requires per-stage FK behavior (`ON DELETE SET NULL` doesn't work for a JSONB array — you'd need a trigger; junction is cleaner).
**Migration sketch:**

```sql
-- supabase/migrations/2026MMDDHHMMSS_crm_query_tools_config.sql
CREATE TABLE crm_query_tools_config (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  pipeline_id  UUID NULL REFERENCES pipelines(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW())
);

CREATE TABLE crm_query_tools_active_stages (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  stage_id     UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),
  PRIMARY KEY (workspace_id, stage_id)
);

CREATE INDEX idx_crm_query_tools_active_stages_ws ON crm_query_tools_active_stages(workspace_id);

-- RLS: SELECT via is_workspace_member, INSERT/UPDATE via is_workspace_admin
ALTER TABLE crm_query_tools_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_query_tools_active_stages ENABLE ROW LEVEL SECURITY;

-- (full policies follow workspace_agent_config pattern at
--  20260209000000_agent_production.sql:24-39)

-- Grants per LEARNING from platform_config migration
-- (20260420000443_platform_config.sql:30-34):
GRANT ALL    ON TABLE public.crm_query_tools_config        TO service_role;
GRANT SELECT ON TABLE public.crm_query_tools_config        TO authenticated;
GRANT ALL    ON TABLE public.crm_query_tools_active_stages TO service_role;
GRANT SELECT ON TABLE public.crm_query_tools_active_stages TO authenticated;
```

**FK behavior decision (D-13):**
- For active stages junction: **`ON DELETE CASCADE`** — if a stage is deleted, its membership in the active set is automatically removed. No manual cleanup needed.
- For `pipeline_id` scalar: **`ON DELETE SET NULL`** — if the configured pipeline is deleted, the column resets to "all pipelines" (matches default semantics of D-16).
- **Code-side fallback (D-13 second sentence):** even with FK, the domain `getCrmQueryToolsConfig` should defensively log a warning if it ever sees a `stage_id` that doesn't resolve via JOIN (should never happen with CASCADE, but defense-in-depth).

### Pattern 5: Observability Emit (mirrors crm-writer-adapter)

**What:** `getCollector()?.recordEvent('pipeline_decision', '<label>', payload)` from `@/lib/observability`.
**When:** Each tool emits 2-3 events: `crm_query_invoked` (start), `crm_query_completed` (success path with status + latencyMs), `crm_query_failed` (error path with error.code).
**Example (verbatim pattern from `crm-writer-adapter.ts:172-178`):**

```typescript
// Source: src/lib/agents/engine-adapters/production/crm-writer-adapter.ts:156-178
import { getCollector } from '@/lib/observability'

const startedAt = Date.now()
getCollector()?.recordEvent('pipeline_decision', 'crm_query_invoked', {
  tool: 'getContactByPhone',
  workspaceId: ctx.workspaceId,
  invoker: ctx.invoker,
  // NO phone in payload (PII — log normalized E.164 last 4 digits at most)
  phoneSuffix: e164.slice(-4),
})

// ... after work ...

getCollector()?.recordEvent('pipeline_decision', 'crm_query_completed', {
  tool: 'getContactByPhone',
  workspaceId: ctx.workspaceId,
  invoker: ctx.invoker,
  status: result.status,
  latencyMs: Date.now() - startedAt,
})
```

**Recommended event labels (filling in D-23 discretion):**
- `crm_query_invoked` — emitted at top of execute()
- `crm_query_completed` — emitted on any success path (`found`, `not_found`, `no_orders`, `no_active_order`, `config_not_set`)
- `crm_query_failed` — emitted on `error` path (DB error, invalid_phone)

**EventCategory note:** `pipeline_decision` is already a valid `EventCategory` per `src/lib/observability/types.ts:77`. NO new category needed.

### Anti-Patterns to Avoid

- **Calling `createAdminClient` directly in tool files** — violates Regla 3. Tools must call domain functions exclusively.
- **Reading `ctx.workspaceId` from input body** — workspace MUST come from execution context (`createCrmQueryTools(ctx)`), never tool input. (D-05)
- **Caching results in module scope or session_state** — D-19 demands every call hits domain fresh. Stale data is a known crm-stage-integrity bug class.
- **Hardcoding stage names like 'CONFIRMADO' / 'ENTREGADO' as filter values** — D-13 demands UUID, and the active list is config-driven (D-11).
- **Throwing for `not_found` / `no_orders`** — these are expected business outcomes, return them as discriminated status (D-07). Throw only for bugs.
- **Writing legacy session keys (`_v3:crm_context*`) from tool code** — D-21. Tools are pure return values. Caller decides persistence.
- **Forking shape from crm-reader** — D-18. If `OrderDetail` is missing a field, EXTEND it in domain (add the field), don't define a new interface.
- **Mixing config in `workspaces.settings` JSONB** — works for simple flags but loses FK guarantees. The two-table approach is established (`carrier_configs`, `workspace_agent_config`).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone normalization | Custom regex / manual `+57` prepending | `normalizePhone(input)` from `src/lib/utils/phone.ts:37` | Handles 4 strategies (E.164, CO fallback, intl auto-detect, last-resort CO). Already used by `webhook-processor` (canonical inbound match). |
| Workspace-scoped DB queries | Raw `supabase.from(...)` | Domain layer functions in `src/lib/domain/` | Regla 3. Domain layer does workspace filtering, error wrapping, type mapping. |
| Tool result discriminated union | New shape | `ToolLookupResult<T>` / `ToolListResult<T>` from `src/lib/agents/crm-reader/types.ts:50-58` | D-18 demands espejo, not fork. Reuse + extend. |
| Contact / Order shape | New `ContactInfo` / `OrderInfo` | `ContactDetail` / `OrderDetail` from `src/lib/domain/contacts.ts:592` and `src/lib/domain/orders.ts:1736` | D-18. Extend in-place if `department` (contacts) or `shippingAddress/City/Department` (orders) missing — they ARE missing today. |
| Observability event emission | Console.log + custom format | `getCollector()?.recordEvent('pipeline_decision', label, payload)` from `@/lib/observability` | Routes to `agent_observability_events` table for UI dashboard, AsyncLocalStorage-bound to current turn. |
| Structured logs | Custom JSON | `createModuleLogger('crm-query-tools.contacts')` from `@/lib/audit/logger` | pino-based, project-standard. |
| Multi-select UI | Custom dropdown | `MultiSelect` from `src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx:36-136` (or import as a shared component) | Already supports grouped options (pipeline → stages). |
| Pipeline / stage list for UI | Custom Supabase query | `listPipelines(ctx)` from `src/lib/domain/pipelines.ts:49` | Returns `PipelineWithStages[]` with stages already nested + sorted by position. |
| Admin auth in server action | Custom check | `getActiveWorkspaceId()` from `src/app/actions/workspace.ts` (used at `routing/page.tsx:32` and `routing/_actions.ts:31`) | Returns null if no workspace context — early return path. |
| Stage UUID resolution | Hardcoded | DB FK + `listStages(ctx, { pipelineId })` | D-13. UI fetches stages on pipeline change, persists UUIDs. |
| Config caching | LRU | None — D-19 forbids caching | Config IS read fresh every tool call. Latency is acceptable per D-19 rationale. |

**Key insight:** The codebase has already paid the cost of building the right abstractions. This standalone is **wiring + extension**, not invention.

---

## Common Pitfalls

### Pitfall 1: Cross-Workspace Leak via `phone` Input

**What goes wrong:** Two workspaces have a contact with phone `+573001234567`. The tool searches by phone but forgets to filter by `workspace_id` → returns the wrong contact.
**Why it happens:** Domain functions filter by workspace correctly, but if the tool author writes a "shortcut" raw query (anti-pattern), the filter is missed.
**How to avoid:** Tool code calls ONLY domain functions, which always filter by `ctx.workspaceId`. Verify with the BLOCKER 1 grep (`grep -rn "createAdminClient" src/lib/agents/shared/crm-query-tools/`).
**Warning signs:** Any direct Supabase import in `src/lib/agents/shared/crm-query-tools/**`.
**Test required:** Integration test that creates the SAME phone in two workspaces, calls tool with `ctx.workspaceId = WS_A`, asserts it returns the WS_A contact (not WS_B's). Pattern from `src/__tests__/integration/crm-bots/security.test.ts` (cross-workspace isolation tests).

### Pitfall 2: Stale `stage_id` After Stage Deletion

**What goes wrong:** Operator deletes a stage. The config still references it → tool returns nothing or errors.
**Why it happens:** Without FK, the JSONB array would have a dead UUID until manual cleanup.
**How to avoid:** FK `ON DELETE CASCADE` on the junction table → row auto-removed when stage deleted. Defensive: domain `getCrmQueryToolsConfig` JOINs to `pipeline_stages` and returns only resolved stages, logging a warning for any unresolved (should never happen with CASCADE — sign of schema drift).
**Warning signs:** Warnings in logs about unresolved stage IDs.
**Test required:** Integration test: seed config with 2 stage IDs → delete one stage → call `getCrmQueryToolsConfig` → assert only 1 stage returned (no error, no stale UUID).

### Pitfall 3: Multi-Active Order Resolution Wrong Order

**What goes wrong:** Customer has FALTA INFO (newer) + FALTA CONFIRMAR (older). Tool returns the older one because it uses `id` ordering or insertion order instead of `created_at`.
**Why it happens:** Default `ORDER BY` may be by primary key. Easy oversight.
**How to avoid:** Always `ORDER BY created_at DESC` explicitly. Domain `listOrders` already does this (`orders.ts:1698`). For active-order filtering applied in tool code, sort manually after pulling stages.
**Warning signs:** Test asserts most-recent order returned but flips assertion under different test order.
**Test required:** Unit test with fixture of 3 active orders, different `created_at`, verify newest returned + `other_active_orders_count === 2`.

### Pitfall 4: Phone Format Mismatch in DB

**What goes wrong:** Contact stored with phone `573001234567` (no `+`), tool normalizes to `+573001234567` → ILIKE matches don't find.
**Why it happens:** Historical Somnio data uses `normalizePhoneRaw` (no `+` prefix) per `src/lib/utils/phone.ts:126-158`, but `normalizePhone` adds `+`. Workspace data is mixed.
**How to avoid:** Tool normalizes input to E.164 (+...). Then queries domain with **substring match** strategy: strip `+` from query, use `phone.ilike.%${digits}%`. This matches both `573001234567` and `+573001234567`. Or, use both formats in an `or` filter.
**Recommended:** Domain `searchContacts` already uses ILIKE on phone (`contacts.ts:558`). Tool passes the E.164 form (with `+`) — ILIKE handles substring match against either DB format.
**Warning signs:** Test passes when DB seeded with `+...` but fails when seeded without.
**Test required:** Unit test with both formats in fixtures.

### Pitfall 5: Cross-Lambda Config Cache Inconsistency

**What goes wrong:** Operator saves new active stages config in UI. One lambda's tool already has cached config from 30s ago → returns wrong active set.
**Why it happens:** Vercel runs multiple concurrent lambdas. `platform_config` has 30s in-memory cache (`platform-config.ts:58`) — same trap.
**How to avoid:** Per D-19, the tools have **NO cache for query results**, but the **config read** is on every call. Recommendation: also NO cache for config (every tool call does a fresh `SELECT`). Latency cost is negligible (~30-50ms per query).
**Alternative:** Cache config with same 30s TTL as platform_config (acceptable consistency window for an operator changing config).
**Warning signs:** Operator reports "I changed the stages but agents still use old ones for X seconds."
**Recommendation for this standalone:** Match D-19 rationale — go cache-free for config read on every tool call. If this hurts in production, a 5-30s TTL can be added in a follow-up. Document this as an explicit decision in the plan, not an oversight.

### Pitfall 6: Vercel Lambda Cold-Start Hides Module-Scope Bugs

**What goes wrong:** Module-scope side-effects (e.g., `agentRegistry.register(...)` outside lambda handler) silently fail because cold-start re-runs the file.
**Why it happens:** Stack-tracking lesson from `MEMORY: "initializeTools() safety net: ANY executeToolFromAgent in serverless MUST call initializeTools()"`.
**How to avoid:** `createCrmQueryTools(ctx)` is a factory — it creates fresh tools per call. NO module-scope state. Already idiomatic for this design.
**Warning signs:** Tests pass locally, fail under load on Vercel.
**Test required:** Smoke test that calls the tool from a fresh process (Wave 5 integration test step).

### Pitfall 7: Migration Forgot GRANTs

**What goes wrong:** New tables created via `supabase db push` don't auto-grant to `service_role` and `authenticated`. Domain layer queries fail with `42501 — permission denied`.
**Why it happens:** Documented LEARNING from `platform_config` migration (`20260420000443_platform_config.sql:30-34`).
**How to avoid:** Migration includes explicit `GRANT ALL ON TABLE public.<name> TO service_role; GRANT SELECT ON TABLE public.<name> TO authenticated;`.
**Warning signs:** First production read returns 42501.
**Required in migration:** Both grants for both new tables.

### Pitfall 8: `is_closed` Column Tempts Reuse

**What goes wrong:** Researcher / planner sees `pipeline_stages.is_closed BOOLEAN` (`20260129000003_orders_foundation.sql:57`) and thinks "we can use this instead of a config table."
**Why it happens:** It's a real column, used by `getActiveOrderForContact` at `orders.ts:1861`.
**How to avoid:** D-11 explicitly chose **config-driven** over `is_closed`. The reason: per-workspace, per-pipeline customization. Some workspaces may want to treat "FALTA INFO" as terminal for pw-confirmation purposes but not for general inbox; this is impossible with a single `is_closed` column.
**Warning signs:** Plan suggests "just filter by `is_closed=false`."
**Required:** Plan code uses ONLY the config-table active-stage list, never the `is_closed` column. Document in `INTEGRATION-HANDOFF.md` why.

### Pitfall 9: Missing Shipping Fields on `OrderDetail`

**What goes wrong:** `getActiveOrderByPhone` is supposed to return enough data for the agent to show shipping address — but `OrderDetail` (line 1736 of `orders.ts`) doesn't include `shippingAddress`, `shippingCity`, `shippingDepartment`. The DB columns exist (used in `updateOrder` at lines 442-444), but the read interface drops them.
**Why it happens:** crm-reader's `ordersGet` was written for a different use case where shipping wasn't needed.
**How to avoid:** **Extend `OrderDetail`** (per D-18) to include shipping fields. This requires editing `src/lib/domain/orders.ts:1736-1753` AND `getOrderById` SELECT (`orders.ts:1764`) AND the mapping (`orders.ts:1789-1799`). All existing crm-reader callers are unaffected (additive fields).
**Test required:** Verify `OrderDetail.shippingAddress` is set when DB has value, null when not.

### Pitfall 10: `ContactDetail.department` Missing

**What goes wrong:** Same class as Pitfall 9 but for contact's department field. `contacts` table has `department` (`contacts.ts:33`), `ContactDetail` interface (line 592) has only `address` + `city`.
**How to avoid:** Add `department: string | null` to `ContactDetail`, update SELECT at `contacts.ts:619` (currently `'id, name, phone, email, address, city, custom_fields, ...'`), update mapping at line 642-653.
**Test required:** Verify field present.

---

## Code Examples

### Example 1: Tool Factory Skeleton (recommended)

```typescript
// src/lib/agents/shared/crm-query-tools/index.ts

import type { DomainContext } from '@/lib/domain/types'
import { makeContactQueryTools } from './contacts'
import { makeOrderQueryTools } from './orders'

export interface CrmQueryToolsContext {
  workspaceId: string
  /** Caller agent id for observability — e.g. 'somnio-recompra-v1' */
  invoker?: string
}

export function createCrmQueryTools(ctx: CrmQueryToolsContext) {
  return {
    ...makeContactQueryTools(ctx),
    ...makeOrderQueryTools(ctx),
  }
}

// Re-exports for downstream consumers (Plan: INTEGRATION-HANDOFF.md)
export type { CrmQueryLookupResult, CrmQueryListResult } from './types'
```

### Example 2: `getContactByPhone` Tool (full)

```typescript
// src/lib/agents/shared/crm-query-tools/contacts.ts

import { tool } from 'ai'
import { z } from 'zod'
import { searchContacts, getContactById, type ContactDetail } from '@/lib/domain/contacts'
import type { DomainContext } from '@/lib/domain/types'
import { createModuleLogger } from '@/lib/audit/logger'
import { getCollector } from '@/lib/observability'
import { normalizePhone } from '@/lib/utils/phone'
import type { CrmQueryToolsContext } from './index'
import type { CrmQueryLookupResult } from './types'

const logger = createModuleLogger('crm-query-tools.contacts')

export function makeContactQueryTools(ctx: CrmQueryToolsContext) {
  const domainCtx: DomainContext = {
    workspaceId: ctx.workspaceId,
    source: 'tool-handler',
  }

  return {
    getContactByPhone: tool({
      description:
        'Busca un contacto del workspace por numero de telefono. Acepta cualquier formato (3001234567, +57 300 123 4567, etc) y normaliza a E.164. ' +
        'Retorna el contacto con tags y custom_fields. Si hay duplicados, retorna el mas reciente con flag duplicates_count.',
      inputSchema: z.object({
        phone: z.string().min(7).describe('Telefono en cualquier formato razonable'),
      }),
      execute: async ({ phone }): Promise<CrmQueryLookupResult<ContactDetail & { duplicates_count: number; duplicates: string[] }>> => {
        const startedAt = Date.now()
        const collector = getCollector()
        collector?.recordEvent('pipeline_decision', 'crm_query_invoked', {
          tool: 'getContactByPhone',
          workspaceId: ctx.workspaceId,
          invoker: ctx.invoker,
          phoneSuffix: phone.replace(/\D/g, '').slice(-4),
        })

        // 1. Normalize phone (D-09)
        const e164 = normalizePhone(phone)
        if (!e164) {
          collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
            tool: 'getContactByPhone',
            workspaceId: ctx.workspaceId,
            errorCode: 'invalid_phone',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'invalid_phone' } }
        }

        // 2. Search contacts via domain (workspace-filtered)
        const search = await searchContacts(domainCtx, { query: e164.replace(/^\+/, ''), limit: 50 })
        if (!search.success) {
          logger.error({ error: search.error, workspaceId: ctx.workspaceId }, 'searchContacts failed')
          collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
            tool: 'getContactByPhone',
            workspaceId: ctx.workspaceId,
            errorCode: 'db_error',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'db_error', message: search.error } }
        }

        // 3. Filter for exact phone match (search uses ILIKE substring — narrow it)
        const matches = (search.data ?? []).filter((c) => normalizePhone(c.phone ?? '') === e164)
        if (matches.length === 0) {
          collector?.recordEvent('pipeline_decision', 'crm_query_completed', {
            tool: 'getContactByPhone',
            workspaceId: ctx.workspaceId,
            status: 'not_found',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'not_found' }
        }

        // 4. Apply duplicates flag (D-08): sort DESC by createdAt
        matches.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        const primary = matches[0]
        const duplicates = matches.slice(1).map((m) => m.id)

        // 5. Fetch full ContactDetail for the primary (with tags + custom_fields)
        const detail = await getContactById(domainCtx, { contactId: primary.id })
        if (!detail.success || !detail.data) {
          collector?.recordEvent('pipeline_decision', 'crm_query_failed', {
            tool: 'getContactByPhone',
            workspaceId: ctx.workspaceId,
            errorCode: 'detail_fetch_failed',
            latencyMs: Date.now() - startedAt,
          })
          return { status: 'error', error: { code: 'db_error', message: detail.error } }
        }

        collector?.recordEvent('pipeline_decision', 'crm_query_completed', {
          tool: 'getContactByPhone',
          workspaceId: ctx.workspaceId,
          status: 'found',
          duplicatesCount: duplicates.length,
          latencyMs: Date.now() - startedAt,
        })

        return {
          status: 'found',
          data: {
            ...detail.data,
            duplicates_count: duplicates.length,
            duplicates,
          },
        }
      },
    }),
  }
}
```

### Example 3: Active-Order Filtering Logic (D-15, D-17 + config-driven)

```typescript
// src/lib/agents/shared/crm-query-tools/helpers.ts

import { listOrders, type OrderListItem } from '@/lib/domain/orders'
import type { DomainContext } from '@/lib/domain/types'
import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'

export async function findActiveOrderForContact(
  domainCtx: DomainContext,
  contactId: string,
  pipelineIdOverride?: string,
): Promise<{ active: OrderListItem | null; otherActiveCount: number; lastTerminal: OrderListItem | null }> {
  const cfg = await getCrmQueryToolsConfig(domainCtx)
  const activeStageIds = new Set(cfg.activeStageIds)
  const pipelineId = pipelineIdOverride ?? cfg.pipelineId ?? undefined

  const result = await listOrders(domainCtx, { contactId, pipelineId, limit: 50 })
  if (!result.success) throw new Error(result.error)

  const orders = (result.data ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const actives = orders.filter((o) => activeStageIds.has(o.stageId))
  const terminals = orders.filter((o) => !activeStageIds.has(o.stageId))

  return {
    active: actives[0] ?? null,
    otherActiveCount: Math.max(0, actives.length - 1),
    lastTerminal: terminals[0] ?? null,
  }
}
```

### Example 4: Domain Config Read

```typescript
// src/lib/domain/crm-query-tools-config.ts

import { createAdminClient } from '@/lib/supabase/admin'
import type { DomainContext, DomainResult } from './types'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('domain.crm-query-tools-config')

export interface CrmQueryToolsConfig {
  pipelineId: string | null
  activeStageIds: string[]
}

export async function getCrmQueryToolsConfig(ctx: DomainContext): Promise<CrmQueryToolsConfig> {
  const supabase = createAdminClient()

  // Read config row + active stages in parallel
  const [cfgRes, stagesRes] = await Promise.all([
    supabase.from('crm_query_tools_config').select('pipeline_id').eq('workspace_id', ctx.workspaceId).maybeSingle(),
    supabase.from('crm_query_tools_active_stages').select('stage_id').eq('workspace_id', ctx.workspaceId),
  ])

  if (cfgRes.error) {
    logger.error({ error: cfgRes.error, workspaceId: ctx.workspaceId }, 'config read error')
    return { pipelineId: null, activeStageIds: [] } // fail-open default
  }
  if (stagesRes.error) {
    logger.error({ error: stagesRes.error, workspaceId: ctx.workspaceId }, 'active stages read error')
    return { pipelineId: cfgRes.data?.pipeline_id ?? null, activeStageIds: [] }
  }

  return {
    pipelineId: cfgRes.data?.pipeline_id ?? null,
    activeStageIds: (stagesRes.data ?? []).map((r: { stage_id: string }) => r.stage_id),
  }
}

export interface UpdateCrmQueryToolsConfigParams {
  pipelineId?: string | null
  activeStageIds?: string[]
}

export async function updateCrmQueryToolsConfig(
  ctx: DomainContext,
  params: UpdateCrmQueryToolsConfigParams,
): Promise<DomainResult<CrmQueryToolsConfig>> {
  // Implementation: upsert config row, sync active_stages junction table.
  // Pattern: delete + insert for the junction (idempotent, simple).
  // Atomicity: wrap in a Postgres function or accept tolerable inconsistency
  // (config row + junction may briefly disagree during write — acceptable for an admin UI).
  // ... full impl in plan
}
```

### Example 5: Server-Side Page (UI)

```tsx
// src/app/(dashboard)/agentes/crm-tools/page.tsx
// Pattern mirrors src/app/(dashboard)/agentes/routing/page.tsx:31-156

import { getActiveWorkspaceId } from '@/app/actions/workspace'
import { getCrmQueryToolsConfig } from '@/lib/domain/crm-query-tools-config'
import { listPipelines } from '@/lib/domain/pipelines'
import { ConfigEditor } from './_components/ConfigEditor'

export default async function CrmToolsConfigPage() {
  const workspaceId = await getActiveWorkspaceId()
  if (!workspaceId) {
    return <div className="p-6 text-muted-foreground">No hay workspace seleccionado.</div>
  }

  const [config, pipelines] = await Promise.all([
    getCrmQueryToolsConfig({ workspaceId, source: 'server-action' }),
    listPipelines({ workspaceId, source: 'server-action' }),
  ])

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">Herramientas CRM</h1>
        <p className="text-sm text-muted-foreground">
          Configura que stages cuentan como pedidos activos y el pipeline scope para las tools de consulta CRM.
        </p>
      </div>
      <ConfigEditor
        initialConfig={config}
        pipelines={pipelines.success ? pipelines.data : []}
      />
    </div>
  )
}
```

### Example 6: Playwright E2E Test Skeleton (Wave 0 + Wave 5)

```typescript
// e2e/crm-query-tools.spec.ts
import { test, expect } from '@playwright/test'

test.describe('crm-query-tools UI ↔ DB ↔ tool integration', () => {
  test('configures active stages via UI and tool respects them', async ({ page, request }) => {
    // 1. Authenticate (uses Supabase test session — see e2e/fixtures/auth.ts)
    await page.goto('/agentes/crm-tools')

    // 2. Pick pipeline
    await page.getByRole('combobox', { name: 'Pipeline' }).click()
    await page.getByRole('option', { name: 'Ventas Somnio Standard' }).click()

    // 3. Multi-select active stages
    await page.getByRole('combobox', { name: 'Stages activos' }).click()
    await page.getByRole('checkbox', { name: 'NUEVO PAG WEB' }).check()
    await page.getByRole('checkbox', { name: 'FALTA INFO' }).check()
    await page.getByRole('button', { name: 'Cerrar' }).click()

    // 4. Save
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page.getByText('Configuracion guardada')).toBeVisible()

    // 5. Invoke tool via test-helper API endpoint (see e2e/fixtures/tool-runner.ts)
    const result = await request.post('/api/test/crm-query-tools/runner', {
      data: { tool: 'getActiveOrderByPhone', input: { phone: '+573001234567' } },
    })
    const json = await result.json()

    // 6. Assert tool respected the configured stages
    expect(json.status).toBe('found')
    expect(['NUEVO PAG WEB', 'FALTA INFO']).toContain(json.data.stageName)
  })
})
```

---

## File-by-File Implementation Map

| Path | Action | Wave | Notes |
|------|--------|------|-------|
| `playwright.config.ts` | CREATE | W0 | Pin to `@playwright/test` matching `playwright@1.58.2`. baseURL `http://localhost:3020`. |
| `e2e/fixtures/auth.ts` | CREATE | W0 | Supabase test session helper. |
| `e2e/fixtures/seed.ts` | CREATE | W0 | Seed test workspace with contacts/orders/pipelines/stages. |
| `e2e/.gitignore` | CREATE | W0 | Ignore Playwright report dir. |
| `package.json` | EDIT | W0 | Add `@playwright/test` devDep, scripts `test:e2e`, `test:e2e:ui`. |
| `vitest.config.ts` | EDIT (optional) | W0 | Add `exclude: ['e2e/**']` so Vitest doesn't try to run Playwright specs. |
| `supabase/migrations/2026MMDDHHMMSS_crm_query_tools_config.sql` | CREATE | W1 | Two tables + RLS + GRANTs. **Pause for user to apply (Regla 5).** |
| `src/lib/domain/crm-query-tools-config.ts` | CREATE | W1 | `getCrmQueryToolsConfig`, `updateCrmQueryToolsConfig`. |
| `src/lib/domain/contacts.ts` | EDIT | W1 | Add `department: string \| null` to `ContactDetail` (line 592) + select (line 619) + mapping (line 642). |
| `src/lib/domain/orders.ts` | EDIT | W1 | Add `shippingAddress`, `shippingCity`, `shippingDepartment` to `OrderDetail` (line 1736) + select (line 1764) + mapping (line 1789). |
| `src/lib/agents/shared/crm-query-tools/index.ts` | CREATE | W2 | `createCrmQueryTools(ctx)` factory + types re-export. |
| `src/lib/agents/shared/crm-query-tools/types.ts` | CREATE | W2 | `CrmQueryToolsContext`, `CrmQueryLookupResult<T>`, `CrmQueryListResult<T>`. |
| `src/lib/agents/shared/crm-query-tools/contacts.ts` | CREATE | W2 | `makeContactQueryTools(ctx)` → `getContactByPhone`. |
| `src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` | CREATE | W2 | Unit tests with mocked domain. |
| `src/lib/agents/shared/crm-query-tools/orders.ts` | CREATE | W3 | `makeOrderQueryTools(ctx)` → `getLastOrderByPhone`, `getOrdersByPhone`, `getActiveOrderByPhone`, `getOrderById`. |
| `src/lib/agents/shared/crm-query-tools/helpers.ts` | CREATE | W3 | `findActiveOrderForContact`, duplicates resolution helper. |
| `src/lib/agents/shared/crm-query-tools/__tests__/orders.test.ts` | CREATE | W3 | Unit tests for the 4 order tools. |
| `src/lib/agents/shared/crm-query-tools/__tests__/helpers.test.ts` | CREATE | W3 | Unit tests for filter/sort helpers. |
| `src/app/(dashboard)/agentes/layout.tsx` | EDIT | W4 | Add tab `{ href: '/agentes/crm-tools', label: 'Herramientas CRM', icon: Wrench }`. |
| `src/app/(dashboard)/agentes/crm-tools/page.tsx` | CREATE | W4 | Server Component, reads config + pipelines. |
| `src/app/(dashboard)/agentes/crm-tools/_actions.ts` | CREATE | W4 | `saveCrmQueryToolsConfigAction` server action. |
| `src/app/(dashboard)/agentes/crm-tools/_components/ConfigEditor.tsx` | CREATE | W4 | Client Component with `MultiSelect` + pipeline picker + Save button. |
| `src/__tests__/integration/crm-query-tools/cross-workspace.test.ts` | CREATE | W5 | Verifies workspace isolation under same phone. |
| `src/__tests__/integration/crm-query-tools/config-driven.test.ts` | CREATE | W5 | Seeds config, calls tool, asserts active stages respected. |
| `src/__tests__/integration/crm-query-tools/duplicates.test.ts` | CREATE | W5 | 2+ contacts same phone, asserts D-08 flags. |
| `e2e/crm-query-tools.spec.ts` | CREATE | W5 | Full UI ↔ DB ↔ tool path. |
| `src/app/api/test/crm-query-tools/runner/route.ts` | CREATE (env-gated) | W5 | Test-only endpoint to invoke tools from Playwright. Gate behind `NODE_ENV !== 'production'` + a header secret. |
| `.planning/standalone/crm-query-tools/INTEGRATION-HANDOFF.md` | CREATE | W6 | Full handoff doc per D-26. |
| `.claude/skills/crm-query-tools.md` | CREATE | W6 | Project skill discoverable doc. |
| `CLAUDE.md` | EDIT | W6 | Add `Module Scope: crm-query-tools` section per D-06 — list PUEDE / NO PUEDE following `agent-scope.md` style. |
| `LEARNINGS.md` (in standalone dir) | CREATE | W6 | Bug log + patterns. |

**Total estimated:** ~28 file changes across 7 waves.

---

## Open Questions for Planner

These are areas where the user explicitly delegated decisions. Recommended choices below; planner should confirm or pivot before writing plans.

1. **UI slug under `/agentes`** — RECOMMENDED: `crm-tools` (short, matches the "Herramientas CRM" label, parallel to existing `routing`). Alternatives `configuracion-tools` (verbose), `herramientas` (too generic). `[ASSUMED]`

2. **DB schema** — RECOMMENDED: **two dedicated tables** (`crm_query_tools_config` + `crm_query_tools_active_stages`) with FK `ON DELETE CASCADE` on stages junction, `ON DELETE SET NULL` on `pipeline_id`. Rationale: per-stage FK behavior, mirrors `carrier_configs` pattern. Alternatives (JSONB on `workspaces.settings`, columns on `workspace_agent_config`) lose FK guarantees. `[VERIFIED: codebase pattern carrier_configs at 20260224000000_guide_gen_config.sql]`

3. **Module file structure** — RECOMMENDED: **grouped by entity** — `contacts.ts` (1 tool), `orders.ts` (4 tools), `helpers.ts`, `types.ts`, `index.ts`. Rationale: matches crm-reader convention (`tools/contacts.ts`, `tools/orders.ts`, etc.). One file per tool produces 5+ near-empty files. `[VERIFIED: src/lib/agents/crm-reader/tools/]`

4. **Event suffix names** — RECOMMENDED: `crm_query_invoked` (start), `crm_query_completed` (any success status incl. `not_found`), `crm_query_failed` (error path). Rationale: parallels `crm_writer_propose_emitted` / `crm_writer_confirm_emitted` naming density. Avoid `crm_query_started` (confused with timer events). `[ASSUMED — D-23 explicitly delegated]`

5. **Project skill name** — RECOMMENDED: `crm-query-tools` (default per CONTEXT). Place at `.claude/skills/crm-query-tools.md` if that directory exists, else `.claude/rules/crm-query-tools.md` (verify location convention in this repo). `[ASSUMED — verify .claude/skills exists at planning time]`

6. **Wave 0 scope** — RECOMMENDED: bootstrap `@playwright/test` PLUS create the test-runner API endpoint stub PLUS migrate the existing test pattern. This is non-trivial; plan ~1 full plan for it. Alternative: defer Playwright to a follow-up standalone — but D-24 locks E2E for THIS standalone, so must be in scope.

7. **Naming `not_found` vs `not_found_in_workspace`** — RECOMMENDED: use **`not_found`** for crm-query-tools (simpler — workspace is implicit). Document divergence in `INTEGRATION-HANDOFF.md`. crm-reader's variant exists for cross-workspace evaluation; the tools never return cross-workspace by design. `[ASSUMED]`

8. **Config cache TTL** — RECOMMENDED: **no cache** (every tool call reads config fresh). Aligned with D-19 "every call hits domain layer fresh." Adds ~30ms per tool call — acceptable. If hot-loop performance becomes a concern post-ship, add 5-30s LRU in a follow-up. `[ASSUMED — D-19 doesn't explicitly cover config reads, but the spirit applies]`

9. **`is_closed` column behavior** — RECOMMENDED: **ignore it entirely**. Tools never read `pipeline_stages.is_closed`. Active-stage filtering is 100% config-driven. Document in `INTEGRATION-HANDOFF.md` that future migrations could populate the config from `is_closed` as a one-time seed convenience, but this standalone seeds the config to **empty** (operator must configure via UI before tools work). `[VERIFIED: D-11 + Pitfall 8]`

10. **Empty config behavior** — **LOCKED 2026-04-29 by user (D-27)**: when no active stages are configured for a workspace, `getActiveOrderByPhone` returns `{ status: 'config_not_set', contact: ContactDetail }`. NUEVO status — distinto de `no_active_order` (que significa "config existe pero ningún pedido del contacto está en stages activos"). Razón: el agente puede distinguir "operador necesita configurar" vs "cliente sin pedido activo" y escalar/guiar diferente. Estructura: emite `pipeline_decision:crm_query_failed` con `error.code='config_not_set'` o `pipeline_decision:crm_query_completed` con status (planner decide en wave 3).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework (unit + integration) | Vitest `^1.6.1` |
| Framework (E2E) | `@playwright/test` (NEW — Wave 0) |
| Vitest config | `vitest.config.ts` (existing) |
| Playwright config | `playwright.config.ts` (NEW — Wave 0) |
| Quick run command (unit only) | `npm run test -- src/lib/agents/shared/crm-query-tools` |
| Full suite command | `npm run test && npm run test:e2e` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-05 | Workspace isolation via ctx.workspaceId | integration | `npm run test -- src/__tests__/integration/crm-query-tools/cross-workspace` | ❌ Wave 5 |
| D-07 | Typed result discriminated union (not_found, error) | unit | `npm run test -- src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` | ❌ Wave 2 |
| D-08 | 2+ contacts same phone → most recent + duplicates flag | unit + integration | `npm run test -- duplicates.test` | ❌ Wave 2 / W5 |
| D-09 | Phone normalization to E.164 + invalid_phone error | unit | `npm run test -- src/lib/agents/shared/crm-query-tools/__tests__/contacts.test.ts` | ❌ Wave 2 |
| D-10 | not_found vs no_orders distinction | unit | `npm run test -- contacts.test orders.test` | ❌ Wave 2-3 |
| D-11/D-13 | Config-driven active stages (UUID) | integration | `npm run test -- config-driven.test` | ❌ Wave 5 |
| D-13 (FK) | Stage deleted → cleared from config | integration | `npm run test -- config-driven.test` | ❌ Wave 5 |
| D-15 | Multi-active → newest + other_active_orders_count | unit | `npm run test -- helpers.test` | ❌ Wave 3 |
| D-16 | Pipeline scope override via param | unit | `npm run test -- helpers.test` | ❌ Wave 3 |
| D-17 | no_active_order + last_terminal_order | unit | `npm run test -- helpers.test orders.test` | ❌ Wave 3 |
| D-19 | Fresh DB query every call (no cache) | unit | mock domain, assert called once per invocation | ❌ Wave 2-3 |
| D-23 | pipeline_decision events emitted | unit | mock collector, assert recordEvent called with correct labels | ❌ Wave 2-3 |
| D-24 | UI ↔ DB ↔ tool E2E | E2E | `npm run test:e2e` | ❌ Wave 5 |

### Sampling Rate

- **Per task commit:** `npm run test -- src/lib/agents/shared/crm-query-tools` (unit only — fast, ~5s)
- **Per wave merge:** `npm run test` (full Vitest suite incl. existing) + `npm run test:e2e` if UI/E2E touched
- **Phase gate:** Both green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `@playwright/test` not installed (`package.json:75` has `playwright` only — wrong package)
- [ ] No `playwright.config.ts`
- [ ] No `e2e/` directory
- [ ] No `e2e/fixtures/auth.ts` (Supabase test session helper)
- [ ] No `e2e/fixtures/seed.ts` (workspace seeding)
- [ ] No `npm run test:e2e` script in `package.json`
- [ ] No test-helper API endpoint to invoke tools from Playwright (`src/app/api/test/crm-query-tools/runner/route.ts`)
- [ ] Vitest config may need `exclude: ['e2e/**']` to not pick up Playwright specs (verify pattern doesn't already exclude)

---

## Sources

### Primary (HIGH confidence — verified in codebase)

- `src/lib/agents/crm-reader/types.ts:50-58` — `ToolLookupResult<T>`, `ToolListResult<T>` types
- `src/lib/agents/crm-reader/tools/contacts.ts:1-77` — AI SDK v6 tool pattern with domain layer + status discrimination
- `src/lib/agents/crm-reader/tools/orders.ts:1-73` — Same pattern for order tools
- `src/lib/agents/crm-reader/tools/index.ts:17-24` — Aggregator factory pattern
- `src/lib/domain/contacts.ts:519-580, 586-658` — `searchContacts` + `getContactById` contracts
- `src/lib/domain/orders.ts:1670-1804` — `listOrders` + `getOrderById` contracts (note `OrderDetail` missing shipping fields, line 1736)
- `src/lib/domain/pipelines.ts:42-130` — `listPipelines`, `listStages` for UI dropdowns
- `src/lib/utils/phone.ts:37-87` — `normalizePhone(input): string | null` (E.164)
- `src/lib/observability/index.ts:32` — `getCollector` export
- `src/lib/observability/collector.ts:153-171` — `recordEvent` signature
- `src/lib/observability/types.ts:55-79` — `EventCategory` includes `pipeline_decision`
- `src/lib/agents/engine-adapters/production/crm-writer-adapter.ts:172-178` — Canonical `recordEvent('pipeline_decision', label, payload)` example
- `src/app/(dashboard)/agentes/layout.tsx:8-13` — Tab structure (Dashboard, Router, Auditoria, Configuracion)
- `src/app/(dashboard)/agentes/routing/page.tsx:1-156` — Server Component pattern with `getActiveWorkspaceId`
- `src/app/(dashboard)/agentes/routing/_actions.ts:1-133` — Server actions with `revalidatePath`
- `src/app/(dashboard)/agentes/routing/editor/_components/MultiSelect.tsx:1-136` — Reusable multi-select with grouped options
- `supabase/migrations/20260129000003_orders_foundation.sql:75` — `pipeline_stages` FK pattern (`REFERENCES pipeline_stages(id) ON DELETE RESTRICT`) — used in `orders.stage_id`
- `supabase/migrations/20260224000000_guide_gen_config.sql:18-26` — `ON DELETE SET NULL` pattern for stage refs in workspace-scoped config
- `supabase/migrations/20260209000000_agent_production.sql:11-39` — RLS policies for workspace-scoped config tables
- `supabase/migrations/20260420000443_platform_config.sql:30-37` — Critical GRANTs LEARNING (must include in every new table)
- `supabase/migrations/20260306000000_workspace_settings_column.sql:1-5` — `workspaces.settings JSONB` exists (alternative considered but not chosen)
- `vitest.config.ts:1-26` — Vitest config (existing, no changes needed)
- `package.json:10,93-109` — Test scripts + devDeps (Playwright NOT in devDeps — gap)
- `src/__tests__/integration/crm-bots/reader.test.ts:1-80` — Integration test pattern (env-gated, uses real Supabase)
- `src/lib/agents/somnio-recompra/__tests__/transitions.test.ts:1-50` — Vitest test pattern
- `src/lib/agents/somnio-pw-confirmation/__tests__/crm-writer-adapter.test.ts:1-80` — Vitest mock pattern (`vi.hoisted` + `vi.mock`)
- `src/lib/domain/types.ts:15-27` — `DomainContext` shape
- `src/lib/agents/somnio-pw-confirmation/state.ts:48-62` — `ActiveOrderPayload` shape (target for D-18 alignment)
- `src/inngest/functions/pw-confirmation-preload-and-invoke.ts:118-150` — `extractActiveOrderJson` (legacy, do not modify)
- `src/lib/audit/logger.ts:86` — `createModuleLogger` factory
- `CLAUDE.md` (read in `<system-reminder>`) — Reglas 0/1/2/3/5/6 + Module Scope conventions
- `.claude/rules/agent-scope.md` (read via system-reminder) — PUEDE/NO PUEDE template

### Secondary (MEDIUM confidence — pattern inferred but cross-referenced)

- AI SDK v6 `tool()` API — used by all crm-reader/crm-writer tools (`crm-reader/tools/contacts.ts:31`); cross-verified with package.json `ai ^6.0.86`
- `pipeline_stages.is_closed` semantics — `getActiveOrderForContact` at `orders.ts:1843` uses it, confirming the column exists and means "terminal"
- Project skill location `.claude/skills/` — convention only; verify with `ls .claude/skills/` at plan time

### Tertiary (LOW confidence — flag for validation)

- Recommended Playwright version (pin to `1.58.x` to match existing `playwright` dep) — research did not run `npm view @playwright/test version` due to potential network reliance; planner should verify at plan-time
- Whether `e2e/` is the conventional Playwright dir for Next.js projects — convention varies; `e2e/` is the most common, but the project may prefer `tests/e2e/`. `[ASSUMED]`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | UI slug `crm-tools` is acceptable to user | Open Q1 | UI route renamed in plan — single search-replace, low cost |
| A2 | Two dedicated tables (`crm_query_tools_config` + junction) is acceptable schema | Open Q2 | Migration redesign — reverting to JSONB possible if user prefers, but loses FK |
| A3 | Module file grouping by entity matches user's mental model | Open Q3 | File restructure — single Wave 2-3 reorganization |
| A4 | Event labels `crm_query_invoked` / `crm_query_completed` / `crm_query_failed` | Open Q4 | Rename across emitters — easy refactor |
| A5 | `not_found` (not `not_found_in_workspace`) for tool result | Pattern 3 | Slight divergence from crm-reader; planner can choose to align |
| A6 | No cache for config reads (every tool call hits DB) | Open Q8, Pitfall 5 | Performance acceptable per D-19 spirit; can add LRU later |
| A7 | ~~Empty active-stage config → return `no_active_order` (not error)~~ — **LOCKED D-27**: returns `config_not_set` (distinct status) | Open Q10 | Resolved 2026-04-29 by user |
| A8 | `@playwright/test` matching `1.58.x` is the right pin | Standard Stack | Version mismatch could need update; verify at plan time |
| A9 | `e2e/` is the right directory name | File Map | Convention only; can move to `tests/e2e/` |
| A10 | Project skill goes in `.claude/skills/` (not `.claude/rules/`) | Open Q5 | File location adjustment |
| A11 | Pipeline scope `null` means "all pipelines" not "no pipelines" | Architecture Patterns | D-16 specifies default = all, so null is "all" — confident |
| A12 | Test-only API runner endpoint is acceptable to ship in production with env+secret gating | File Map (Wave 5) | Could be flagged as security concern by user — alternative is to invoke tool via direct import in a Node.js test runner Playwright spawns |

**If user confirms the OPEN QUESTIONS up-front, all of A1-A10 collapse to verified.**

---

## Open Questions

1. **`createCrmQueryTools(ctx, options?)` — what goes in `options`?**
   - What we know: signature documented in CONTEXT D-04 with `options?` placeholder.
   - What's unclear: nothing currently consumed. Could be future hook for `pipelineId` override or feature flags.
   - Recommendation: omit `options` from initial signature. Add when first concrete need arises (probably in follow-up integration standalones). YAGNI.

2. **Workspace settings JSONB vs dedicated table — final call**
   - What we know: codebase has both patterns (`workspaces.settings` JSONB at `20260306000000_workspace_settings_column.sql:5`; `workspace_agent_config` dedicated table at `20260209000000_agent_production.sql:11`). Recent additions (`platform_config`, `crm_bot_actions`) trend toward dedicated tables.
   - What's unclear: user preference.
   - Recommendation: dedicated tables (Open Q2). Aligned with FK requirements.

3. **Slug must be valid in UI strict-mode**
   - What we know: existing slugs are kebab-case (`routing`, `routing/audit`, `routing/editor`, `config`).
   - What's unclear: any reserved names?
   - Recommendation: `crm-tools` is unambiguous and consistent.

4. **Pipeline-scoped config: should the operator be able to define DIFFERENT active stages PER pipeline?**
   - What we know: D-12 says "una config compartida por workspace." D-16 has pipeline scope as a single optional UUID.
   - What's unclear: if pipeline_id is set in config, do active_stage_ids implicitly belong to THAT pipeline (filtered)? Or are they cross-pipeline?
   - Recommendation: stages can come from ANY pipeline (cross-pipeline OK). When pipeline scope is set, the tool filters orders by `pipeline_id = X` AND `stage_id IN (active_stages)`. The two are independent dimensions. Make this explicit in `INTEGRATION-HANDOFF.md`.

5. **Test seeding strategy for E2E**
   - What we know: existing integration tests use `TEST_WORKSPACE_ID` + `TEST_API_KEY` env vars (see `crm-bots/reader.test.ts:14-15`).
   - What's unclear: whether to reuse this fixture or create a fresh test workspace per E2E run.
   - Recommendation: Reuse existing test workspace. Tests must be idempotent — clean up created data in `afterEach`. If parallel runs hit conflicts, switch to ephemeral workspaces per run.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Vitest | unit + integration tests | ✓ | `^1.6.1` | — |
| `playwright` (library) | unrelated (Railway robots) | ✓ | `^1.58.2` | — |
| `@playwright/test` | E2E tests (D-24) | ✗ | — | Install in Wave 0 |
| Node.js | runtime | ✓ | (per Vercel) | — |
| Supabase CLI / direct migration apply | DB migration (Regla 5) | requires user manual apply | — | none — Regla 5 mandates user apply step |
| Local Supabase test DB | integration tests | maybe | — | use prod test workspace + env-gated tests |
| Local dev server (`npm run dev` on `:3020`) | E2E tests | ✓ | port 3020 | — |
| Browser (Chromium) | Playwright runtime | install via `npx playwright install chromium` | — | Wave 0 install step |

**Missing dependencies with no fallback:** none — D-24 (E2E Playwright) blocks until Wave 0 install completes.

**Missing dependencies with fallback:** none.

---

## Security Domain

> Project enables `security_enforcement` implicitly (no `.planning/config.json` opt-out detected).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Server actions use `getActiveWorkspaceId()` (validates session); tool execution uses `ctx.workspaceId` set by upstream agent (already auth'd) |
| V3 Session Management | partial | Inherits Next.js + Supabase session — no new session logic in this standalone |
| V4 Access Control | yes | RLS on new tables: `is_workspace_member` for SELECT, `is_workspace_admin` for INSERT/UPDATE (mirrors `workspace_agent_config` at `20260209000000_agent_production.sql:24-39`) |
| V5 Input Validation | yes | Zod schemas on every tool input (phone string min length 7); migration defines column types (UUID, TIMESTAMPTZ); domain layer wraps DB errors |
| V6 Cryptography | n/a | No crypto operations; phone is not PII at the level of secret material |
| V8 Data Protection | yes | Phone numbers in observability events MUST be redacted to last-4 digits (see Pattern 5 example — `phoneSuffix: e164.slice(-4)`) |
| V13 API & Web Service | yes | Test-only runner endpoint MUST be gated by `process.env.NODE_ENV !== 'production'` AND a header secret. Reject in prod. |

### Known Threat Patterns for {Next.js + Supabase + AI tools}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-workspace data leak via shared phone | Information Disclosure | Domain layer filters by `ctx.workspaceId`; integration test verifies isolation (Pitfall 1) |
| Test-runner endpoint left enabled in prod | Elevation of Privilege | NODE_ENV gate + header secret + return 404 in prod |
| Phone number in logs as PII | Information Disclosure | Log only last-4 digits in observability events; full E.164 only in `logger.error` payloads which are scrubbed |
| Stage UUID enumeration | Information Disclosure | RLS policy on `crm_query_tools_active_stages` requires workspace membership |
| Dead UUID in config (stage deleted) | Tampering / Stale Data | FK `ON DELETE CASCADE` on junction prevents stale rows |
| Concurrent UI save race | Tampering | Server action uses `revalidatePath` + simple delete-then-insert junction (last-write-wins acceptable for admin UI; full-blown optimistic concurrency control deferred to backlog) |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inngest async preload of CRM context (recompra-preload-context.ts) | On-demand deterministic tools per turn | THIS standalone (infrastructure only); migration of Somnio agents in follow-ups | Reduces extra LLM call per turn; eliminates polling/race; eliminates stale-context bugs |
| LLM intermediate (crm-reader agent) for context synthesis | Direct tools calling domain | THIS standalone | Faster, cheaper, deterministic; crm-reader stays for open-ended cases (D-01) |
| Hardcoded "active stages" via name-match (`%entregad%`) | Config-driven UUID list | THIS standalone | Per-workspace customization; rename-resilient (D-13) |

**Deprecated/outdated (NOT in scope of THIS standalone — follow-ups):**
- `_v3:crm_context`, `_v3:crm_context_status`, `_v3:active_order` keys in `session_state.datos_capturados` — to be cleaned up in `crm-query-tools-recompra-integration` and `crm-query-tools-pw-confirmation-integration` standalones
- `recompra-preload-context.ts` Inngest function — to be deleted in follow-up
- `pw-confirmation-preload-and-invoke.ts` step 1 (preload) — to be simplified in follow-up

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every library and helper located with file:line citations.
- Architecture patterns: HIGH — mirrors established crm-reader, crm-writer-adapter, routing UI patterns 1:1.
- DB schema decision: HIGH — `carrier_configs` precedent locks the pattern.
- Common pitfalls: HIGH — most pitfalls are direct quotes from codebase LEARNINGS or visible bugs.
- Playwright bootstrap path: MEDIUM — `@playwright/test` install should be straightforward, but specific version/config is `[ASSUMED]` until verified.
- Open Q decisions (slug, file structure, event names): MEDIUM — recommended choices have rationale, but user delegated explicitly.
- Empty-config behavior (Open Q10): LOW — needs user confirmation before plan-time.

**Research date:** 2026-04-29
**Valid until:** ~2026-05-29 (30 days, stable codebase area; re-verify if AI SDK v7 lands or domain layer types change)
