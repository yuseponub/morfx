# Phase 44: CRM Bots (Read + Write) — Pattern Map

**Mapped:** 2026-04-18
**Files analyzed:** 35 new / 3 modified
**Analogs found:** 33 / 35 (2 files have NO direct analog — two-step flow, email alerts)

---

## File Classification

### New files — Agent scaffolding (mirrors `src/lib/agents/godentist/`)

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/lib/agents/crm-reader/index.ts` | module entry / barrel | request-response | `src/lib/agents/godentist/index.ts` | exact (folder shape) |
| `src/lib/agents/crm-reader/config.ts` | config | static | `src/lib/agents/godentist/config.ts` | exact |
| `src/lib/agents/crm-reader/system-prompt.ts` | prompt string | static | `src/lib/builder/system-prompt.ts` | role-match (AI SDK v6 builder) |
| `src/lib/agents/crm-reader/types.ts` | types | N/A | `src/lib/agents/godentist/types.ts` | exact |
| `src/lib/agents/crm-reader/tools/index.ts` | tool registry aggregator | request-response | `src/lib/builder/tools.ts` (`createBuilderTools`) | exact (AI SDK v6 tool registry) |
| `src/lib/agents/crm-reader/tools/contacts.ts` | tool handler | CRUD-read | `src/lib/builder/tools.ts` (listPipelines, listTags inside) | exact |
| `src/lib/agents/crm-reader/tools/orders.ts` | tool handler | CRUD-read | `src/lib/builder/tools.ts` | exact |
| `src/lib/agents/crm-reader/tools/pipelines.ts` | tool handler | CRUD-read | `src/lib/builder/tools.ts` (listPipelines) | exact |
| `src/lib/agents/crm-reader/tools/tags.ts` | tool handler | CRUD-read | `src/lib/builder/tools.ts` (listTags) | exact |
| `src/lib/agents/crm-writer/index.ts` | module entry / barrel | request-response | `src/lib/agents/godentist/index.ts` | exact |
| `src/lib/agents/crm-writer/config.ts` | config | static | `src/lib/agents/godentist/config.ts` | exact |
| `src/lib/agents/crm-writer/system-prompt.ts` | prompt string | static | `src/lib/builder/system-prompt.ts` | role-match |
| `src/lib/agents/crm-writer/types.ts` | types | N/A | `src/lib/agents/godentist/types.ts` | role-match |
| `src/lib/agents/crm-writer/tools/index.ts` | tool registry aggregator | request-response | `src/lib/builder/tools.ts` | exact |
| `src/lib/agents/crm-writer/tools/contacts.ts` | tool handler (propose-only) | CRUD-write | `src/lib/builder/tools.ts` + `src/lib/domain/contacts.ts` | partial (no two-step precedent) |
| `src/lib/agents/crm-writer/tools/orders.ts` | tool handler (propose-only) | CRUD-write | same as above | partial |
| `src/lib/agents/crm-writer/tools/notes.ts` | tool handler (propose-only) | CRUD-write | same as above | partial |
| `src/lib/agents/crm-writer/tools/tasks.ts` | tool handler (propose-only) | CRUD-write | same as above | partial |
| `src/lib/agents/crm-writer/two-step.ts` | service (propose/confirm lifecycle) | event-driven / state-machine | **NO direct analog** — closest: `src/lib/domain/sms.ts` RPC atomic pattern | weak |
| `src/lib/agents/_shared/alerts.ts` | service (email) | fire-and-forget | **NO in-repo precedent** (zero email infra) | none |

### New files — HTTP routes

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/app/api/v1/crm-bots/reader/route.ts` | route handler | request-response | `src/app/api/v1/tools/[toolName]/route.ts` | exact |
| `src/app/api/v1/crm-bots/writer/propose/route.ts` | route handler | request-response | `src/app/api/v1/tools/[toolName]/route.ts` | exact |
| `src/app/api/v1/crm-bots/writer/confirm/route.ts` | route handler | request-response | `src/app/api/v1/tools/[toolName]/route.ts` | exact |

### New files — Inngest cron

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/inngest/functions/crm-bot-expire-proposals.ts` | inngest cron | batch transform | `src/inngest/functions/close-stale-sessions.ts` + `observability-purge.ts` | exact (cron + RPC pattern) |

### New files — Migration

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `supabase/migrations/YYYYMMDDHHMMSS_crm_bot_actions.sql` | schema migration | N/A | `supabase/migrations/20260408000000_observability_schema.sql` | exact (additive, timezone('America/Bogota', now()), workspace_id FK) |

### Modified files

| File | Role | Change Type | Closest Analog / Existing Shape |
|------|------|-------------|---------------------------------|
| `middleware.ts` (line 64) | middleware | one-line path extension | existing `if (pathname.startsWith('/api/v1/tools'))` block |
| `src/lib/tools/types.ts` (line 77) | types | type extension — `ToolModule` union | existing `'crm' \| 'whatsapp' \| 'system'` |
| `src/lib/tools/rate-limiter.ts` (lines 29-33) | rate limiter config | add DEFAULTS entry for `'crm-bot'` | existing DEFAULTS record for crm/whatsapp/system |
| `src/app/api/inngest/route.ts` (line 53+) | inngest serve | register new cron | existing pattern of adding cron to `functions` array |
| `src/lib/observability/types.ts` (line 18) | types | extend `AgentId` union with `'crm-reader' \| 'crm-writer'` | existing union of 4 agent ids |

### New domain layer functions (may need to ADD if not present)

| Needed Function | Exists? | File | Notes |
|-----------------|---------|------|-------|
| `createContact` | YES | `src/lib/domain/contacts.ts:95` | reuse verbatim |
| `updateContact` | YES | `src/lib/domain/contacts.ts:189` | reuse verbatim |
| `archiveContact` | NO — only `deleteContact` exists (`:334`) | add `archiveContact` (soft delete) | |
| `searchContacts` (read) | NO in domain | add new `src/lib/domain/contacts.ts` read funcs (writer domain has no reads) | app action `src/app/actions/contacts.ts:190` exists — extract to domain |
| `getContactById` (read) | NO in domain | add new | |
| `createOrder` | YES | `src/lib/domain/orders.ts:184` | reuse |
| `updateOrder` | YES | `src/lib/domain/orders.ts:372` | reuse |
| `archiveOrder` / move-to-closed-stage | NO — only `deleteOrder` exists (`:672`) | add or reuse `updateOrder` with stage change | |
| `listOrders` / `getOrderById` | PARTIAL — `getOrdersByStage` exists (`:1244`) | add `listOrders`, `getOrderById` read funcs | |
| `listPipelines` / `listStages` | NO in domain | currently only referenced directly by `src/lib/builder/tools.ts` | extract to domain |
| `listTags` | NO in domain | direct supabase query in `builder/tools.ts:242-265` | extract to domain |
| `createNote` | YES | `src/lib/domain/notes.ts:123` | reuse |
| `updateNote` | YES | `src/lib/domain/notes.ts:182` | reuse |
| `archiveNote` | NO — only `deleteNote` (`:233`) | add | |
| `createTask` | YES | `src/lib/domain/tasks.ts:86` | reuse |
| `updateTask` | YES | `src/lib/domain/tasks.ts:170` | reuse |
| `completeTask` | USE `updateTask` with `status: 'completed'` (see `tasks.ts:170-180`) | reuse | |

---

## Pattern Assignments

### `src/lib/agents/crm-reader/tools/contacts.ts` (tool handler, CRUD-read)

**Analog:** `src/lib/builder/tools.ts` (lines 179-237 — `createBuilderTools` factory + `listPipelines` tool)

**Imports pattern** (from `builder/tools.ts` lines 1-20):
```typescript
import { z } from 'zod'
import { tool } from 'ai'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BuilderToolContext } from '@/lib/builder/types'
```

**Tool factory pattern** (from `builder/tools.ts` lines 179-190):
```typescript
export function createBuilderTools(ctx: BuilderToolContext) {
  return {
    listPipelines: tool({
      description: 'Lista todos los pipelines del workspace con sus etapas. Usar cuando el usuario mencione pipelines, etapas, o stages.',
      inputSchema: z.object({}),
      execute: async (): Promise<{ pipelines: PipelineWithStages[] } | { error: string }> => {
        try {
          const supabase = createAdminClient()
          // ... workspace-scoped query
        } catch (err) { return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` } }
      },
    }),
    // ... more tools
  }
}
```

**Workspace-scoped query pattern** (lines 192-213):
```typescript
const { data: pipelines, error: pError } = await supabase
  .from('pipelines')
  .select('id, name')
  .eq('workspace_id', ctx.workspaceId)     // MANDATORY per CLAUDE.md Regla 3
  .order('created_at')
```

**Error return shape** (lines 233-235):
```typescript
return { error: `Error inesperado: ${err instanceof Error ? err.message : String(err)}` }
```

**Reader-specific override (from RESEARCH.md Pitfall 5 mitigation):**
Tool return shape must discriminate `{status: 'found', data}` | `{status: 'not_found_in_workspace'}` to avoid silent cross-workspace confusion.

---

### `src/lib/agents/crm-writer/tools/contacts.ts` (tool handler, CRUD-write, propose-only)

**Analog:** `src/lib/builder/tools.ts` (same factory shape) + two-step wrapper

**Critical delta from reader:** Tool `.execute` does NOT mutate. It calls `proposeAction(ctx, {...})` which only inserts a `crm_bot_actions` row with `status='proposed'` and returns `{action_id, preview}`. See `two-step.ts` below.

**Pattern:**
```typescript
import { tool } from 'ai'
import { z } from 'zod'
import { proposeAction } from '../two-step'
import type { WriterContext } from '../types'

export const makeContactWriteTools = (ctx: WriterContext) => ({
  createContact: tool({
    description: 'Crea un nuevo contacto en el CRM. SIEMPRE usar two-step: devuelve preview, NO ejecuta hasta confirm.',
    inputSchema: z.object({
      name: z.string().min(1),
      phone: z.string().optional(),
      email: z.string().email().optional(),
      tagIds: z.array(z.string().uuid()).optional(),
    }),
    execute: async (input) => {
      return proposeAction(ctx, {
        tool: 'createContact',
        input,
        preview: { action: 'create', entity: 'contact', before: null, after: input },
      })
    },
  }),
})
```

---

### `src/lib/agents/crm-writer/two-step.ts` (service, event-driven, idempotent state machine)

**Analog:** Closest is `src/lib/domain/sms.ts` RPC atomic pattern (`insert_and_deduct_sms_message` — see migration `20260418011321_sms_atomic_rpc.sql`), which uses Postgres as the concurrency primitive. No direct two-step flow precedent exists.

**Key primitives to copy:**

**createAdminClient + workspace filter** (from any domain file, e.g. `src/lib/domain/contacts.ts` lines 95-130):
```typescript
import { createAdminClient } from '@/lib/supabase/admin'
const supabase = createAdminClient()
// Every query includes .eq('workspace_id', ctx.workspaceId)
```

**`crypto.randomUUID()`** for action_id — Edge-safe, Node 20+ native, already used across repo.

**Optimistic UPDATE for idempotency** — NEW pattern for this repo, but stock Postgres:
```typescript
const { data, error } = await admin
  .from('crm_bot_actions')
  .update({ status: 'executed', output, executed_at: timezone('America/Bogota', now()) })
  .eq('id', actionId)
  .eq('status', 'proposed')  // second caller sees 0 rows = already_executed
  .select()
  .maybeSingle()
```

**Dispatch pattern — calling domain layer:**
```typescript
// The confirm handler reads row.tool_name + row.input_params and dispatches to domain:
const ctx: DomainContext = { workspaceId, source: 'tool-handler' }
const result = await createContact(ctx, row.input_params as CreateContactParams)
// result is DomainResult<T> — discriminated union { success: true, data } | { success: false, error }
```

---

### `src/app/api/v1/crm-bots/reader/route.ts` (route handler, request-response)

**Analog:** `src/app/api/v1/tools/[toolName]/route.ts` (lines 63-219)

**Imports pattern** (lines 18-28):
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { rateLimiter } from '@/lib/tools/rate-limiter'
import { runWithCollector } from '@/lib/observability'
import { ObservabilityCollector } from '@/lib/observability'
```

**Header extraction pattern — ONLY read workspace_id from headers** (lines 101-110, already set by middleware):
```typescript
const workspaceId = request.headers.get('x-workspace-id')
const apiKeyPrefix = request.headers.get('x-api-key-prefix')

if (!workspaceId) {
  return NextResponse.json(
    { error: 'Missing workspace context', code: 'MISSING_CONTEXT', retryable: false },
    { status: 500 }
  )
}
```

**Kill-switch pattern — read `process.env` INSIDE handler (Pitfall 2 in RESEARCH):**
```typescript
// At top of handler, before any work:
if (process.env.CRM_BOT_ENABLED === 'false') {
  return NextResponse.json({ error: 'disabled', code: 'KILL_SWITCH' }, { status: 503 })
}
```

**Rate limit pattern** (new — reuse limiter from `src/lib/tools/rate-limiter.ts`):
```typescript
const rl = rateLimiter.check(workspaceId, 'crm-bot')
if (!rl.allowed) {
  return NextResponse.json(
    { error: 'rate_limited', retry_after_ms: rl.resetMs },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
  )
}
```

**Error mapping pattern** (lines 151-219 — 429 with Retry-After, 504, 400, 403, 500):
```typescript
if (error instanceof RateLimitError) {
  return NextResponse.json(
    { error: error.message, code: 'RATE_LIMITED', retryable: true, retry_after_ms: error.resetMs },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(error.resetMs / 1000)) } }
  )
}
// ... TimeoutError -> 504, ToolValidationError -> 400, PermissionError -> 403, else 500
```

---

### `src/inngest/functions/crm-bot-expire-proposals.ts` (cron, batch)

**Analog:** `src/inngest/functions/close-stale-sessions.ts` (verbatim — 54 lines)

**Full pattern** (lines 10-54):
```typescript
import { inngest } from '../client'
import { createAdminClient } from '@/lib/supabase/admin'
import { createModuleLogger } from '@/lib/audit/logger'

const logger = createModuleLogger('crm-bot-expire-proposals')

export const crmBotExpireProposalsCron = inngest.createFunction(
  {
    id: 'crm-bot-expire-proposals',
    name: 'Expire CRM Bot Proposals (TTL)',
    retries: 1,
  },
  { cron: 'TZ=America/Bogota */1 * * * *' },  // every 1 min
  async ({ step }) => {
    const result = await step.run('expire-proposed', async () => {
      const supabase = createAdminClient()
      // Per RESEARCH Pitfall 7: 30s grace beyond strict TTL to avoid races with confirm
      const { data, error } = await supabase
        .from('crm_bot_actions')
        .update({ status: 'expired' })
        .eq('status', 'proposed')
        .lt('expires_at', new Date(Date.now() - 30_000).toISOString())
        .select('id')
      if (error) { logger.error({ error }, 'expire failed'); throw error }
      return { expiredCount: data?.length ?? 0 }
    })
    logger.info({ ...result, cronRunAt: new Date().toISOString() }, 'cron complete')
    return result
  }
)
```

**Registration delta in `src/app/api/inngest/route.ts` (line 53+):**
```typescript
// ADD to imports:
import { crmBotExpireProposalsCron } from '@/inngest/functions/crm-bot-expire-proposals'
// ADD to functions array (alongside taskOverdueCron, closeStaleSessionsCron, observabilityPurgeCron):
crmBotExpireProposalsCron,
```

---

### `supabase/migrations/YYYYMMDDHHMMSS_crm_bot_actions.sql` (schema migration, additive)

**Analog:** `supabase/migrations/20260408000000_observability_schema.sql` (lines 1-40 — header comment + first table)

**Header/preamble pattern** (lines 1-18):
```sql
-- =====================================================================
-- Migration: YYYYMMDDHHMMSS_crm_bot_actions.sql
-- Phase 44: CRM Bots (Read + Write) — Plan NN
-- Date: 2026-04-XX
-- Purpose:
--   Crear tabla crm_bot_actions para persistir el ciclo two-step
--   (propose -> confirm) del crm-writer + audit log de acciones del
--   crm-reader.
--
-- ADDITIVE ONLY: cero ALTER/DROP de tablas existentes.
--
-- REGLA 5: este archivo DEBE aplicarse manualmente en produccion ANTES
-- de que cualquier codigo que lo referencie sea pusheado a Vercel.
-- =====================================================================
```

**Table pattern with workspace FK + America/Bogota timestamps** (lines 25-38):
```sql
CREATE TABLE crm_bot_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL CHECK (agent_id IN ('crm-reader', 'crm-writer')),
  invoker TEXT,
  tool_name TEXT NOT NULL,
  input_params JSONB NOT NULL,
  preview JSONB,
  output JSONB,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'executed', 'failed', 'expired')),
  error JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('America/Bogota', NOW()),  -- Regla 2
  expires_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);
```

**Index pattern** (mirrors `idx_turns_workspace_agent` in observability schema line 71):
```sql
CREATE INDEX idx_crm_bot_actions_workspace_created ON crm_bot_actions(workspace_id, created_at DESC);
CREATE INDEX idx_crm_bot_actions_proposed_expires ON crm_bot_actions(expires_at) WHERE status = 'proposed';
CREATE INDEX idx_crm_bot_actions_agent_status ON crm_bot_actions(agent_id, status);
```

---

### `src/lib/agents/crm-reader/index.ts` (module entry / barrel)

**Analog:** `src/lib/agents/godentist/index.ts` (18 lines, verbatim shape)

**Full pattern:**
```typescript
/**
 * CRM Reader Agent — Module Entry Point
 *
 * Read-only AI agent exposed as API to other agents (tool providers).
 * Self-registers in the agent registry on import.
 */

import { agentRegistry } from '../registry'
import { crmReaderConfig, CRM_READER_AGENT_ID } from './config'

// Self-register on module import
agentRegistry.register(crmReaderConfig)

// Re-export public API
export { CRM_READER_AGENT_ID } from './config'
export { processMessage } from './crm-reader-agent'
export type { ReaderInput, ReaderOutput } from './types'
```

**NOTE on divergence:** godentist uses a state-machine pipeline (comprehension → state merge → sales-track → response-track). CRM bots do NOT use that shape — they use AI SDK v6 `generateText({ tools })` directly (see `src/app/api/builder/chat/route.ts` lines 129-145 for the reference).

---

### `src/lib/agents/crm-reader/config.ts` (agent config)

**Analog:** `src/lib/agents/godentist/config.ts` (76 lines)

**Pattern** (lines 1-30):
```typescript
import type { AgentConfig } from '../types'
import { CLAUDE_MODELS } from '../types'

export const CRM_READER_AGENT_ID = 'crm-reader'

export const crmReaderConfig: AgentConfig = {
  id: CRM_READER_AGENT_ID,
  name: 'CRM Reader Bot',
  description: 'Agente AI de solo lectura sobre el CRM. Expuesto como API interna para otros agentes. Scope: contactos, pedidos, pipelines, tags.',
  // ... model + tools list + no state machine (CRM bot is stateless)
}
```

---

### `src/lib/agents/crm-reader/system-prompt.ts` (prompt string, static)

**Analog:** `src/lib/builder/system-prompt.ts` — role-match (AI SDK v6 builder uses a `buildSystemPrompt(workspaceId)` factory that returns a string).

**Pattern:**
```typescript
export function buildReaderSystemPrompt(workspaceId: string): string {
  return `Eres el CRM Reader Bot, un agente AI de SOLO LECTURA ...

Tu scope:
- Contactos: buscar, leer, listar tags/custom fields
- Pedidos: listar, leer detalle, ver items
- Pipelines & stages: listar
- Tags: listar y obtener entidades con tag

PROHIBIDO:
- Crear, modificar, o archivar cualquier entidad
- Inventar información — cita el output de tools literalmente
- Cruzar workspaces — tu scope es workspace ${workspaceId}

Si un tool retorna { status: 'not_found_in_workspace' }, reporta explícitamente "no existe en este workspace".
`
}
```

**Writer system prompt must add (per `agent-scope.md`):**
> "NUNCA crees recursos base (tags, pipelines, stages, templates, users). Si un recurso necesario no existe, el tool retornará `{ error: 'resource_not_found', resource_type, suggested_action: 'create manually in UI' }` — reporta ese error al caller sin intentar crear el recurso."

---

### `src/lib/agents/_shared/alerts.ts` (email alerts, fire-and-forget)

**Analog:** NO in-repo precedent (zero email infra). Pattern lifted from RESEARCH.md Pattern 4 + Common Pitfall 8 (deduplication).

**Pattern:**
```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const RECIPIENT = 'joseromerorincon041100@gmail.com'

const lastSent = new Map<string, number>()
const DEDUPE_MS = 15 * 60 * 1000

export async function sendRunawayAlert(ctx: { workspaceId: string; agentId: string; limit: number }) {
  const key = `runaway:${ctx.workspaceId}:${ctx.agentId}`
  const last = lastSent.get(key) ?? 0
  if (Date.now() - last < DEDUPE_MS) return
  lastSent.set(key, Date.now())

  try {
    await resend.emails.send({
      from: 'MorfX Alerts <alerts@morfx.app>',
      to: RECIPIENT,
      subject: `[CRM Bot] Runaway loop suspected — ${ctx.agentId} — workspace ${ctx.workspaceId.slice(0, 8)}`,
      text: `Workspace ${ctx.workspaceId} exceeded ${ctx.limit} calls/min on ${ctx.agentId}.`,
    })
  } catch (err) {
    console.error('[crm-bot-alerts] send failed', err)  // fail-silent
  }
}
```

**Dep install (one-time, in plan Task 0):** `npm install resend --legacy-peer-deps`

---

## Shared Patterns

### Authentication — API key via middleware

**Source:** `middleware.ts` lines 61-91 + `src/lib/auth/api-key.ts` (145 lines)
**Apply to:** All 3 new routes under `/api/v1/crm-bots/*`

**Existing shape in `middleware.ts` lines 62-91:**
```typescript
if (pathname.startsWith('/api/v1/tools')) {
  const authHeader = request.headers.get('authorization')
  const apiKey = extractApiKey(authHeader)

  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing API key', code: 'MISSING_API_KEY' },
      { status: 401 }
    )
  }
  const validation = await validateApiKey(apiKey)
  if (!validation.valid) {
    return NextResponse.json(
      { error: validation.error || 'Invalid API key', code: 'INVALID_API_KEY' },
      { status: 401 }
    )
  }
  const response = NextResponse.next()
  response.headers.set('x-workspace-id', validation.workspaceId!)
  response.headers.set('x-permissions', JSON.stringify(validation.permissions || []))
  response.headers.set('x-api-key-prefix', apiKey.substring(0, 8))
  return response
}
```

**Delta (Phase 44):** Change line 64 from:
```typescript
if (pathname.startsWith('/api/v1/tools')) {
```
to:
```typescript
if (pathname.startsWith('/api/v1/tools') || pathname.startsWith('/api/v1/crm-bots')) {
```

---

### Rate limiting — sliding window

**Source:** `src/lib/tools/rate-limiter.ts` (136 lines — reuse verbatim)
**Apply to:** All 3 new routes (reader, writer/propose, writer/confirm share ONE `'crm-bot'` key namespace — RESEARCH Open Question #1 recommendation)

**Existing shape** (lines 29-33):
```typescript
const DEFAULTS: Record<ToolModule, RateLimitConfig> = {
  crm: { limit: 120, windowMs: 60_000 },
  whatsapp: { limit: 30, windowMs: 60_000 },
  system: { limit: 60, windowMs: 60_000 },
}
```

**Delta (Phase 44):**
1. In `src/lib/tools/types.ts` line 77, extend the union:
```typescript
export type ToolModule = 'crm' | 'whatsapp' | 'system' | 'crm-bot'
```
2. In `src/lib/tools/rate-limiter.ts` line 32, add to DEFAULTS:
```typescript
'crm-bot': { limit: Number(process.env.CRM_BOT_RATE_LIMIT_PER_MIN ?? 50), windowMs: 60_000 },
```

**Usage** (identical to existing — line 72 `check(workspaceId, module)` API):
```typescript
const rl = rateLimiter.check(workspaceId, 'crm-bot')
if (!rl.allowed) { /* 429 */ }
if (rl.remaining / limit < 0.2) { /* approaching-limit alert */ }
```

---

### Domain layer mandate (CLAUDE.md Regla 3 — BLOCKING)

**Source:** `src/lib/domain/*.ts` — every write goes through domain
**Apply to:** ALL writer tool handlers (confirm phase), NEVER write to Supabase directly from a tool

**Existing DomainContext shape** (`src/lib/domain/types.ts` lines 15-21):
```typescript
export interface DomainContext {
  workspaceId: string
  source: string   // 'server-action' | 'tool-handler' | 'automation' | 'webhook' | 'adapter'
  cascadeDepth?: number
}
```

**Existing DomainResult pattern** (`types.ts` lines 30-34):
```typescript
export interface DomainResult<T = void> {
  success: boolean
  data?: T
  error?: string
}
```

**Invocation from writer's `two-step.ts` confirm phase:**
```typescript
import { createContact, type CreateContactParams } from '@/lib/domain/contacts'

const ctx: DomainContext = { workspaceId, source: 'tool-handler' }
const result = await createContact(ctx, input_params as CreateContactParams)
if (!result.success) {
  // mark crm_bot_actions.status='failed' with result.error
}
```

---

### Observability — runWithCollector wrapping every turn

**Source:** `src/inngest/functions/agent-production.ts` lines 106-115 (collector init) + 473 (runWithCollector usage)
**Apply to:** Both reader and writer route handlers — wrap the bot invocation

**Existing init pattern** (agent-production.ts lines 106-115):
```typescript
const collector = isObservabilityEnabled()
  ? new ObservabilityCollector({
      conversationId,
      workspaceId,
      agentId: await resolveAgentIdForWorkspace(workspaceId),
      turnStartedAt: new Date(),
      triggerMessageId: messageId,
      triggerKind: 'user_message',
    })
  : null
```

**Delta for CRM bots:** No conversation → use a fake/synthetic `conversationId` (e.g. the action_id for writer, or a UUID per request for reader). `triggerKind: 'api'` — this value MUST BE ADDED to the `TriggerKind` union in `src/lib/observability/types.ts` line 25:
```typescript
// Existing:
export type TriggerKind = 'user_message' | 'timer' | 'system_event'
// Delta:
export type TriggerKind = 'user_message' | 'timer' | 'system_event' | 'api'
```

Also extend `AgentId` union at line 18:
```typescript
export type AgentId =
  | 'somnio-v3' | 'godentist' | 'somnio-recompra' | 'somnio-v2'
  | 'crm-reader' | 'crm-writer'
```

**Existing wrap pattern** (agent-production.ts line 473):
```typescript
turnResult = await runWithCollector(collector, run)
```

---

### AI SDK v6 tool loop — `generateText` (or `streamText`)

**Source:** `src/app/api/builder/chat/route.ts` lines 129-145
**Apply to:** Both reader's `processMessage()` and writer's `propose()` entry points

**Existing shape:**
```typescript
import { streamText, convertToModelMessages, stepCountIs } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const result = streamText({
  model: anthropic('claude-sonnet-4-20250514'),
  system: systemPrompt,
  messages: modelMessages,
  tools,
  stopWhen: stepCountIs(5),
  onFinish: async () => { /* persist */ },
})
return result.toUIMessageStreamResponse()
```

**Delta for CRM bots:** Use `generateText` (not `streamText`) because callers are agents, not humans — they want a single JSON response. Model upgrade per CONTEXT.md Decision: `claude-sonnet-4-5` (not the `-20250514` used by builder).

---

### Inngest cron pattern

**Source:** `src/inngest/functions/close-stale-sessions.ts` (full 54 lines) + `observability-purge.ts` (multi-step example)
**Apply to:** `crm-bot-expire-proposals.ts`

**Cron string with timezone** (close-stale-sessions line 35):
```typescript
{ cron: 'TZ=America/Bogota 0 2 * * *' },  // daily at 02:00 Bogota
// For CRM: 'TZ=America/Bogota */1 * * * *' (every 1 min)
```

**Retry policy** (line 34): `retries: 1`

**Module logger** (line 14): `const logger = createModuleLogger('crm-bot-expire-proposals')`

---

### Workspace scope enforcement

**Source:** Every domain function (example: `src/lib/domain/contacts.ts` line 112-115)
**Apply to:** Every new SQL query in reader/writer tools + two-step.ts

**Rule:** Every `.from(...)` query MUST include `.eq('workspace_id', ctx.workspaceId)`. NEVER accept workspace_id from request body. Only read from middleware-set header `x-workspace-id`. (RESEARCH Pitfall 4.)

---

## No Analog Found

| File | Role | Data Flow | Reason | Fallback |
|------|------|-----------|--------|----------|
| `src/lib/agents/crm-writer/two-step.ts` | state-machine service | event-driven | No existing propose/confirm flow in repo | Use `sms_atomic_rpc` as idempotency precedent; use plain Postgres optimistic UPDATE pattern from RESEARCH.md |
| `src/lib/agents/_shared/alerts.ts` | email send | fire-and-forget | Zero email infra in repo (STATE.md: Supabase SMTP "pending todo") | Install `resend` as net-new dep, use code sample in RESEARCH.md "Email alert via Resend" |

---

## Metadata

**Analog search scope:**
- `src/lib/agents/*` (all agent folders, focused on godentist, builder)
- `src/lib/domain/*` (contacts, orders, notes, tasks, tags)
- `src/lib/observability/*` (collector, context, anthropic-instrumented)
- `src/lib/auth/api-key.ts`
- `src/lib/tools/rate-limiter.ts`, `src/lib/tools/types.ts`
- `src/app/api/v1/tools/[toolName]/route.ts`
- `src/app/api/builder/chat/route.ts`
- `src/app/api/inngest/route.ts`
- `src/inngest/functions/*` (close-stale-sessions, observability-purge, agent-production)
- `supabase/migrations/*` (observability schema, sms atomic rpc)
- `middleware.ts`

**Files scanned:** ~40

**Pattern extraction date:** 2026-04-18

**Key insight for planner:** This phase is **wiring, not greenfield**. Of the 35 new files, 33 have direct in-repo analogs. The only genuinely new primitives are (1) the two-step propose/confirm state machine (map from SMS atomic RPC idempotency pattern), (2) Resend email alerts (net-new dep, follow RESEARCH code sample), and (3) `runWithCollector` adapted for `triggerKind: 'api'` outside an Inngest handler (new frame — document in plan).
